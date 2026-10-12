// Studio: overnight fasting. Log the end of dinner, and a timer runs until she can eat again
// (14 hours by default, Settings can change it). The notification sender also uses `fasts`.
import { html, useState, useEffect, useRef } from '../../../vendor/preact.js';
import { actions, getState } from '../../store.js';
import { Icon, toast } from '../../ui.js';
import { XP } from '../../lib/xp.js';
import { isoOf, addDays, todayISO, fmtDate, startOfWeek, parseISO, daysBetween } from '../../lib/dates.js';

const HOUR = 3600000;
const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const span = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const targetOf = (f, hours) => (Number(f.target) || hours) * HOUR;
const dayWord = (ms) => {
  const d = isoOf(new Date(ms));
  const t = todayISO();
  return d === t ? 'today' : d === addDays(t, -1) ? 'yesterday' : fmtDate(d);
};
const announced = new Set();

// Today at hh:mm, or yesterday if that time is more than two hours ahead (dinner logged the next
// morning). A time just ahead, like 21:00 picked at 20:57, stays today.
function startFromTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() > Date.now() + 2 * HOUR) d.setDate(d.getDate() - 1);
  return Math.min(d.getTime(), Date.now());
}

// Completed fasts on consecutive days, ending today or yesterday.
export function fastStreak(fasts, hours, today = todayISO()) {
  const days = new Set(fasts.filter((f) => f.end && f.end - f.start >= targetOf(f, hours)).map((f) => isoOf(new Date(f.end))));
  // A fast that ended today, done or short, decides today; otherwise count from yesterday.
  const endedToday = fasts.some((f) => f.end && isoOf(new Date(f.end)) === today);
  let d = endedToday ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function FastCard({ state }) {
  const { fasts, settings } = state.data;
  const hours = Number(settings.fastHours) || 14;
  const active = fasts.filter((f) => !f.end).sort((a, b) => b.start - a.start)[0] || null;
  const last = fasts.filter((f) => f.end).sort((a, b) => b.end - a.end)[0] || null;
  const [now, setNow] = useState(Date.now());
  const [time, setTime] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, [active && active.id]);

  const target = active ? targetOf(active, hours) : hours * HOUR;
  const elapsed = active ? now - active.start : 0;
  const left = target - elapsed;
  useEffect(() => {
    if (active && left <= 0 && !announced.has(active.id) && elapsed < target + 10 * 60000) {
      announced.add(active.id);
      toast(`${Math.round(target / HOUR)} hours done. You can eat.`, { ms: 8000 });
    }
  }, [active && active.id, left <= 0]);

  // One fast at a time, and one write per tap: a double tap must not start or end twice.
  const busy = useRef(null);
  useEffect(() => { busy.current = null; }, [active && active.id]);
  const start = (ms) => {
    if (busy.current === 'start' || getState().data.fasts.some((f) => !f.end)) return;
    busy.current = 'start';
    actions.add('fasts', { start: ms, end: null, target: hours, createdAt: Date.now() });
    toast(`Fast started. You can eat again at ${clock(ms + hours * HOUR)}.`, { ms: 5000 });
    setTime('');
  };
  const finish = () => {
    if (busy.current === active.id) return;
    busy.current = active.id;
    const end = Date.now();
    const ok = end - active.start >= target;
    actions.update('fasts', active.id, { end });
    toast(ok ? `${span(end - active.start)} fast. Well done.` : `Fast ended after ${span(end - active.start)}.`, ok ? { xp: XP.fast } : {});
  };
  const moveStart = () => {
    if (time) {
      const s = startFromTime(time);
      // Announce again only if the new end is still to come.
      actions.update('fasts', active.id, { start: s, ...(s + target > Date.now() ? { notifiedAt: null } : {}) });
    }
    setEditing(false);
    setTime('');
  };
  const streak = fastStreak(fasts, hours);

  if (active) {
    const n = Math.max(1, Math.round(target / HOUR));
    const filled = Math.min(n, elapsed / HOUR);
    return html`<section class=${'fast fast--on' + (left <= 0 ? ' fast--done' : '')} aria-label="Fasting">
      <div class="fast__top">
        <span class="s-label">Fasting since dinner, ${clock(active.start)}</span>
        <button class="icon-btn icon-btn--sm" aria-label="Change when dinner ended" onClick=${() => setEditing(!editing)}><${Icon} name="edit" size="xs" /></button>
      </div>
      <div class="fast__big">${left > 0 ? span(left) : 'Done'} <small>${left > 0 ? 'to go' : `+${span(-left)}`}</small></div>
      <div class="fast__hours" role="img" aria-label=${`${Math.floor(filled)} of ${n} hours`}>
        ${Array.from({ length: n }, (_, i) => html`<i key=${i} class=${i + 1 <= filled ? 'on' : i < filled ? 'part' : ''} style=${i < filled && i + 1 > filled ? `--p:${Math.round((filled - i) * 100)}%` : ''}></i>`)}
      </div>
      <div class="fast__meta">You can eat from <b>${clock(active.start + target)}</b> · ${span(elapsed)} so far</div>
      ${editing && html`<div class="fast__row">
        <span>Dinner ended at</span>
        <input class="input input--time" type="time" aria-label="Dinner ended at" value=${time || clock(active.start)} onInput=${(e) => setTime(e.currentTarget.value)} />
        <button class="btn btn--sm btn--primary" onClick=${moveStart}>Save</button>
        <button class="btn btn--sm btn--quiet" onClick=${() => { actions.remove('fasts', active.id); setEditing(false); }}>Delete</button>
      </div>`}
      <div class="fast__row">
        <button class="btn btn--primary" onClick=${finish}>${left > 0 ? 'I ate' : 'Breakfast: end the fast'}</button>
        ${streak > 0 && html`<span class="fast__streak">${streak} ${streak === 1 ? 'day' : 'days'} in a row</span>`}
      </div>
    </section>`;
  }

  return html`<section class="fast" aria-label="Fasting">
    <div class="fast__top"><span class="s-label">Fasting</span>${streak > 0 && html`<span class="fast__streak">${streak} ${streak === 1 ? 'day' : 'days'} in a row</span>`}</div>
    <p class="fast__line">After dinner, ${hours} hours before eating again.</p>
    <div class="fast__row">
      <button class="btn btn--primary" onClick=${() => start(Date.now())}><${Icon} name="clock" size="xs" />Dinner done, start ${hours} h</button>
    </div>
    <div class="fast__row fast__row--quiet">
      <span>Finished earlier?</span>
      <input class="input input--time" type="time" aria-label="Dinner ended at" value=${time} onInput=${(e) => setTime(e.currentTarget.value)} />
      ${time && html`<button class="btn btn--sm" onClick=${() => start(startFromTime(time))}>Start from ${time}</button>`}
    </div>
    ${last && html`<div class="fast__meta">Last fast ${span(last.end - last.start)}, ended ${dayWord(last.end)} at ${clock(last.end)}</div>`}
  </section>`;
}

// The record: how many fasts reached their target this week, month and year, how long they
// last, and the trend over 12 weeks and 6 months. A fast counts on the day it ends.
export function FastRecord({ state }) {
  const hours = Number(state.data.settings.fastHours) || 14;
  const ended = state.data.fasts.filter((f) => f.end && f.start);
  if (!ended.length) return null;
  const today = todayISO();
  const dayOf = (f) => isoOf(new Date(f.end));
  const ok = (f) => f.end - f.start >= targetOf(f, hours);
  const done = ended.filter(ok);
  const monday = isoOf(startOfWeek(parseISO(today)));
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const last30 = ended.filter((f) => dayOf(f) > addDays(today, -30));
  const avg = last30.length ? last30.reduce((a, f) => a + (f.end - f.start), 0) / last30.length : 0;
  const longest = ended.reduce((a, f) => Math.max(a, f.end - f.start), 0);
  const rate = last30.length ? Math.round((last30.filter(ok).length / last30.length) * 100) : 0;
  const nightsThisWeek = daysBetween(monday, today) + 1;

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(monday, -7 * (11 - i));
    const end = addDays(start, 6);
    return { start, n: done.filter((f) => dayOf(f) >= start && dayOf(f) <= end).length, now: i === 11 };
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = parseISO(`${month}-01`);
    d.setMonth(d.getMonth() - i);
    const key = isoOf(d).slice(0, 7);
    const all = ended.filter((f) => dayOf(f).startsWith(key));
    const hit = all.filter(ok);
    return { key, label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), hit: hit.length, all: all.length, avg: all.length ? all.reduce((a, f) => a + (f.end - f.start), 0) / all.length : 0 };
  }).filter((m) => m.all > 0);

  const stats = [
    [`${done.filter((f) => dayOf(f) >= monday).length}/${nightsThisWeek}`, `This week, at ${hours} h or more`],
    [done.filter((f) => dayOf(f).startsWith(month)).length, 'This month'],
    [done.filter((f) => dayOf(f).startsWith(year)).length, 'This year'],
    [avg ? span(avg) : '–', 'Average, last 30 days'],
    [longest ? span(longest) : '–', 'Longest fast'],
    [`${rate}%`, 'On target, last 30 days'],
  ];
  return html`<div class="group">
    <div class="fstats">${stats.map(([v, l]) => html`<div key=${l} class="fstat"><b>${v}</b><span>${l}</span></div>`)}</div>
    <div class="fweeks" role="img" aria-label=${`Fasts on target per week, last 12 weeks: ${weeks.map((w) => w.n).join(', ')}`}>
      ${weeks.map((w) => html`<div key=${w.start} class=${'fweek' + (w.now ? ' fweek--now' : '')}><span>${w.n || ''}</span><i style=${`height:${Math.round((w.n / 7) * 64)}px`}></i></div>`)}
    </div>
    <div class="fweeks-axis"><span>12 weeks ago</span><span>This week</span></div>
    ${months.map((m) => html`<div key=${m.key} class="row">
      <div class="row__main"><div class="row__title">${m.label}</div><div class="row__sub">${m.hit} of ${m.all} on target, average ${span(m.avg)}</div></div>
      <span class="row__side">${m.hit}</span>
    </div>`)}
  </div>`;
}

export function FastHistory({ state }) {
  const hours = Number(state.data.settings.fastHours) || 14;
  const list = state.data.fasts.filter((f) => f.end).sort((a, b) => b.end - a.end).slice(0, 10);
  if (!list.length) return null;
  return html`<div class="group">
    ${list.map((f) => {
      const ok = f.end - f.start >= targetOf(f, hours);
      return html`<div key=${f.id} class="row">
        <span class=${'state ' + (ok ? 'state--paid' : 'state--draft')}>${ok ? 'Done' : 'Short'}</span>
        <div class="row__main"><div class="row__title">${span(f.end - f.start)}</div><div class="row__sub">${clock(f.start)} to ${clock(f.end)}, ${fmtDate(isoOf(new Date(f.end)))}</div></div>
        <button class="icon-btn icon-btn--sm" aria-label="Delete this fast" onClick=${() => actions.remove('fasts', f.id)}><${Icon} name="x" size="xs" /></button>
      </div>`;
    })}
  </div>`;
}
