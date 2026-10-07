import { html, useState } from '../../vendor/preact.js';
import { actions } from '../store.js';
import { Icon, Check, Chem, Section, Sheet, Field, Empty, DateChip, DangerButton, PageHead, toast, useWidth } from '../ui.js';
import { todayISO, addDays, daysBetween, relDays, fmtRange, fmtShort, fmtDate, parseISO, isoOf } from '../lib/dates.js';
import { XP } from '../lib/xp.js';

export function beamtimeState(b, today = todayISO()) {
  const end = b.end || b.start;
  if (today < b.start) return { phase: 'upcoming', n: daysBetween(today, b.start) };
  if (today <= end) return { phase: 'now', day: daysBetween(b.start, today) + 1, total: daysBetween(b.start, end) + 1 };
  return { phase: 'past', n: daysBetween(end, today) };
}

export function thesisProgress(chapters) {
  if (!chapters.length) return 0;
  return Math.round(chapters.reduce((s, c) => s + (Number(c.progress) || 0), 0) / chapters.length);
}

const KIND_LABEL = { proposal: 'Proposal', conference: 'Conference', admin: 'Admin', other: 'Other' };

// Everything with a date that matters for the PhD, soonest first.
export function upcoming(data, today = todayISO()) {
  const items = [];
  for (const b of data.beamtimes) {
    const st = beamtimeState(b, today);
    if (st.phase === 'past') continue;
    items.push({ key: 'b' + b.id, date: st.phase === 'now' ? today : b.start, title: `${b.facility} beamtime`, sub: b.beamline || fmtRange(b.start, b.end), kind: 'beamtime', side: st.phase === 'now' ? `day ${st.day} of ${st.total}` : relDays(b.start, today).text, accent: true });
  }
  for (const d of data.deadlines) {
    if (d.done || !d.date || d.date < today) continue;
    items.push({ key: 'd' + d.id, date: d.date, title: d.title, sub: [d.facility, KIND_LABEL[d.kind] || 'Deadline'].filter(Boolean).join(', '), kind: 'deadline', side: relDays(d.date, today).text, soon: daysBetween(today, d.date) <= 7 });
  }
  const target = data.settings.thesis && data.settings.thesis.target;
  if (target && target >= today) items.push({ key: 'thesis', date: target, title: 'Thesis submission', sub: data.settings.thesis.title || '', kind: 'thesis', side: relDays(target, today).text });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// The next eight weeks on one axis: beamtimes as bands, deadlines as points, today as a line.
export function Horizon({ data }) {
  const [ref, W] = useWidth(600, 240);
  const today = todayISO();
  const R0 = -7;
  const R1 = W < 480 ? 42 : 63;
  const H = 88;
  const pad = 6;
  const x = (n) => pad + ((n - R0) / (R1 - R0)) * (W - 2 * pad);
  const base = 58;
  const ticks = [];
  const months = [];
  for (let n = R0; n <= R1; n++) {
    const d = parseISO(addDays(today, n));
    if (d.getDay() === 1) ticks.push(n);
    if (d.getDate() === 1) months.push({ n, label: d.toLocaleDateString('en-GB', { month: 'short' }) });
  }
  const bands = data.beamtimes.map((b) => {
    const s = daysBetween(today, b.start);
    const e = daysBetween(today, b.end || b.start) + 1;
    return { b, s: Math.max(R0, s), e: Math.min(R1, e), past: e <= 0 };
  }).filter((x2) => x2.e > R0 && x2.s < R1);
  const dots = data.deadlines.filter((d) => !d.done && d.date).map((d) => ({ d, n: daysBetween(today, d.date) })).filter((o) => o.n >= R0 && o.n <= R1);
  const target = data.settings.thesis && data.settings.thesis.target;
  const tn = target ? daysBetween(today, target) : null;
  const summary = upcoming(data, today).slice(0, 3).map((i) => `${i.title} ${i.side}`).join('; ');

  return html`<div class="horizon" ref=${ref}>
    <svg viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} role="img" aria-label=${`Next weeks: ${summary || 'nothing scheduled'}`}>
      <line x1=${pad} x2=${W - pad} y1=${base} y2=${base} stroke="var(--line-strong)" stroke-width="1" />
      ${ticks.map((n) => html`<line key=${'t' + n} x1=${x(n)} x2=${x(n)} y1=${base} y2=${base + 4} stroke="var(--line-strong)" />`)}
      ${months.map((m) => html`<g key=${'m' + m.n}>
        <line x1=${x(m.n)} x2=${x(m.n)} y1=${base - 4} y2=${base + 8} stroke="var(--ink-3)" />
        <text class="horizon__label" x=${x(m.n) + 4} y=${base + 22}>${m.label}</text>
      </g>`)}
      ${bands.map(({ b, s, e, past }) => {
        const x1 = x(s);
        const x2 = Math.max(x1 + 6, x(e));
        const anchorEnd = x1 > W - 90;
        return html`<g key=${'b' + b.id}>
          <rect x=${x1} y=${base - 20} width=${x2 - x1} height="11" rx="5.5" fill=${past ? 'var(--accent-mid)' : 'var(--accent)'} />
          <text class="horizon__label" x=${anchorEnd ? x2 : x1} y=${base - 26} text-anchor=${anchorEnd ? 'end' : 'start'} style="fill:var(--ink-2)">${b.facility}</text>
        </g>`;
      })}
      ${tn != null && tn >= R0 && tn <= R1 && html`<g>
        <line x1=${x(tn)} x2=${x(tn)} y1=${base - 30} y2=${base} stroke="var(--ink)" stroke-dasharray="2 3" />
        <text class="horizon__label" x=${x(tn) - 4} y=${base - 34} text-anchor="end" style="fill:var(--ink-2)">Thesis</text>
      </g>`}
      ${dots.map(({ d, n }) => html`<circle key=${'d' + d.id} cx=${x(n)} cy=${base} r="5" fill=${n <= 7 && n >= 0 ? 'var(--warn)' : n < 0 ? 'var(--danger)' : 'var(--ink-2)'} stroke="var(--surface)" stroke-width="2" />`)}
      <line x1=${x(0)} x2=${x(0)} y1="10" y2=${base + 8} stroke="var(--accent)" stroke-width="1.5" />
      <text class="horizon__today" x=${x(0) + 5} y="16">Today</text>
    </svg>
  </div>`;
}

export function NextUp({ data, limit = 4, go }) {
  const items = upcoming(data).slice(0, limit);
  if (!items.length) return html`<${Empty} title="Nothing scheduled">Add a beamtime or a proposal deadline in PhD.</${Empty}>`;
  return html`<div class="next-list">${items.map((i) => html`<button key=${i.key} class="row row--button" onClick=${() => go && go('phd')}>
    <${DateChip} iso=${i.date} accent=${i.kind === 'beamtime'} />
    <div class="row__main">
      <div class="row__title">${i.title}</div>
      ${i.sub && html`<div class="row__sub">${i.sub}</div>`}
    </div>
    <span class=${'row__side' + (i.soon ? ' due due--soon' : '')}>${i.side}</span>
  </button>`)}</div>`;
}

function Countdown({ n }) {
  if (n === 0) return html`<span class="countdown">Today</span>`;
  return html`<span><span class="countdown">${n}</span><span class="countdown__unit">${n === 1 ? 'day' : 'days'}</span></span>`;
}

function BeamtimeSheet({ item, settings, onClose }) {
  const isNew = !item.id;
  const [f, setF] = useState({ facility: item.facility || '', beamline: item.beamline || '', start: item.start || '', end: item.end || '', notes: item.notes || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const save = () => {
    if (!f.facility.trim() || !f.start) { toast('Add a facility and a start date'); return; }
    const data = { ...f, facility: f.facility.trim(), end: f.end && f.end >= f.start ? f.end : f.start };
    if (isNew) actions.add('beamtimes', data); else actions.update('beamtimes', item.id, data);
    onClose();
  };
  return html`<${Sheet} title=${isNew ? 'New beamtime' : 'Beamtime'} onClose=${onClose} actions=${html`
      ${!isNew && html`<${DangerButton} onConfirm=${() => { actions.remove('beamtimes', item.id); toast('Deleted'); onClose(); }} />`}
      <button class="btn btn--primary" onClick=${save}>${isNew ? 'Add beamtime' : 'Save'}</button>`}>
    <${Field} label="Facility"><input class="input" data-autofocus list="facilities" value=${f.facility} onInput=${set('facility')} placeholder="BESSY II" /></${Field}>
    <datalist id="facilities">${(settings.facilities || []).map((x) => html`<option key=${x} value=${x} />`)}</datalist>
    <div class="chips" style="margin-top:8px">${(settings.facilities || []).slice(0, 6).map((x) => html`<button key=${x} class="chip" aria-pressed=${f.facility === x ? 'true' : 'false'} onClick=${() => setF({ ...f, facility: x })}>${x}</button>`)}</div>
    <${Field} label="Beamline or end station"><input class="input" value=${f.beamline} onInput=${set('beamline')} placeholder="e.g. BLOCH" /></${Field}>
    <div class="fields-2" style="margin-top:14px">
      <${Field} label="Start"><input class="input" type="date" value=${f.start} onInput=${set('start')} /></${Field}>
      <${Field} label="End"><input class="input" type="date" value=${f.end} min=${f.start} onInput=${set('end')} /></${Field}>
    </div>
    <${Field} label="Notes"><textarea class="textarea" value=${f.notes} onInput=${set('notes')} placeholder="Samples, shifts, travel"></textarea></${Field}>
  </${Sheet}>`;
}

function DeadlineSheet({ item, settings, onClose }) {
  const isNew = !item.id;
  const [f, setF] = useState({ title: item.title || '', facility: item.facility || '', kind: item.kind || 'proposal', date: item.date || '', url: item.url || '', notes: item.notes || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const save = () => {
    if (!f.title.trim() || !f.date) { toast('Add a title and a date'); return; }
    const data = { ...f, title: f.title.trim(), url: f.url.trim() };
    if (isNew) actions.add('deadlines', { ...data, done: false }); else actions.update('deadlines', item.id, data);
    onClose();
  };
  return html`<${Sheet} title=${isNew ? 'New deadline' : 'Deadline'} onClose=${onClose} actions=${html`
      ${!isNew && html`<${DangerButton} onConfirm=${() => { actions.remove('deadlines', item.id); toast('Deleted'); onClose(); }} />`}
      <button class="btn btn--primary" onClick=${save}>${isNew ? 'Add deadline' : 'Save'}</button>`}>
    <div class="chips" style="margin-bottom:14px">${Object.entries(KIND_LABEL).map(([k, l]) => html`<button key=${k} class="chip" aria-pressed=${f.kind === k ? 'true' : 'false'} onClick=${() => setF({ ...f, kind: k })}>${l}</button>`)}</div>
    <${Field} label="Title"><input class="input" data-autofocus value=${f.title} onInput=${set('title')} placeholder=${f.kind === 'proposal' ? 'Proposal call' : 'What is due'} /></${Field}>
    <div class="fields-2" style="margin-top:14px">
      <${Field} label="Date"><input class="input" type="date" value=${f.date} onInput=${set('date')} /></${Field}>
      <${Field} label="Facility (optional)"><input class="input" list="facilities-d" value=${f.facility} onInput=${set('facility')} /></${Field}>
    </div>
    <datalist id="facilities-d">${(settings.facilities || []).map((x) => html`<option key=${x} value=${x} />`)}</datalist>
    <${Field} label="Link (optional)"><input class="input" type="url" value=${f.url} onInput=${set('url')} placeholder="https://" /></${Field}>
    <${Field} label="Notes"><textarea class="textarea" value=${f.notes} onInput=${set('notes')}></textarea></${Field}>
  </${Sheet}>`;
}

function ChapterSheet({ item, chapters, onClose }) {
  const isNew = !item.id;
  const [f, setF] = useState({ title: item.title || '', progress: Number(item.progress) || 0, notes: item.notes || '' });
  const sorted = chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = sorted.findIndex((c) => c.id === item.id);
  const move = (dir) => {
    const other = sorted[idx + dir];
    if (!other) return;
    actions.update('chapters', item.id, { order: other.order });
    actions.update('chapters', other.id, { order: item.order });
    onClose();
  };
  const save = () => {
    if (!f.title.trim()) { toast('Give the chapter a title'); return; }
    const data = { ...f, title: f.title.trim(), progress: Math.max(0, Math.min(100, Number(f.progress) || 0)) };
    // Progress changes are logged per day, so writing earns XP on the day it happens. A new
    // chapter's starting progress is a baseline, not a gain.
    const delta = isNew ? 0 : data.progress - (Number(item.progress) || 0);
    if (delta) {
      const day = todayISO();
      const gains = { ...(item.gains || {}) };
      gains[day] = (Number(gains[day]) || 0) + delta;
      if (!gains[day]) delete gains[day];
      data.gains = gains;
    }
    if (isNew) actions.add('chapters', { ...data, order: (sorted.length ? sorted[sorted.length - 1].order || sorted.length : 0) + 1 });
    else actions.update('chapters', item.id, data);
    if (delta > 0) toast(`${data.title} at ${data.progress}%`, { xp: Math.round(delta * XP.thesisPoint) });
    onClose();
  };
  return html`<${Sheet} title=${isNew ? 'New chapter' : 'Chapter'} onClose=${onClose} actions=${html`
      ${!isNew && html`<${DangerButton} onConfirm=${() => { actions.remove('chapters', item.id); toast('Deleted'); onClose(); }} />`}
      <button class="btn btn--primary" onClick=${save}>${isNew ? 'Add chapter' : 'Save'}</button>`}>
    <${Field} label="Title"><input class="input" data-autofocus value=${f.title} onInput=${(e) => setF({ ...f, title: e.currentTarget.value })} /></${Field}>
    <div class="field" style="margin-top:14px">
      <span class="field__label">Progress ${f.progress}%</span>
      <input class="range" type="range" min="0" max="100" step="5" value=${f.progress} onInput=${(e) => setF({ ...f, progress: Number(e.currentTarget.value) })} />
    </div>
    <${Field} label="Notes"><textarea class="textarea" value=${f.notes} onInput=${(e) => setF({ ...f, notes: e.currentTarget.value })} placeholder="What is missing"></textarea></${Field}>
    ${!isNew && html`<div class="chips" style="margin-top:14px">
      <button class="chip" disabled=${idx <= 0} onClick=${() => move(-1)}>Move up</button>
      <button class="chip" disabled=${idx >= sorted.length - 1} onClick=${() => move(1)}>Move down</button>
    </div>`}
  </${Sheet}>`;
}

function ThesisSheet({ thesis, onClose }) {
  const [f, setF] = useState({ title: thesis.title || '', target: thesis.target || '' });
  return html`<${Sheet} title="Thesis" onClose=${onClose} actions=${html`<button class="btn btn--primary" onClick=${() => { actions.saveSettings({ thesis: f }); onClose(); }}>Save</button>`}>
    <${Field} label="Working title"><input class="input" data-autofocus value=${f.title} onInput=${(e) => setF({ ...f, title: e.currentTarget.value })} /></${Field}>
    <${Field} label="Target submission date"><input class="input" type="date" value=${f.target} onInput=${(e) => setF({ ...f, target: e.currentTarget.value })} /></${Field}>
  </${Sheet}>`;
}

export function PhdView({ state }) {
  const { beamtimes, deadlines, chapters, settings } = state.data;
  const today = todayISO();
  const [sheet, setSheet] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const bts = beamtimes.map((b) => ({ b, st: beamtimeState(b, today) }));
  const current = bts.filter((x) => x.st.phase !== 'past').sort((a, b) => a.b.start.localeCompare(b.b.start));
  const past = bts.filter((x) => x.st.phase === 'past').sort((a, b) => b.b.start.localeCompare(a.b.start));
  const openD = deadlines.filter((d) => !d.done).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const doneD = deadlines.filter((d) => d.done).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const chs = chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const pct = thesisProgress(chs);
  const target = settings.thesis.target;
  const toTarget = target ? daysBetween(today, target) : null;

  const btRow = ({ b, st }) => html`<button key=${b.id} class="row row--button" onClick=${() => setSheet({ type: 'beamtime', item: b })}>
    <${DateChip} iso=${b.start} accent=${st.phase !== 'past'} />
    <div class="row__main">
      <div class="row__title">${b.facility}${b.beamline ? html` <span class="muted" style="font-weight:400">${b.beamline}</span>` : ''}</div>
      <div class="row__sub">${fmtRange(b.start, b.end)}</div>
      ${b.notes && html`<div class="row__sub faint">${b.notes}</div>`}
    </div>
    <div class="row__side">
      ${st.phase === 'upcoming' && html`<${Countdown} n=${st.n} />`}
      ${st.phase === 'now' && html`<span class="pill pill--accent">Day ${st.day} of ${st.total}</span>`}
      ${st.phase === 'past' && html`<span class="faint">${st.n === 0 ? 'ended today' : `${st.n} days ago`}</span>`}
    </div>
  </button>`;

  const dlRow = (d) => {
    const n = daysBetween(today, d.date);
    const cls = d.done ? 'faint' : n < 0 ? 'due due--late' : n <= 7 ? 'due due--soon' : 'due';
    return html`<div key=${d.id} class=${'row row--button row--indent' + (d.done ? ' row--done' : '')} role="button" tabindex="0" onClick=${() => setSheet({ type: 'deadline', item: d })}>
      <${Check} checked=${!!d.done} label=${d.done ? 'Mark as open' : 'Mark as submitted'} onChange=${(v) => { actions.update('deadlines', d.id, { done: v, doneAt: v ? Date.now() : null }); if (v) toast('Marked as submitted', { xp: XP.deadline }); }} />
      <div class="row__main">
        <div class="row__title">${d.title}</div>
        <div class="row__sub">${[d.facility, KIND_LABEL[d.kind] || 'Deadline', fmtDate(d.date)].filter(Boolean).join(', ')}${d.url ? html` <a href=${d.url} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>Open link</a>` : ''}</div>
      </div>
      <span class=${cls}>${d.done ? 'submitted' : n < 0 ? `${-n} days late` : relDays(d.date, today).text}</span>
    </div>`;
  };

  const next = upcoming(state.data, today)[0];
  const nextN = next ? daysBetween(today, next.date) : null;
  return html`<div>
    <${PageHead} over=${`Thesis ${pct}%${target ? ` · submission ${relDays(target, today).text}` : ''}`} title="PhD" />
    ${next && html`<div class="milestone">
      <div>
        <div class="milestone__num num">${nextN === 0 ? 'NOW' : nextN}</div>
        <div class="milestone__unit">${nextN === 0 ? (next.kind === 'beamtime' ? next.side : 'today') : nextN === 1 ? 'day to go' : 'days to go'}</div>
      </div>
      <div class="milestone__what">
        <span class="overline">${next.kind === 'beamtime' ? 'Next beamtime' : next.kind === 'thesis' ? 'Submission' : 'Next deadline'}</span>
        <div class="milestone__title">${next.title}</div>
        <div class="milestone__sub">${next.sub || fmtDate(next.date)}</div>
      </div>
    </div>`}
    <div class="grid-2">
      <div class="stack">
        <${Section} title="Beamtimes" action=${html`<button class="btn btn--quiet btn--sm" onClick=${() => setSheet({ type: 'beamtime', item: {} })}><${Icon} name="plus" size="xs" />Add</button>`}>
          <div class="group">
            ${current.length ? current.map(btRow) : html`<${Empty} title="No beamtime scheduled">Add your next allocation to see the countdown everywhere.</${Empty}>`}
          </div>
          ${past.length > 0 && html`<p style="margin:10px 2px 0"><button class="link-btn" onClick=${() => setShowPast(!showPast)}>${showPast ? 'Hide past beamtimes' : `Show ${past.length} past ${past.length === 1 ? 'beamtime' : 'beamtimes'}`}</button></p>`}
          ${showPast && html`<div class="group" style="margin-top:10px">${past.map(btRow)}</div>`}
        </${Section}>
        <${Section} title="Deadlines" action=${html`<button class="btn btn--quiet btn--sm" onClick=${() => setSheet({ type: 'deadline', item: {} })}><${Icon} name="plus" size="xs" />Add</button>`}>
          <div class="group">
            ${openD.length ? openD.map(dlRow) : html`<${Empty} title="No open deadlines">Proposal calls, reports and abstracts go here.</${Empty}>`}
          </div>
          ${doneD.length > 0 && html`<p style="margin:10px 2px 0"><button class="link-btn" onClick=${() => setShowDone(!showDone)}>${showDone ? 'Hide submitted' : `Show ${doneD.length} submitted`}</button></p>`}
          ${showDone && html`<div class="group" style="margin-top:10px">${doneD.map(dlRow)}</div>`}
        </${Section}>
      </div>
      <${Section} title="Thesis" action=${html`<button class="btn btn--quiet btn--sm" onClick=${() => setSheet({ type: 'thesis' })}><${Icon} name="edit" size="xs" />Edit</button>`}>
        <div class="group">
          <div class="thesis-head">
            <div class="thesis-head__pct">${pct}<span class="countdown__unit" style="font-size:16px">%</span></div>
            <div class="thesis-head__main">
              <div class="row__title">${settings.thesis.title || 'PhD thesis'}</div>
              <div class="row__sub">${target ? (toTarget >= 0 ? `Submission ${relDays(target, today).text}, ${fmtShort(target)}` : `Target date passed ${-toTarget} days ago`) : html`<button class="link-btn" onClick=${() => setSheet({ type: 'thesis' })}>Set a target date</button>`}</div>
              <div class="bar" style="margin-top:10px"><div class="bar__fill" style=${`width:${pct}%`}></div></div>
            </div>
          </div>
        </div>
        <div class="group" style="margin-top:12px">
          ${chs.map((c) => html`<button key=${c.id} class="row row--button" onClick=${() => setSheet({ type: 'chapter', item: c })}>
            <div class="row__main">
              <div class="chapter__top"><span class="row__title"><${Chem} text=${c.title} /></span><span class="chapter__pct">${Number(c.progress) || 0}%</span></div>
              <div class="bar" style="margin-top:8px"><div class="bar__fill" style=${`width:${Number(c.progress) || 0}%`}></div></div>
            </div>
          </button>`)}
          <button class="row row--button" onClick=${() => setSheet({ type: 'chapter', item: {} })}>
            <span class="faint" style="display:flex"><${Icon} name="plus" size="sm" /></span>
            <span class="muted">Add a chapter</span>
          </button>
        </div>
      </${Section}>
    </div>
    ${sheet && sheet.type === 'beamtime' && html`<${BeamtimeSheet} item=${sheet.item} settings=${settings} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'deadline' && html`<${DeadlineSheet} item=${sheet.item} settings=${settings} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'chapter' && html`<${ChapterSheet} item=${sheet.item} chapters=${chs} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.type === 'thesis' && html`<${ThesisSheet} thesis=${settings.thesis} onClose=${() => setSheet(null)} />`}
  </div>`;
}

export { isoOf };
