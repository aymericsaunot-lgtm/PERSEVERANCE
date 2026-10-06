#!/usr/bin/env python3
"""Daily arXiv watch for the dashboard.

Reads your keywords and categories from Firestore (users/<uid>/meta/settings),
fetches the latest arXiv announcements from rss.arxiv.org, keeps the papers that
match, and stores them in users/<uid>/arxiv so they appear in the app.

Matching rules (same as the app):
  - every word of a keyword must appear in the title or abstract, in any order
  - "quoted text" must appear as a phrase
  - author:Name matches an author
  - case, accents and LaTeX markup are ignored (MnBi2Te4 matches MnBi$_2$Te$_4$)

Environment (set as GitHub secrets):
  FIREBASE_SERVICE_ACCOUNT  JSON of a Firebase service account key
  DASHBOARD_UID             your Firebase user ID

Local test without Firebase:
  python scripts/arxiv_watch.py --dry-run --keywords "MnBi2Te4, Rashba crystal, moiré"
"""

import argparse
import email.utils
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

RSS_URL = "https://rss.arxiv.org/rss/{cat}"
NS = {"arxiv": "http://arxiv.org/schemas/atom", "dc": "http://purl.org/dc/elements/1.1/"}
DEFAULT_KEYWORDS = ["MnBi2Te4", "Rashba crystal", "moiré"]
DEFAULT_CATEGORIES = ["cond-mat"]
KEEP_TYPES = {"new", "cross"}
KEEP_DAYS = 30
USER_AGENT = "personal-dashboard-arxiv-watch/1.0 (one request per category per day)"

COMBINING = {
    "'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303",
    "=": "\u0304", ".": "\u0307", "u": "\u0306", "v": "\u030C", "H": "\u030B",
    "c": "\u0327", "r": "\u030A", "k": "\u0328", "b": "\u0331", "d": "\u0323",
}
TEXT_SYMBOLS = {
    "ss": "ß", "o": "ø", "O": "Ø", "aa": "å", "AA": "Å", "ae": "æ", "AE": "Æ",
    "oe": "œ", "OE": "Œ", "l": "ł", "L": "Ł", "i": "ı", "j": "ȷ",
}
GREEK = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ϵ", "varepsilon": "ε",
    "zeta": "ζ", "eta": "η", "theta": "θ", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν",
    "xi": "ξ", "pi": "π", "rho": "ρ", "sigma": "σ", "tau": "τ", "phi": "ϕ", "varphi": "φ",
    "chi": "χ", "psi": "ψ", "omega": "ω", "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ",
    "Lambda": "Λ", "Xi": "Ξ", "Pi": "Π", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
}


def latex_to_plain(s):
    """Drop LaTeX markup but keep the letters: CrI$_3$ -> CrI3, Garc\\'ia -> García."""
    s = s or ""
    s = re.sub(r"\\([`'^\"~=.])\s*(?:\{\s*\\?([a-zA-Z])\s*\}|\\?([a-zA-Z]))",
               lambda m: unicodedata.normalize("NFC", (m.group(2) or m.group(3)) + COMBINING[m.group(1)]), s)
    s = re.sub(r"\\([uvHcrkbd])\s*\{\s*\\?([a-zA-Z])\s*\}",
               lambda m: unicodedata.normalize("NFC", m.group(2) + COMBINING[m.group(1)]), s)
    s = re.sub(r"\{\\(ss|o|O|aa|AA|ae|AE|oe|OE|l|L|i|j)\}", lambda m: TEXT_SYMBOLS[m.group(1)], s)
    s = re.sub(r"\\(ss|aa|AA|ae|AE|oe|OE)(?![a-zA-Z])", lambda m: TEXT_SYMBOLS[m.group(1)], s)
    s = re.sub(r"\\([oOlL])(?![a-zA-Z])\s?", lambda m: TEXT_SYMBOLS[m.group(1)], s)
    s = re.sub(r"\\([&%#_$])", r"\1", s)
    s = re.sub(r"\\([a-zA-Z]+)", lambda m: GREEK.get(m.group(1), ""), s)
    s = re.sub(r"\\.", "", s)
    s = re.sub(r"[{}$_^]", "", s)
    s = s.replace("---", "-").replace("--", "-")
    return re.sub(r"\s+", " ", s).strip()


def normalize(s):
    plain = latex_to_plain(s)
    plain = plain.translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789"))
    plain = unicodedata.normalize("NFKD", plain)
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    plain = re.sub(r"[\u2010-\u2015]", "-", plain.lower())
    return re.sub(r"\s+", " ", plain).strip()


def matches_keyword(keyword, haystack, authors):
    kw = (keyword or "").strip()
    if not kw:
        return False
    m = re.match(r"^(?:author|au):\s*(.+)$", kw, re.I)
    if m:
        return normalize(m.group(1)) in authors
    phrases = [normalize(p) for p in re.findall(r'"([^"]+)"', kw)]
    rest = re.sub(r'"[^"]+"', " ", kw)
    words = [w for w in normalize(rest).split(" ") if w]
    return all(p in haystack for p in phrases) and all(w in haystack for w in words)


def fetch(url, attempts=3):
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read()
        except Exception as e:  # network hiccup: wait and retry
            last = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"Could not fetch {url}: {last}")


def parse_feed(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        m = re.search(r"arxiv\.org/abs/(.+?)(?:v\d+)?$", link)
        if not m:
            continue
        arxiv_id = m.group(1)
        desc = it.findtext("description") or ""
        abstract = desc.split("Abstract:", 1)[1].strip() if "Abstract:" in desc else desc.strip()
        creators = it.findtext("dc:creator", default="", namespaces=NS)
        authors = [latex_to_plain(a) for a in re.split(r",\s*|\s+and\s+", creators) if a.strip()]
        published = ""
        pub = it.findtext("pubDate")
        if pub:
            try:
                published = email.utils.parsedate_to_datetime(pub).date().isoformat()
            except (TypeError, ValueError):
                published = ""
        items.append({
            "arxivId": arxiv_id,
            "title": re.sub(r"\s+", " ", (it.findtext("title") or "")).strip(),
            "authors": authors,
            "abstract": re.sub(r"\s+", " ", abstract),
            "categories": [c.text.strip() for c in it.findall("category") if c.text],
            "announceType": (it.findtext("arxiv:announce_type", default="", namespaces=NS) or "").strip(),
            "doi": (it.findtext("arxiv:DOI", default="", namespaces=NS) or "").strip(),
            "journalRef": (it.findtext("arxiv:journal_reference", default="", namespaces=NS) or "").strip(),
            "published": published,
        })
    return items


def find_matches(items, keywords, types=KEEP_TYPES):
    out = []
    for it in items:
        if types and it["announceType"] and it["announceType"] not in types:
            continue
        hay = normalize(f"{it['title']} {it['abstract']}")
        authors = normalize(", ".join(it["authors"]))
        hit = [k for k in keywords if matches_keyword(k, hay, authors)]
        if hit:
            out.append({**it, "matched": hit})
    return out


def doc_id(arxiv_id):
    return arxiv_id.replace("/", "_")


def main():
    ap = argparse.ArgumentParser(description="Store today's arXiv matches in the dashboard.")
    ap.add_argument("--dry-run", action="store_true", help="print matches, write nothing")
    ap.add_argument("--keywords", help="comma separated keywords (overrides the app settings)")
    ap.add_argument("--categories", help="comma separated arXiv categories, default from the app or cond-mat")
    ap.add_argument("--rss-file", help="read a saved feed instead of downloading (for testing)")
    args = ap.parse_args()

    db = base = None
    settings = {}
    if not args.dry_run:
        import firebase_admin
        from firebase_admin import credentials, firestore
        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
        uid = os.environ.get("DASHBOARD_UID", "").strip()
        if not raw or not uid:
            sys.exit("Set FIREBASE_SERVICE_ACCOUNT and DASHBOARD_UID (see README), or use --dry-run.")
        firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)))
        db = firestore.client()
        base = db.collection("users").document(uid)
        settings = base.collection("meta").document("settings").get().to_dict() or {}

    split = lambda s: [x.strip() for x in s.split(",") if x.strip()]
    keywords = split(args.keywords) if args.keywords else (settings.get("arxivKeywords") or DEFAULT_KEYWORDS)
    categories = split(args.categories) if args.categories else (settings.get("arxivCategories") or DEFAULT_CATEGORIES)

    items, seen = [], set()
    sources = [open(args.rss_file, "rb").read()] if args.rss_file else []
    failures = 0
    if not sources:
        for cat in categories:
            try:
                sources.append(fetch(RSS_URL.format(cat=cat)))
            except RuntimeError as e:
                failures += 1
                print(e, file=sys.stderr)
    if failures and failures == len(categories):
        sys.exit("arXiv could not be reached. Nothing was changed.")
    for xml_bytes in sources:
        for it in parse_feed(xml_bytes):
            if it["arxivId"] not in seen:
                seen.add(it["arxivId"])
                items.append(it)

    found = find_matches(items, keywords)
    print(f"Scanned {len(items)} papers in {', '.join(categories)}; {len(found)} match {keywords}.")
    for f in found:
        print(f"  {f['arxivId']}  [{', '.join(f['matched'])}]  {latex_to_plain(f['title'])}")
    if args.dry_run:
        return

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    col = base.collection("arxiv")
    refs = [col.document(doc_id(f["arxivId"])) for f in found]
    existing = {snap.id for snap in db.get_all(refs) if snap.exists} if refs else set()
    batch = db.batch()
    added = 0
    for f, ref in zip(found, refs):
        if ref.id in existing:
            continue
        batch.set(ref, {**f, "fetchedAt": now_ms, "status": "new"})
        added += 1
    if added:
        batch.commit()

    # Keep the feed short: anything older than KEEP_DAYS days goes (papers you added stay in your library).
    cutoff = now_ms - KEEP_DAYS * 86400000
    try:
        from google.cloud.firestore_v1 import FieldFilter
        old = col.where(filter=FieldFilter("fetchedAt", "<", cutoff)).stream()
    except ImportError:
        old = col.where("fetchedAt", "<", cutoff).stream()
    removed = 0
    batch = db.batch()
    for snap in old:
        batch.delete(snap.reference)
        removed += 1
    if removed:
        batch.commit()

    base.collection("meta").document("arxiv").set({
        "lastRun": now_ms, "lastNew": added, "scanned": len(items),
        "categories": categories, "keywords": keywords,
    })
    print(f"Stored {added} new matches, removed {removed} old ones.")


if __name__ == "__main__":
    main()
