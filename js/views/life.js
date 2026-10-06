import { html, useState, useEffect, useMemo } from '../../vendor/preact.js';
import { actions, getState } from '../store.js';
import { Icon, Section, Sheet, Field, Empty, DatePick, DangerButton, toast } from '../ui.js';
import { loadForecast, summarize, compass, SCORE_LABEL } from '../lib/surf.js';
import { todayISO, addDays, fmtDate, fmtAgo, startOfWeek, isoOf, weekdayShort, daysBetween } from '../lib/dates.js';

const inflight = new Map();

export function useSurf(spot) {
  const demo = getState().status.mode === 'demo';
  const key = `${spot.lat},${spot.lon}`;
  const [st, setSt] = useState({ loading: true, fc: null, error: null });
  const load = (force = false) => {
    setSt((s) => ({ ...s, loading: true }));
    let p = !force && inflight.get(key);
    if (!p) {
      p = loadForecast(spot, { force, demo });
      inflight.set(key, p);
      p.finally(() => setTimeout(() => inflight.delete(key), 2000)).catch(() => {});
    }
    p.then((fc) => setSt({ loading: false, fc, error: null })).catch((error) => setSt({ loading: false, fc: null, error }));
  };
  useEffect(() => { load(); }, [key]);
  const summary = useMemo(() => {
    if (!st.fc) return null;
    try { return summarize(st.fc, spot); } catch (e) { console.error(e); return null; }
  }, [st.fc, spot.facing]);
  return { ...st, summary, refresh: () => load(true) };
}

const fmtM = (v) => (v == null ? '-' : v.toFixed(1));
const fmtS = (v) => (v == null ? '-' : Math.round(v));

function DirArrow({ deg, toward = true }) {
  if (deg == null) return null;
  const rot = toward ? (deg + 180) % 360 : deg;
  return html`<span style=${`display:inline-flex;transform:rotate(${rot}deg)`} aria-hidden="true"><${Icon} name="arrow" size="xs" /></span>`;
}

function Quality({ score }) {
  return html`<span class="surf-day__q" aria-label=${SCORE_LABEL[score || 0]}>${[1, 2, 3, 4].map((i) => html`<span key=${i} class=${i <= (score || 0) ? 'on' : ''}></span>`)}</span>`;
}

function TideCurve({ tide }) {
  const pts = tide.points;
  if (pts.length < 3) return null;
  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const t0 = pts[0].t;
  const W = 300;
  const H = 64;
  const X = (t) => ((t - t0) / (24 * 3600)) * W;
  const Y = (v) => 6 + (1 - (v - lo) / span) * (H - 14);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${X(pts[pts.length - 1].t).toFixed(1)},${H} L0,${H} Z`;
  const nx = tide.nowFrac * W;
  return html`<svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label=${'Tide today: ' + tide.extremes.map((e) => `${e.type} ${e.label}`).join(', ')}>
    <path d=${area} fill="var(--accent-soft)" />
    <path d=${d} fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />
    ${tide.extremes.map((e) => html`<circle key=${e.t} cx=${X(e.t)} cy=${Y(e.v)} r="2.4" fill="var(--accent)" />`)}
    <line x1=${nx} x2=${nx} y1="0" y2=${H} stroke="var(--ink)" stroke-width="1.25" vector-effect="non-scaling-stroke" />
  </svg>`;
}

export function SurfCard({ settings, onSettings }) {
  const spot = settings.surf;
  const { loading, summary, error, fc, refresh } = useSurf(spot);
  const head = html`<button class="btn btn--quiet btn--sm" onClick=${refresh} disabled=${loading} aria-label="Refresh the forecast"><${Icon} name="refresh" size="xs" />${loading ? 'Loading' : 'Refresh'}</button>`;
  if (!summary) {
    return html`<${Section} title=${`Surf, ${spot.name || 'your spot'}`} action=${head}>
      <div class="group">${loading ? html`<${Empty}>Loading the forecast</${Empty}>`
        : html`<${Empty} title="Forecast unavailable">${error && !navigator.onLine ? 'You are offline. The last forecast shows here once loaded online.' : 'Open-Meteo did not answer. Try Refresh in a moment.'}</${Empty}>`}</div>
    </${Section}>`;
  }
  const n = summary.now;
  return html`<${Section} title=${`Surf, ${spot.name || 'your spot'}`} action=${head}>
    <div class="group">
      <div class="surf-now">
        <div class="stat">
          <div class="stat__value">${fmtM(n.height)}<span class="countdown__unit">m</span></div>
          <div class="stat__label">Swell, ${fmtS(n.period)} s</div>
          <div class="surf-now__dir"><${DirArrow} deg=${n.dir} />from ${compass(n.dir)}</div>
        </div>
        <div class="stat">
          <div class="stat__value">${n.wind == null ? '-' : Math.round(n.wind)}<span class="countdown__unit">km/h</span></div>
          <div class="stat__label">Wind${n.rel ? `, ${n.rel}` : ''}</div>
          <div class="surf-now__dir"><${DirArrow} deg=${n.windDir} />from ${compass(n.windDir)}${n.gust ? `, gusts ${Math.round(n.gust)}` : ''}</div>
        </div>
        <div class="stat">
          <div class="stat__value">${n.sst == null ? '-' : n.sst.toFixed(1)}<span class="countdown__unit">°C</span></div>
          <div class="stat__label">Water</div>
          <div class="surf-now__dir">${SCORE_LABEL[n.score]} now</div>
        </div>
      </div>
      ${summary.tide.points.length > 2 && html`<div class="tide">
        <${TideCurve} tide=${summary.tide} />
        <div class="tide__marks">${summary.tide.extremes.map((e) => html`<span key=${e.t}>${e.type} tide ${e.label}</span>`)}</div>
      </div>`}
      <div class="surf-days">
        ${summary.days.slice(0, 6).map((d) => html`<div key=${d.date} class="surf-day">
          <div class="surf-day__name">${d.name}</div>
          <div class="surf-day__h">${fmtM(d.best ? d.best.height : d.maxHeight)} m</div>
          <div class="surf-day__p">${d.best ? `${fmtS(d.best.period)} s` : 'after dark'}</div>
          ${d.best && html`<div class="surf-day__p faint">${d.bestLabel}</div>`}
          <${Quality} score=${d.best ? d.best.score : 0} />
        </div>`)}
      </div>
      <p class="surf-note" style="padding-top:12px">${fc && fc.sample ? 'Sample forecast for the preview. ' : ''}Rough guide from swell height, period and wind direction for a beach facing ${compass(Number(spot.facing))}. Data from Open-Meteo, ${fmtAgo(fc && fc.cachedAt)}.${fc && fc.stale ? ' Offline copy.' : ''} ${onSettings ? html`<button class="link-btn" style="font-size:12px" onClick=${onSettings}>Change spot</button>` : ''}</p>
    </div>
  </${Section}>`;
}

export function SurfMini({ settings, go }) {
  const { summary, loading } = useSurf(settings.surf);
  if (!summary) return html`<div class="group"><${Empty}>${loading ? 'Loading the forecast' : 'Forecast unavailable right now'}</${Empty}></div>`;
  const n = summary.now;
  const today = summary.days[0];
  const nextTide = summary.tide.extremes.find((e) => e.t * 1000 > Date.now());
  return html`<div class="group">
    <button class="row row--button" onClick=${() => go('life')}>
      <span style="color:var(--accent);display:flex"><${Icon} name="life" /></span>
      <div class="row__main">
        <div class="row__title">${fmtM(n.height)} m at ${fmtS(n.period)} s from ${compass(n.dir)}</div>
        <div class="row__sub">Wind ${n.wind == null ? '-' : Math.round(n.wind)} km/h${n.rel ? ` ${n.rel}` : ''}${n.sst != null ? `, water ${n.sst.toFixed(0)}°C` : ''}</div>
      </div>
      <span class=${'pill' + (n.score >= 3 ? ' pill--accent' : '')}>${SCORE_LABEL[n.score]}</span>
    </button>
    ${(today && today.best) || nextTide ? html`<div class="row">
      <span class="faint" style="display:flex"><${Icon} name="calendar" size="sm" /></span>
      <div class="row__main row__sub" style="margin:0">
        ${today && today.best ? `Best today around ${today.bestLabel}, ${SCORE_LABEL[today.best.score].toLowerCase()}` : 'No more daylight sessions today'}${nextTide ? `. ${nextTide.type} tide at ${nextTide.label}` : ''}
      </div>
    </div>` : null}
  </div>`;
}

// Sport log
function SessionSheet({ item, types, onClose }) {
  const [f, setF] = useState({ type: item.type, date: item.date, minutes: item.minutes || '', note: item.note || '' });
  const save = () => {
    actions.update('sessions', item.id, { ...f, minutes: Number(f.minutes) || 0 });
    onClose();
  };
  return html`<${Sheet} title="Session" onClose=${onClose} actions=${html`
      <${DangerButton} onConfirm=${() => { actions.remove('sessions', item.id); toast('Session deleted'); onClose(); }} />
      <button class="btn btn--primary" onClick=${save}>Save</button>`}>
    <div class="chips" style="margin-bottom:14px">${types.map((t) => html`<button key=${t} class="chip" aria-pressed=${f.type === t ? 'true' : 'false'} onClick=${() => setF({ ...f, type: t })}>${t}</button>`)}</div>
    <div class="fields-2">
      <${Field} label="Date"><input class="input" type="date" value=${f.date} onInput=${(e) => setF({ ...f, date: e.currentTarget.value })} /></${Field}>
      <${Field} label="Minutes"><input class="input" inputmode="numeric" value=${f.minutes} onInput=${(e) => setF({ ...f, minutes: e.currentTarget.value })} /></${Field}>
    </div>
    <${Field} label="Note"><input class="input" value=${f.note} onInput=${(e) => setF({ ...f, note: e.currentTarget.value })} /></${Field}>
    ${item.conditions && html`<p class="field__hint" style="margin-top:10px">Conditions logged: ${item.conditions}</p>`}
  </${Sheet}>`;
}

export function SportLog({ sessions, settings, surfNow }) {
  const types = settings.sportTypes || ['Surf'];
  const today = todayISO();
  const [type, setType] = useState(types[0]);
  const [minutes, setMinutes] = useState(60);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(null);
  const log = (e) => {
    e.preventDefault();
    const m = Number(minutes) || 0;
    if (!m) { toast('Add how many minutes'); return; }
    const conditions = type.toLowerCase() === 'surf' && date === today && surfNow
      ? `${surfNow.height != null ? surfNow.height.toFixed(1) : '-'} m, ${surfNow.period != null ? Math.round(surfNow.period) : '-'} s from ${compass(surfNow.dir)}, wind ${surfNow.wind != null ? Math.round(surfNow.wind) : '-'} km/h ${surfNow.rel || ''}`.trim()
      : '';
    actions.add('sessions', { type, minutes: m, date, note: note.trim(), conditions });
    toast(`${type} logged`);
    setNote('');
    setDate(today);
  };
  const wk = isoOf(startOfWeek());
  const week = sessions.filter((s) => s.date >= wk);
  const weekMin = week.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const monthStart = today.slice(0, 8) + '01';
  const byType = new Map();
  for (const s of sessions.filter((x) => x.date >= monthStart)) byType.set(s.type, (byType.get(s.type) || 0) + 1);
  const recent = sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);

  return html`<${Section} title="Sport" meta=${week.length ? `${week.length} this week, ${weekMin} min` : 'Nothing this week yet'}>
    <form class="group group--pad" onSubmit=${log}>
      <div class="chips">${types.map((t) => html`<button type="button" key=${t} class="chip" aria-pressed=${type === t ? 'true' : 'false'} onClick=${() => setType(t)}>${t}</button>`)}</div>
      <div class="chips" style="margin-top:10px;align-items:center">
        ${[30, 60, 90, 120].map((m) => html`<button type="button" key=${m} class="chip" aria-pressed=${Number(minutes) === m ? 'true' : 'false'} onClick=${() => setMinutes(m)}>${m} min</button>`)}
        <input class="input" style="width:84px;min-height:32px;padding:4px 10px" inputmode="numeric" aria-label="Minutes" value=${minutes} onInput=${(e) => setMinutes(e.currentTarget.value)} />
        <${DatePick} value=${date} onChange=${(v) => setDate(v || today)} pressed=${date !== today}><${Icon} name="calendar" size="xs" />${date === today ? 'Today' : fmtDate(date)}</${DatePick}>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <input class="input" value=${note} placeholder="Note (optional)" aria-label="Note" onInput=${(e) => setNote(e.currentTarget.value)} />
        <button class="btn btn--primary" type="submit">Log</button>
      </div>
    </form>
    ${byType.size > 0 && html`<div class="chips" style="margin:12px 2px">${[...byType].map(([t, c]) => html`<span key=${t} class="pill">${t} ${c}x this month</span>`)}</div>`}
    ${recent.length > 0 && html`<div class="group" style="margin-top:12px">${recent.map((s) => html`<button key=${s.id} class="row row--button" onClick=${() => setOpen(s)}>
      <div class="row__main">
        <div class="row__title">${s.type}</div>
        ${(s.note || s.conditions) && html`<div class="row__sub">${s.note || s.conditions}</div>`}
      </div>
      <div class="row__side"><div class="row__side--strong num">${s.minutes} min</div><div class="faint" style="font-size:12.5px">${daysBetween(s.date, today) === 0 ? 'today' : daysBetween(s.date, today) === 1 ? 'yesterday' : fmtDate(s.date)}</div></div>
    </button>`)}</div>`}
    ${open && html`<${SessionSheet} item=${open} types=${types} onClose=${() => setOpen(null)} />`}
  </${Section}>`;
}

// Habits
export function streak(days, today = todayISO()) {
  const set = new Set(days || []);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

function HabitSheet({ habit, onClose }) {
  const [name, setName] = useState(habit.name);
  const today = todayISO();
  const set = new Set(habit.days || []);
  const start = addDays(isoOf(startOfWeek()), -15 * 7);
  const cells = [];
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDays(start, i);
    cells.push({ d, on: set.has(d), future: d > today });
  }
  const total = (habit.days || []).filter((d) => d >= start).length;
  return html`<${Sheet} title="Habit" onClose=${onClose} actions=${html`
      <${DangerButton} onConfirm=${() => { actions.remove('habits', habit.id); toast('Habit deleted'); onClose(); }} />
      <button class="btn btn--primary" onClick=${() => { if (name.trim()) actions.update('habits', habit.id, { name: name.trim() }); onClose(); }}>Save</button>`}>
    <${Field} label="Name"><input class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} /></${Field}>
    <p class="field__label" style="margin:18px 0 8px">Last 16 weeks, ${total} days</p>
    <div class="heat" style="padding:0" role="img" aria-label=${`${total} days in the last 16 weeks`}>
      ${cells.map((c) => html`<span key=${c.d} title=${fmtDate(c.d)} style=${c.future ? 'background:transparent' : c.on ? 'background:var(--accent)' : ''}></span>`)}
    </div>
  </${Sheet}>`;
}

export function HabitList({ habits }) {
  const today = todayISO();
  const days = [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(today, -n));
  const [name, setName] = useState('');
  const [open, setOpen] = useState(null);
  const list = habits.filter((h) => !h.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    actions.add('habits', { name: name.trim(), order: (list.length ? Math.max(...list.map((h) => h.order || 0)) : 0) + 1, days: [] });
    setName('');
  };
  return html`<${Section} title="Habits">
    <div class="group">
      ${list.map((h) => {
        const s = streak(h.days, today);
        return html`<div key=${h.id} class="habit-row">
          <button class="habit-row__name row--button" style="padding:0;text-align:left;border:0;background:none" onClick=${() => setOpen(h)}>
            ${h.name}<div class="habit-row__streak">${s ? `${s}-day streak` : 'No streak yet'}</div>
          </button>
          <div class="week-dots">
            ${days.map((d) => {
              const on = (h.days || []).includes(d);
              return html`<button key=${d} class=${'week-dot' + (d === today ? ' week-dot--today' : '')} aria-pressed=${on ? 'true' : 'false'} aria-label=${`${h.name}, ${fmtDate(d)}`} onClick=${() => actions.toggleHabitDay(h, d)}>
                ${weekdayShort(d).slice(0, 1)}<i></i>
              </button>`;
            })}
          </div>
        </div>`;
      })}
      <form class="quickadd" onSubmit=${add} style=${list.length ? 'border-top:1px solid var(--line)' : ''}>
        <${Icon} name="plus" size="sm" cls="faint" />
        <input class="quickadd__input" value=${name} placeholder="Add a habit" aria-label="New habit" onInput=${(e) => setName(e.currentTarget.value)} />
        ${name && html`<button class="btn btn--primary btn--sm" type="submit">Add</button>`}
      </form>
    </div>
    ${open && html`<${HabitSheet} habit=${open} onClose=${() => setOpen(null)} />`}
  </${Section}>`;
}

export function HabitChips({ habits }) {
  const today = todayISO();
  const list = habits.filter((h) => !h.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!list.length) return html`<${Empty}>Add habits in Life to tick them off here.</${Empty}>`;
  return html`<div class="habit-chips">
    ${list.map((h) => {
      const on = (h.days || []).includes(today);
      const s = streak(h.days, today);
      return html`<button key=${h.id} class="habit-chip" aria-pressed=${on ? 'true' : 'false'} onClick=${() => actions.toggleHabitDay(h, today)}>
        <span class="check" aria-checked=${on ? 'true' : 'false'}><${Icon} name="check" /></span>
        ${h.name}${s > 1 && html`<span class="habit-chip__streak" aria-label=${`${s}-day streak`}>${s} days</span>`}
      </button>`;
    })}
  </div>`;
}

export function LifeView({ state, go }) {
  const { sessions, habits, settings } = state.data;
  const { summary } = useSurf(settings.surf);
  return html`<div>
    <h1 class="page-title">Life</h1>
    <div class="grid-2">
      <${SurfCard} settings=${settings} onSettings=${() => go('settings')} />
      <div class="stack">
        <${HabitList} habits=${habits} />
        <${SportLog} sessions=${sessions} settings=${settings} surfNow=${summary && summary.now} />
      </div>
    </div>
  </div>`;
}
