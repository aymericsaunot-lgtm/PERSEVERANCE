#!/usr/bin/env python3
"""Phone notifications for Perceverance.

GitHub Actions runs this every 10 minutes or so (.github/workflows/notify.yml). For every
account it reads the notification settings (users/<uid>/meta/settings, field "notify"), the
phones that turned notifications on (users/<uid>/devices) and the data the messages are
about, then sends what is due with Web Push. users/<uid>/server/notified remembers what
went out, so nothing is sent twice.

What is sent, each one can be switched off in Settings > Notifications:
  both spaces   morning brief, habits left in the evening, a test on request
  Research      deadlines (a week and a day before), beamtimes (three days before),
                new arXiv matches, surf the evening before a good or great day
  Studio        projects due tomorrow and today, overdue invoices, quotes waiting a week,
                the end of an overnight fast

Environment (GitHub secrets):
  FIREBASE_SERVICE_ACCOUNT  JSON of a Firebase service account key (the arXiv watch one)
  VAPID_PRIVATE_KEY         private key that matches push.publicKey in config.js
  VAPID_SUBJECT             optional; by default https://<owner>.github.io

Local check of the rules, no Firebase and no network:
  python scripts/notify.py --self-test
"""

import argparse
import json
import math
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

APP = "Perceverance"
HOUR_MS = 3600 * 1000
DAY_MS = 24 * HOUR_MS
WINDOW_MIN = 3 * 60          # a late run may still send this long after the chosen time
SURF_EVENING = (19 * 60, 22 * 60)
FAST_STALE_MS = 6 * HOUR_MS  # an old fast nobody closed: stay quiet
KEEP_LOG_MS = 60 * DAY_MS
DEFAULT_NOTIFY = {
    "morning": True, "morningAt": "08:00", "evening": True, "eveningAt": "21:00",
    "deadlines": True, "arxiv": True, "surf": True,
    "projects": True, "invoices": True, "fasting": True, "tz": "",
}
DEFAULT_SURF = {"name": "Hendaye", "lat": 43.375, "lon": -1.772, "facing": 340}
SCORE_LABEL = ["Flat or blown out", "Poor", "Fair", "Good", "Great"]
SYMBOL = {"EUR": "€", "GBP": "£", "USD": "US$", "CAD": "CA$", "AUD": "A$"}


# ---------------------------------------------------------------- small helpers

def minutes_of(hhmm, default):
    m = re.match(r"^(\d{1,2}):(\d{2})", str(hhmm or ""))
    if m and int(m.group(1)) < 24 and int(m.group(2)) < 60:
        return int(m.group(1)) * 60 + int(m.group(2))
    return default


def in_window(local, start_min, length=WINDOW_MIN):
    now = local.hour * 60 + local.minute
    return start_min <= now < start_min + length


def days_between(a, b):
    try:
        return (date.fromisoformat(b) - date.fromisoformat(a)).days
    except (TypeError, ValueError):
        return None


def join_and(items):
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def listing(items, n=3):
    items = [i for i in items if i]
    if len(items) <= n:
        return join_and(items)
    return ", ".join(items[:n]) + f" and {len(items) - n} more"


def plural(n, one, many=None):
    return f"{n} {one if n == 1 else (many or one + 's')}"


def money(amount, cur):
    try:
        v = float(amount or 0)
    except (TypeError, ValueError):
        v = 0.0
    text = f"{v:,.0f}" if v == int(v) else f"{v:,.2f}"
    return f"{SYMBOL[cur]}{text}" if cur in SYMBOL else f"{cur} {text}"


def short_date(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {d:%b}"


def weekday(iso):
    return f"{date.fromisoformat(iso):%A}"


def clock(ms, tz):
    return datetime.fromtimestamp(ms / 1000, tz).strftime("%H:%M")


def today_tasks(tasks, today):
    """Same rule as the app: not done, and due today or earlier, or starred."""
    out = [t for t in tasks if not t.get("done") and ((t.get("due") and t["due"] <= today) or t.get("starred"))]
    return sorted(out, key=lambda t: (t.get("due") or "9999", t.get("title") or ""))


def task_line(tasks):
    if not tasks:
        return ""
    return f"{plural(len(tasks), 'task')}: {listing([t.get('title', '') for t in tasks])}."


# ---------------------------------------------------------------- surf (same scoring as js/lib/surf.js)

def angle_diff(a, b):
    return abs(((a - b + 540) % 360) - 180)


def wind_relation(wind_from, facing):
    if wind_from is None or facing is None or facing == "":
        return ""
    f = float(facing)
    if angle_diff(wind_from, (f + 180) % 360) <= 45:
        return "offshore"
    if angle_diff(wind_from, f) <= 45:
        return "onshore"
    return "cross-shore"


def score_hour(height, period, wind, rel):
    if height is None:
        return 0
    s = 0 if height < 0.3 else 1 if height < 0.6 else 2 if height < 0.9 else 3 if height <= 2.5 else 2 if height <= 3.5 else 1
    if period is not None:
        s += 1 if period >= 12 else 0.5 if period >= 9 else -1 if period < 7 else 0
    if wind is not None:
        if rel == "offshore":
            s += 0.5 if wind <= 30 else -0.5
        elif rel == "onshore":
            s -= 0 if wind < 8 else 1 if wind < 15 else 2
        else:
            s -= 1 if wind > 20 else 0.5 if wind > 12 else 0
    return max(0, min(4, math.floor(s + 0.5)))  # rounds like Math.round


def best_window(fc, facing, day_iso, not_before=None):
    """Best daylight hour of a local day: {score, label, height, period, wind, rel} or None."""
    marine, wind = fc
    hours = marine.get("hourly") or {}
    times = hours.get("time") or []
    off = marine.get("utc_offset_seconds") or 0
    local_day = lambda s: datetime.fromtimestamp(s + off, timezone.utc).date().isoformat()
    first = lambda *vals: next((v for v in vals if v is not None), None)
    pick = lambda name, i: (hours.get(name) or [None] * len(times))[i] if i < len(hours.get(name) or []) else None
    w_hours = wind.get("hourly") or {}
    w_idx = {t: j for j, t in enumerate(w_hours.get("time") or [])}
    rise = set_ = None
    daily = wind.get("daily") or {}
    for k, d in enumerate(daily.get("time") or []):
        if local_day(d) == day_iso:
            rise, set_ = daily["sunrise"][k], daily["sunset"][k]
    best = None
    for i, t in enumerate(times):
        if local_day(t) != day_iso:
            continue
        if rise is not None and (t < rise or t > set_ - 1800):
            continue
        if not_before is not None and t < not_before:
            continue
        height = first(pick("swell_wave_height", i), pick("wave_height", i))
        period = first(pick("swell_wave_period", i), pick("wave_period", i))
        j = w_idx.get(t)
        speed = w_hours["wind_speed_10m"][j] if j is not None else None
        rel = wind_relation(w_hours["wind_direction_10m"][j] if j is not None else None, facing)
        score = score_hour(height, period, speed, rel)
        better = best is None or score > best["score"] or (
            score == best["score"] and (speed if speed is not None else 99) < (best["wind"] if best["wind"] is not None else 99))
        if better:
            best = {"score": score, "t": t, "height": height, "period": period, "wind": speed, "rel": rel}
    if best:
        best["label"] = datetime.fromtimestamp(best["t"] + off, timezone.utc).strftime("%H:%M")
    return best


def surf_words(b):
    bits = []
    if b["height"] is not None:
        bits.append(f"{b['height']:.1f} m" + (f" at {round(b['period'])} s" if b["period"] is not None else ""))
    if b["wind"] is not None:
        bits.append(f"{b['rel'] + ' ' if b['rel'] else ''}wind {round(b['wind'])} km/h")
    return ", ".join(bits)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "perceverance-notify/1.0"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read())


def load_forecast(spot):
    q = f"latitude={spot['lat']}&longitude={spot['lon']}&timezone=auto&timeformat=unixtime&forecast_days=3"
    marine = fetch_json("https://marine-api.open-meteo.com/v1/marine?" + q + "&cell_selection=sea"
                        "&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period")
    wind = fetch_json("https://api.open-meteo.com/v1/forecast?" + q + "&hourly=wind_speed_10m,wind_direction_10m&daily=sunrise,sunset")
    return marine, wind


# ---------------------------------------------------------------- what is due

class Plan:
    def __init__(self, icon):
        self.messages = []   # {key, title, body, url, tag, ttl}
        self.log = {}        # keys to remember once delivered
        self.fasts = []      # fast ids to mark as announced
        self.icon = icon

    def send(self, key, title, body, url, tag, ttl=4 * 3600):
        self.messages.append({"key": key, "title": title, "body": body, "url": url, "tag": tag, "ttl": ttl})


def plan(now_utc, settings, log, src, forecast=None):
    """Everything due for one account at now_utc. src.list(name) and src.doc(col, id) read its
    data; forecast(spot) returns Open-Meteo data. Nothing here sends or writes."""
    n = {**DEFAULT_NOTIFY, **(settings.get("notify") or {})}
    on = lambda key: n.get(key) is not False
    try:
        tz = ZoneInfo(n.get("tz") or "UTC")
    except Exception:
        tz = timezone.utc
    local = now_utc.astimezone(tz)
    today = local.date().isoformat()
    tomorrow = (local.date() + timedelta(days=1)).isoformat()
    now_ms = int(now_utc.timestamp() * 1000)
    studio = settings.get("edition") == "studio"
    p = Plan(settings.get("appIcon") or ("bold" if studio else "sunset"))
    morning_at = minutes_of(n.get("morningAt"), 8 * 60)
    seen = lambda key: key in log

    test_at = n.get("testAt") or 0
    if isinstance(test_at, (int, float)) and test_at > (log.get("test") or 0) and now_ms - test_at < 2 * HOUR_MS:
        p.send("test", APP, "Notifications from the server work. You are all set.", "./#/settings", "test")
        p.log["test"] = test_at

    spot = {**DEFAULT_SURF, **(settings.get("surf") or {})}
    fc_cache = {}

    def fc():
        if "v" not in fc_cache:
            try:
                fc_cache["v"] = forecast(spot) if forecast else None
            except Exception as e:  # the forecast is a bonus: never block the rest
                print(f"  surf forecast unavailable: {e}", file=sys.stderr)
                fc_cache["v"] = None
        return fc_cache["v"]

    # Morning: the brief and the date reminders, once a day.
    if log.get("am") != today and in_window(local, morning_at):
        p.log["am"] = today
        brief = [task_line(today_tasks(src.list("tasks"), today))]
        if studio:
            projects = [x for x in src.list("projects") if x.get("stage") != "done" and x.get("due")]
            due_now = [x for x in projects if x["due"] <= today]
            soon = sorted((x for x in projects if today < x["due"] <= (local.date() + timedelta(days=7)).isoformat()), key=lambda x: x["due"])
            if due_now:
                brief.append(f"Due today: {listing([x.get('title', '') for x in due_now])}.")
            elif soon:
                brief.append(f"Next due: {soon[0].get('title', '')}, {'tomorrow' if soon[0]['due'] == tomorrow else weekday(soon[0]['due'])}.")
            sent = [i for i in src.list("invoices") if i.get("kind") != "quote" and i.get("status") == "sent"]
            late = [i for i in sent if i.get("due") and i["due"] < today]
            if late:
                cur = settings.get("currency") or "EUR"
                brief.append(f"{plural(len(late), 'invoice')} overdue, {money(sum(float(i.get('amount') or 0) for i in late), cur)}.")
            fasting = [f for f in src.list("fasts") if not f.get("end") and f.get("start")]
            if fasting:
                f = max(fasting, key=lambda f: f["start"])
                done_at = f["start"] + float(f.get("target") or settings.get("fastHours") or 12) * HOUR_MS
                if done_at > now_ms:
                    brief.append(f"Fasting: you can eat from {clock(done_at, tz)}.")
        else:
            nxt = []
            for d in src.list("deadlines"):
                gap = days_between(today, d.get("date"))
                if not d.get("done") and gap is not None and 0 <= gap <= 30:
                    nxt.append((gap, d.get("title", "")))
            for b in src.list("beamtimes"):
                gap = days_between(today, b.get("start"))
                if gap is not None and 0 <= gap <= 30:
                    nxt.append((gap, f"beamtime at {b.get('facility', '')}"))
            if nxt:
                gap, title = min(nxt)
                when = "today" if gap == 0 else "tomorrow" if gap == 1 else f"in {gap} days"
                brief.append(f"Next: {title[:1].upper() + title[1:]} {when}.")
            if on("surf") and fc():
                b = best_window(fc(), spot.get("facing"), today, not_before=now_utc.timestamp() - 3600)
                if b:
                    brief.append(f"Surf: {SCORE_LABEL[b['score']].lower()}" + (f", best around {b['label']}, {surf_words(b)}." if b["score"] >= 2 else "."))
        brief = [line for line in brief if line]
        if on("morning") and brief:
            p.send(f"brief:{today}", f"{local:%A} {local.day} {local:%B}", "\n".join(brief), "./#/today", "brief")

        if studio:
            if on("projects"):
                for x in src.list("projects"):
                    gap = days_between(today, x.get("due"))
                    if x.get("stage") == "done" or gap not in (0, 1):
                        continue
                    key = f"project:{x['id']}:{x['due']}:{gap}"
                    if not seen(key):
                        p.send(key, f"{x.get('title', 'A project')} is due {'today' if gap == 0 else 'tomorrow'}",
                               "Open it to check what is left." if gap == 1 else "Last day: good luck with the delivery.",
                               "./#/projects", f"project-{x['id']}")
            if on("invoices"):
                names = None
                for i in src.list("invoices"):
                    if i.get("status") != "sent":
                        continue
                    if names is None:
                        names = {c["id"]: c.get("name", "") for c in src.list("clients")}
                    who = names.get(i.get("clientId")) or "the client"
                    cur = settings.get("currency") or "EUR"
                    if i.get("kind") == "quote":
                        sent_at = i.get("sentAt") or 0
                        key = f"quote:{i['id']}"
                        if sent_at and now_ms - sent_at >= 7 * DAY_MS and not seen(key):
                            p.send(key, f"Quote {i.get('number', '')} has waited a week".replace("  ", " "),
                                   f"No answer from {who} yet. A short follow-up?", "./#/money", f"quote-{i['id']}")
                    elif i.get("due") and i["due"] < today:
                        key = f"overdue:{i['id']}:{i['due']}"
                        if not seen(key):
                            p.send(key, f"Invoice {i.get('number', '')} is overdue".replace("  ", " "),
                                   f"{money(i.get('amount'), cur)} from {who}, due {short_date(i['due'])}. Worth a polite reminder.",
                                   "./#/money", f"invoice-{i['id']}")
        elif on("deadlines"):
            for d in src.list("deadlines"):
                gap = days_between(today, d.get("date"))
                if d.get("done") or gap not in (1, 7):
                    continue
                key = f"deadline:{d['id']}:{d['date']}:{gap}"
                if not seen(key):
                    p.send(key, f"{d.get('title', 'A deadline')} {'tomorrow' if gap == 1 else 'in a week'}",
                           f"{weekday(d['date'])} {short_date(d['date'])}" + (f", {d['facility']}." if d.get("facility") else "."),
                           "./#/phd", f"deadline-{d['id']}")
            for b in src.list("beamtimes"):
                gap = days_between(today, b.get("start"))
                key = f"beamtime:{b['id']}:{b.get('start')}"
                if gap == 3 and not seen(key):
                    where = " ".join(x for x in (b.get("facility"), b.get("beamline")) if x)
                    p.send(key, f"Beamtime in 3 days", f"{where}, from {weekday(b['start'])} {short_date(b['start'])}. Time to pack the samples.",
                           "./#/phd", f"beamtime-{b['id']}")

    # arXiv: after the weekday check, not before the morning time.
    if not studio and on("arxiv") and local.hour * 60 + local.minute >= morning_at:
        status = src.doc("meta", "arxiv") or {}
        last, new = status.get("lastRun") or 0, status.get("lastNew") or 0
        if new > 0 and now_ms - last < 20 * HOUR_MS and log.get("arxiv") != last:
            latest = sorted((a for a in src.list("arxiv") if a.get("status") == "new"), key=lambda a: -(a.get("fetchedAt") or 0))
            titles = [clean_title(a.get("title", "")) for a in latest[:2]]
            p.send("arxiv", f"{plural(new, 'new arXiv match', 'new arXiv matches')}", listing(titles, 2) or "Open the watch to read them.",
                   "./#/papers/watch", "arxiv", ttl=12 * 3600)
            p.log["arxiv"] = last

    # Surf, the evening before a good or great day.
    if not studio and on("surf") and log.get("surf") != today and in_window(local, SURF_EVENING[0], SURF_EVENING[1] - SURF_EVENING[0]):
        p.log["surf"] = today
        b = best_window(fc(), spot.get("facing"), tomorrow) if fc() else None
        if b and b["score"] >= 3:
            p.send(f"surf:{tomorrow}", f"Tomorrow looks {SCORE_LABEL[b['score']].lower()} at {spot.get('name') or 'your spot'}",
                   f"Best around {b['label']}: {surf_words(b)}.", "./#/life", "surf", ttl=10 * 3600)

    # Evening: habits still to tick, only if there are some.
    if log.get("pm") != today and in_window(local, minutes_of(n.get("eveningAt"), 21 * 60)):
        p.log["pm"] = today
        if on("evening"):
            habits = [h for h in src.list("habits") if not h.get("archived")]
            left = [h.get("name", "") for h in sorted(habits, key=lambda h: h.get("order") or 0) if today not in (h.get("days") or [])]
            if left:
                p.send(f"habits:{today}", f"{plural(len(left), 'habit')} left today", f"{listing(left)}. Still time to tick {'it' if len(left) == 1 else 'them'}.",
                       "./#/life" if not studio else "./#/life", "habits", ttl=3 * 3600)

    # Fasting: as soon as the hours are done.
    if studio and on("fasting"):
        for f in src.list("fasts"):
            if f.get("end") or not f.get("start") or f.get("notifiedAt"):
                continue
            hours = float(f.get("target") or settings.get("fastHours") or 12)
            done_at = f["start"] + hours * HOUR_MS
            if done_at <= now_ms < done_at + FAST_STALE_MS:
                p.send(f"fast:{f['id']}", f"{hours:g} hours done. You can eat.",
                       f"Fasting since {clock(f['start'], tz)}. Tap to end the fast when you have breakfast.", "./#/today", "fast", ttl=6 * 3600)
                p.fasts.append(f["id"])
    return p


def clean_title(title):
    try:
        from arxiv_watch import latex_to_plain
        return latex_to_plain(title)
    except ImportError:
        return re.sub(r"[$\\{}]", "", title)


def merge_log(log, plan_log, sent_keys, now_ms):
    """The log after a run: day markers, delivered message keys, old entries dropped."""
    out = {k: v for k, v in log.items() if not (isinstance(v, (int, float)) and v < now_ms - KEEP_LOG_MS)}
    out.update(plan_log)
    for key in sent_keys:
        if key not in ("test", "arxiv"):
            out[key] = now_ms
    return out


# ---------------------------------------------------------------- Firestore and Web Push

def vapid_subject():
    """Who sends: the push services want a mailto: or a bare https:// host (no path)."""
    if os.environ.get("VAPID_SUBJECT", "").strip():
        return os.environ["VAPID_SUBJECT"].strip()
    owner = os.environ.get("GITHUB_REPOSITORY", "").partition("/")[0]
    return f"https://{owner.lower()}.github.io" if owner else "https://github.com"


class FirestoreSource:
    QUERIES = {"tasks": ("done", "==", False), "invoices": ("status", "==", "sent"), "fasts": ("end", "==", None)}

    def __init__(self, ref):
        self.ref = ref
        self.cache = {}

    def list(self, name):
        if name not in self.cache:
            col = self.ref.collection(name)
            if name in self.QUERIES:
                field, op, value = self.QUERIES[name]
                try:
                    from google.cloud.firestore_v1 import FieldFilter
                    col = col.where(filter=FieldFilter(field, op, value))
                except ImportError:
                    col = col.where(field, op, value)
            self.cache[name] = [{**(s.to_dict() or {}), "id": s.id} for s in col.stream()]
        return self.cache[name]

    def doc(self, col, doc_id):
        snap = self.ref.collection(col).document(doc_id).get()
        return snap.to_dict() if snap.exists else None


def run_user(ref, now, key, subject, dry_run):
    from pywebpush import WebPushException, webpush

    devices = [{**(s.to_dict() or {}), "id": s.id} for s in ref.collection("devices").stream()]
    devices = [d for d in devices if d.get("endpoint") and (d.get("keys") or {}).get("p256dh")]
    if not devices:
        return
    src = FirestoreSource(ref)
    settings = src.doc("meta", "settings") or {}
    log_ref = ref.collection("server").document("notified")
    snap = log_ref.get()
    log = (snap.to_dict() or {}) if snap.exists else {}
    now_ms = int(now.timestamp() * 1000)
    p = plan(now, settings, log, src, forecast=load_forecast)
    who = ref.id[:6]
    if not p.messages and not p.log:
        return

    sent, gone, failed = [], set(), 0
    for m in p.messages:
        payload = json.dumps({"title": m["title"], "body": m["body"], "url": m["url"], "tag": m["tag"], "icon": f"icons/{p.icon}-192.png"})
        delivered = False
        for d in devices:
            if d["id"] in gone:
                continue
            if dry_run:
                print(f"  [{who}] would send to {d.get('label') or d['id']}: {m['title']} | {m['body']!r}")
                delivered = True
                continue
            try:
                # A fresh claims dict per call: webpush fills in "aud" for the endpoint's push service.
                webpush(subscription_info={"endpoint": d["endpoint"], "keys": d["keys"]}, data=payload,
                        vapid_private_key=key, vapid_claims={"sub": subject}, ttl=m["ttl"], timeout=20)
                delivered = True
            except WebPushException as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status in (404, 410):
                    gone.add(d["id"])
                else:
                    failed += 1
                    print(f"  [{who}] push failed ({status}): {e}", file=sys.stderr)
            except Exception as e:  # network trouble: count it, keep going
                failed += 1
                print(f"  [{who}] push failed: {type(e).__name__}: {e}", file=sys.stderr)
        if delivered:
            sent.append(m["key"])
            print(f"  [{who}] sent: {m['title']}")

    if dry_run:
        return
    for did in gone:
        ref.collection("devices").document(did).delete()
        print(f"  [{who}] removed a device that unsubscribed")
    if failed and not sent:
        print(f"  [{who}] nothing delivered; will try again next run", file=sys.stderr)
        return
    log_ref.set(merge_log(log, p.log, sent, now_ms))
    for fid in p.fasts:
        if f"fast:{fid}" in sent:
            ref.collection("fasts").document(fid).update({"notifiedAt": now_ms})


def main():
    ap = argparse.ArgumentParser(description="Send the notifications that are due.")
    ap.add_argument("--dry-run", action="store_true", help="print what would be sent; send and write nothing")
    ap.add_argument("--self-test", action="store_true", help="check the rules on sample data, offline")
    args = ap.parse_args()
    if args.self_test:
        return self_test()

    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    key = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if not raw or (not key and not args.dry_run):
        # A warning, not a failure: a failing schedule would email you every ten minutes.
        print("::warning::Notifications are not set up: add the FIREBASE_SERVICE_ACCOUNT and VAPID_PRIVATE_KEY secrets (README, Notifications).")
        return
    import firebase_admin
    from firebase_admin import credentials, firestore
    firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
    db = firestore.client()
    now = datetime.now(timezone.utc)
    subject = vapid_subject()
    users = list(db.collection("users").list_documents())
    print(f"{now:%Y-%m-%d %H:%M} UTC, {plural(len(users), 'account')}")
    for ref in users:
        try:
            run_user(ref, now, key, subject, args.dry_run)
        except Exception as e:  # one account must not stop the others
            print(f"::warning::{ref.id[:6]}: {type(e).__name__}: {e}")


# ---------------------------------------------------------------- self-test

class FakeSource:
    def __init__(self, lists, docs=None):
        self.lists, self.docs = lists, docs or {}

    def list(self, name):
        return self.lists.get(name, [])

    def doc(self, col, doc_id):
        return self.docs.get(f"{col}/{doc_id}")


def self_test():
    paris = ZoneInfo("Europe/Paris")
    at = lambda s: datetime.fromisoformat(s).replace(tzinfo=paris).astimezone(timezone.utc)
    ms = lambda s: int(at(s).timestamp() * 1000)
    checks = 0

    def check(cond, what):
        nonlocal checks
        checks += 1
        if not cond:
            raise AssertionError(what)

    # Studio, Sunday 11 October 2026.
    studio = {"edition": "studio", "currency": "EUR", "fastHours": 12, "notify": {"tz": "Europe/Paris", "morningAt": "08:00"}}
    data = FakeSource({
        "tasks": [{"id": "t1", "title": "Send logo files", "due": "2026-10-11", "done": False},
                  {"id": "t2", "title": "Call printer", "due": "2026-10-09", "done": False},
                  {"id": "t3", "title": "Later", "due": "2026-10-20", "done": False}],
        "projects": [{"id": "p1", "title": "Bakery branding", "stage": "design", "due": "2026-10-12"},
                     {"id": "p2", "title": "Old", "stage": "done", "due": "2026-10-11"}],
        "invoices": [{"id": "i1", "kind": "invoice", "number": "F-2026-004", "clientId": "c1", "amount": 1200, "due": "2026-10-01", "status": "sent"},
                     {"id": "q1", "kind": "quote", "number": "Q-2026-003", "clientId": "c1", "amount": 800, "status": "sent", "sentAt": ms("2026-10-02T10:00")}],
        "clients": [{"id": "c1", "name": "Maison Lune"}],
        "fasts": [{"id": "f1", "start": ms("2026-10-10T21:10"), "end": None, "target": 12}],
        "habits": [{"id": "h1", "name": "Stretch", "order": 1, "days": ["2026-10-11"]}, {"id": "h2", "name": "Read", "order": 2, "days": []}],
    })
    p = plan(at("2026-10-11T07:59"), studio, {}, data)
    check([m["key"] for m in p.messages] == [], f"nothing before 08:00 and before the fast ends: {p.messages}")
    p = plan(at("2026-10-11T08:04"), studio, {}, data)
    keys = [m["key"] for m in p.messages]
    check(keys[0] == "brief:2026-10-11", keys)
    brief = p.messages[0]["body"]
    check("2 tasks: Call printer and Send logo files." in brief, brief)
    check("Next due: Bakery branding, tomorrow." in brief, brief)
    check("1 invoice overdue, €1,200." in brief, brief)
    check("Fasting: you can eat from 09:10." in brief, brief)
    check("project:p1:2026-10-12:1" in keys and "overdue:i1:2026-10-01" in keys and "quote:q1" in keys, keys)
    check("fast:f1" not in keys, "fast not done at 08:04")
    check(p.log.get("am") == "2026-10-11", p.log)
    log = merge_log({}, p.log, keys, ms("2026-10-11T08:04"))
    p = plan(at("2026-10-11T08:14"), studio, log, data)
    check(p.messages == [], f"morning sent once: {p.messages}")
    p = plan(at("2026-10-11T09:12"), studio, log, data)
    check([m["key"] for m in p.messages] == ["fast:f1"] and p.fasts == ["f1"], p.messages)
    check(p.messages[0]["title"] == "12 hours done. You can eat.", p.messages[0]["title"])
    check("since 21:10" in p.messages[0]["body"], p.messages[0]["body"])
    p = plan(at("2026-10-11T16:00"), studio, log, data)
    check(p.messages == [], "an old fast stays quiet")
    p = plan(at("2026-10-11T21:05"), studio, log, data)
    check([m["key"] for m in p.messages] == ["habits:2026-10-11"] and p.messages[0]["body"].startswith("Read."), p.messages)
    off = {**studio, "notify": {**studio["notify"], "fasting": False, "invoices": False, "morning": False}}
    p = plan(at("2026-10-11T09:12"), off, {}, data)
    keys = [m["key"] for m in p.messages]
    check(keys == ["project:p1:2026-10-12:1"], f"switched off: {keys}")
    late = plan(at("2026-10-11T11:30"), studio, {}, data)
    check(not any(m["key"].startswith("brief") for m in late.messages), "no brief after the 3 hour window")

    # Research, with a forecast fixture: tomorrow 09:00 is good, today is small.
    def fc(spot):
        base = int(at("2026-10-11T00:00").timestamp())
        times = [base + h * 3600 for h in range(48)]
        height = [0.4] * 24 + [1.6] * 24
        period = [8] * 24 + [12] * 24
        wdir = [160] * 48  # from the SSE: offshore for a beach facing NNW (340)
        return ({"utc_offset_seconds": 7200, "hourly": {"time": times, "swell_wave_height": height, "swell_wave_period": period}},
                {"hourly": {"time": times, "wind_speed_10m": [8] * 48, "wind_direction_10m": wdir},
                 "daily": {"time": [base, base + 86400], "sunrise": [base + 8 * 3600, base + 86400 + 8 * 3600], "sunset": [base + 19 * 3600, base + 86400 + 19 * 3600]}})

    research = {"edition": "research", "surf": {"name": "Hendaye", "lat": 43.375, "lon": -1.772, "facing": 340},
                "notify": {"tz": "Europe/Paris", "morningAt": "08:00", "testAt": ms("2026-10-11T08:00")}}
    rdata = FakeSource({
        "tasks": [{"id": "t1", "title": "Fit ARPES data", "starred": True, "done": False}],
        "deadlines": [{"id": "d1", "title": "ESRF proposal", "date": "2026-10-18", "done": False, "facility": "ESRF"},
                      {"id": "d2", "title": "Abstract", "date": "2026-10-12", "done": True}],
        "beamtimes": [{"id": "b1", "facility": "BESSY II", "beamline": "BLOCH", "start": "2026-10-14", "end": "2026-10-17"}],
        "arxiv": [{"id": "a1", "title": "Rashba splitting in MnBi$_2$Te$_4$", "status": "new", "fetchedAt": ms("2026-10-11T07:25")}],
        "habits": [{"id": "h1", "name": "Surf", "days": ["2026-10-11"]}],
    }, {"meta/arxiv": {"lastRun": ms("2026-10-11T07:25"), "lastNew": 1}})
    p = plan(at("2026-10-11T08:02"), research, {}, rdata, forecast=fc)
    keys = [m["key"] for m in p.messages]
    check(keys[0] == "test" and "brief:2026-10-11" in keys, keys)
    brief = next(m["body"] for m in p.messages if m["key"].startswith("brief"))
    check("1 task: Fit ARPES data." in brief, brief)
    check("Next: Beamtime at BESSY II in 3 days." in brief, brief)
    check("Surf: fair, best around 08:00, 0.4 m at 8 s, offshore wind 8 km/h." in brief, brief)
    check("deadline:d1:2026-10-18:7" in keys and "beamtime:b1:2026-10-14" in keys, keys)
    arx = next(m for m in p.messages if m["key"] == "arxiv")
    check(arx["title"] == "1 new arXiv match" and "MnBi2Te4" in arx["body"], arx)
    log = merge_log({}, p.log, keys, ms("2026-10-11T08:02"))
    check(log["test"] == research["notify"]["testAt"] and "arxiv" in log, log)
    p = plan(at("2026-10-11T08:12"), research, log, rdata, forecast=fc)
    check(p.messages == [], f"research morning sent once: {p.messages}")
    p = plan(at("2026-10-11T19:03"), research, log, rdata, forecast=fc)
    check([m["key"] for m in p.messages] == ["surf:2026-10-12"], p.messages)
    check(p.messages[0]["title"] == "Tomorrow looks great at Hendaye", p.messages[0]["title"])
    check(p.messages[0]["body"] == "Best around 08:00: 1.6 m at 12 s, offshore wind 8 km/h.", p.messages[0]["body"])
    p = plan(at("2026-10-11T21:01"), research, {**log, "surf": "2026-10-11"}, rdata, forecast=fc)
    check(p.messages == [] and p.log.get("pm") == "2026-10-11", f"habits all ticked: {p.messages}")
    broken = lambda spot: (_ for _ in ()).throw(OSError("offline"))
    p = plan(at("2026-10-11T08:02"), research, {}, rdata, forecast=broken)
    check(any(m["key"].startswith("brief") for m in p.messages), "brief without the surf when the forecast fails")

    # Scoring parity with js/lib/surf.js and the log pruning.
    check(score_hour(1.0, 10, 10, "cross-shore") == 4, "3 + 0.5 rounds up to 4 like Math.round")
    check(score_hour(0.5, 6, 20, "onshore") == 0, "small, short and onshore")
    check(wind_relation(160, 340) == "offshore" and wind_relation(340, 340) == "onshore", "wind relation")
    old = merge_log({"overdue:x:2026-01-01": 1, "am": "2026-10-10"}, {}, [], ms("2026-10-11T08:00"))
    check("overdue:x:2026-01-01" not in old and old["am"] == "2026-10-10", old)
    check(money(1200, "EUR") == "€1,200" and money(99.5, "CHF") == "CHF 99.50", money(99.5, "CHF"))
    print(f"self-test passed: {checks} checks")


if __name__ == "__main__":
    main()
