// Progress: level (named after the suits, Mark I, II, ...), today's XP against the daily goal,
// the four attributes, weekly XP and the latest gains.
import { html, useState, useEffect } from '../../vendor/preact.js';
import { actions } from '../store.js';
import { Orb, Rich, Section, Sheet, PageHead, Empty, useWidth } from '../ui.js';
import { RULES, roman } from '../lib/xp.js';
import { todayISO, daysBetween, fmtDate, fmtShort } from '../lib/dates.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export function Ruler({ pct, ticks = 48, label }) {
  const on = Math.round(Math.max(0, Math.min(1, pct || 0)) * ticks);
  return html`<div class="ruler" role="img" aria-label=${label}>
    ${Array.from({ length: ticks }, (_, i) => html`<i key=${i} class=${i < on ? (i === on - 1 ? 'on head' : 'on') : ''}></i>`)}
  </div>`;
}

function Arc({ pct, size, stroke, track = 'var(--soft-2)', cls = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, pct || 0));
  return html`<svg viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${track} stroke-width=${stroke} class=${cls ? cls + '__track' : ''} />
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--accent)" stroke-width=${stroke} stroke-linecap="round"
      stroke-dasharray=${c} stroke-dashoffset=${v > 0 ? c * (1 - v) : c + 1} class=${cls ? cls + '__value' : ''} />
  </svg>`;
}

function Momentum({ week }) {
  const hit = week.filter((d) => d.hit).length;
  return html`<div class="momentum" role="img" aria-label=${`Daily goal reached on ${hit} of 7 days this week`}>
    ${week.map((d) => html`<span key=${d.day} class=${[d.future ? 'future' : d.hit ? 'hit' : d.xp > 0 ? 'part' : '', d.today ? 'today' : ''].join(' ')}></span>`)}
  </div>`;
}

// Today's XP against the daily goal, with the week as seven dots.
export function TodayRing({ p, go }) {
  return html`<button class="group tile-btn ring-tile" onClick=${() => go('progress')} aria-label=${`Today ${p.todayXP} of ${p.goal} XP. Open progress`}>
    <span class="overline">Today</span>
    <div class="ring">
      <${Arc} pct=${p.todayXP / p.goal} size=${112} stroke=${8} cls="ring" />
      <div class="ring__label"><span class="ring__num num">${p.todayXP}</span><span class="ring__goal">/ ${p.goal} XP</span></div>
    </div>
    <${Momentum} week=${p.week} />
  </button>`;
}

export function LevelCard({ p, go }) {
  return html`<button class="group tile-btn aura lvl" style="--aura: var(--accent); --ax: 100%; --ay: -10%" onClick=${() => go('progress')} aria-label=${`Level ${p.level}, Mark ${p.mark}. Open progress`}>
    <div class="lvl__top"><span class="overline">Level</span><span class="xp-gain num">${fmt(p.total)} XP</span></div>
    <div class="lvl__num num">${p.level}</div>
    <div class="lvl__mark">Mark ${p.mark}</div>
    <div class="lvl__sub">${fmt(p.next - p.total)} XP to Mark ${roman(p.level + 1)}</div>
    <${Ruler} pct=${p.pct} ticks=${30} label=${`${Math.round(p.pct * 100)}% of the way to level ${p.level + 1}`} />
  </button>`;
}

export function LevelChip({ p, go }) {
  return html`<button class="level-chip" onClick=${() => go('progress')} aria-label=${`Level ${p.level}, Mark ${p.mark}. Open progress`}>
    <span class="level-chip__ring"><${Arc} pct=${p.pct} size=${24} stroke=${3} /></span>Mark ${p.mark}
  </button>`;
}

export function SideLevel({ p, go, active }) {
  return html`<button class="side-level" aria-current=${active ? 'page' : undefined} onClick=${() => go('progress')}>
    <div class="side-level__row">
      <span class="level-chip__ring" style="width:30px;height:30px"><${Arc} pct=${p.todayXP / p.goal} size=${30} stroke=${3.5} /></span>
      <div>
        <div class="side-level__mark">Mark ${p.mark}</div>
        <div class="side-level__sub">${p.todayXP}/${p.goal} XP today</div>
      </div>
    </div>
    <div class="bar"><div class="bar__fill" style=${`width:${Math.round(p.pct * 100)}%`}></div></div>
  </button>`;
}

// Weekly XP as one line, with a flag on the best week.
function WeekChart({ weeks }) {
  const [ref, W] = useWidth(320);
  const H = 150;
  const top = 30;
  const max = Math.max(100, ...weeks.map((w) => w.xp));
  const x = (i) => 6 + (i / (weeks.length - 1)) * (W - 12);
  const y = (v) => top + (1 - v / max) * (H - top - 6);
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.xp).toFixed(1)}`).join(' ');
  const area = `${line} L${x(weeks.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const best = weeks.reduce((b, w, i) => (w.xp > weeks[b].xp ? i : b), 0);
  const bx = x(best);
  const by = y(weeks[best].xp);
  const anchorEnd = bx > W - 80;
  return html`<div class="chart" ref=${ref}>
    <svg viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} role="img" aria-label=${`XP per week, last 12 weeks: ${weeks.map((w) => w.xp).join(', ')}`}>
      <defs>
        <linearGradient id="week-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--accent)" stop-opacity="0.26" />
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d=${area} fill="url(#week-fill)" />
      <path d=${line} fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round" />
      ${weeks[best].xp > 0 && html`<g>
        <line x1=${bx} x2=${bx} y1=${by} y2=${H} stroke="var(--accent)" stroke-opacity="0.5" />
        <line x1=${bx} x2=${bx} y1=${by - 22} y2=${by} stroke="var(--ink)" stroke-width="1.2" />
        <path d=${`M${bx},${by - 22} l9,3.5 l-9,3.5 Z`} fill="var(--ink)" />
        <text class="chart__label" x=${anchorEnd ? bx - 6 : bx + 13} y=${by - 13} text-anchor=${anchorEnd ? 'end' : 'start'}>BEST ${fmt(weeks[best].xp)}</text>
      </g>`}
      ${weeks.map((w, i) => html`<circle key=${w.start} cx=${x(i)} cy=${y(w.xp)} r=${w.current ? 4.5 : 2.2} fill=${w.current ? 'var(--accent)' : 'var(--surface)'} stroke="var(--accent)" stroke-width=${w.current ? 0 : 1.4} />`)}
    </svg>
    <div class="chart__axis"><span>${fmtShort(weeks[0].start)}</span><span>This week</span></div>
  </div>`;
}

const KIND = { task: 'Task', deadline: 'Deadline', beamtime: 'Beamtime', thesis: 'Thesis', paper: 'Paper read', sport: 'Sport', habit: 'Habit', bonus: 'Bonus' };

function whenLabel(day) {
  const n = daysBetween(day, todayISO());
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? `${n} days ago` : fmtDate(day);
}

function RulesSheet({ goal, onClose }) {
  const [value, setValue] = useState(goal);
  const presets = [60, 100, 150, 200];
  const save = () => {
    const n = Math.round(Number(value));
    if (n >= 20 && n <= 1000) actions.saveSettings({ xpGoal: n });
    onClose();
  };
  return html`<${Sheet} title="How XP works" onClose=${onClose} actions=${html`<button class="btn btn--primary" onClick=${save}>Done</button>`}>
    <p class="muted" style="margin-bottom:14px">XP comes from what you already log. Nothing to track twice, and undoing something takes its XP back.</p>
    <div class="rules">
      ${RULES.map(([what, xp, attr]) => html`<div key=${what} class="rules__row"><span class=${'attr__dot aura--' + attr}></span><span>${what}</span><span>${xp}</span></div>`)}
    </div>
    <p class="field__hint" style="margin-top:12px">Work, Mind, Body and Discipline each level up on their own. Levels are named after the suits: level 12 is Mark XII.</p>
    <div class="field" style="margin-top:20px">
      <span class="field__label">Daily goal</span>
      <div class="chips">
        ${presets.map((n) => html`<button key=${n} class="chip" aria-pressed=${Number(value) === n ? 'true' : 'false'} onClick=${() => setValue(n)}>${n} XP</button>`)}
        <input class="input" style="width:96px;min-height:32px;padding:4px 12px" inputmode="numeric" aria-label="Daily goal in XP" value=${value} onInput=${(e) => setValue(e.currentTarget.value)} />
      </div>
      <span class="field__hint">A good day of tasks, habits and some sport lands around 100.</span>
    </div>
  </${Sheet}>`;
}

export function ProgressView({ state, p }) {
  const [rules, setRules] = useState(false);
  const delta = p.lastWeekXP > 0 ? Math.round(((p.weekXP - p.lastWeekXP) / p.lastWeekXP) * 100) : null;
  return html`<div>
    <${PageHead} over=${`Level ${p.level} · ${fmt(p.total)} XP`} title="Progress"
      action=${html`<button class="link-btn" onClick=${() => setRules(true)}>How XP works</button>`} />

    <div class="group aura" style="--aura: var(--accent); --ax: 0%; --ay: -20%; margin-bottom:26px">
      <div class="prog-hero">
        <div class="prog-hero__main">
          <div class="prog-hero__num num" aria-hidden="true">${p.level}</div>
          <div>
            <div class="prog-hero__mark">Mark<strong>${p.mark}</strong></div>
            <div class="prog-hero__xp">${fmt(p.into)} / ${fmt(p.step)} XP · ${fmt(p.next - p.total)} to Mark ${roman(p.level + 1)}</div>
          </div>
        </div>
        <${Ruler} pct=${p.pct} ticks=${60} label=${`${Math.round(p.pct * 100)}% of the way to level ${p.level + 1}`} />
      </div>
      <div class="prog-stats">
        <div class="stat"><div class="stat__value num">${p.todayXP}</div><div class="stat__label">Today, goal ${p.goal}</div></div>
        <div class="stat"><div class="stat__value num">${fmt(p.weekXP)}</div><div class="stat__label">This week${delta != null ? ` ${delta >= 0 ? '+' : ''}${delta}%` : ''}</div></div>
        <div class="stat"><div class="stat__value num">${p.goalStreak}</div><div class="stat__label">Goal streak</div></div>
      </div>
    </div>

    <${Section} title="Attributes" meta="This week">
      <div class="attr-grid">
        ${p.attrs.map((a) => html`<div key=${a.id} class=${`group aura attr aura--${a.id}`} style="--ax: 0%; --ay: 0%">
          <div style="display:flex;align-items:center;justify-content:space-between"><span class="attr__name">${a.label}</span><span class=${'attr__dot aura--' + a.id}></span></div>
          <div class="attr__lvl num"><small>LV</small>${a.level}</div>
          <div class="attr__meta">${fmt(a.xp)} XP${a.week ? `, +${fmt(a.week)} this week` : ''}</div>
          <div class="bar" title=${a.from}><div class="bar__fill" style=${`width:${Math.round(a.pct * 100)}%`}></div></div>
        </div>`)}
      </div>
    </${Section}>

    <div class="grid-2">
      <${Section} title="Weekly XP" meta=${`Last week ${fmt(p.lastWeekXP)}`}>
        <div class="group"><${WeekChart} weeks=${p.weeks} /></div>
      </${Section}>
      <${Section} title="Latest gains">
        <div class="group">
          ${p.recent.length ? p.recent.slice(0, 12).map((e, i) => html`<div key=${i} class="row">
            <span class=${'attr__dot aura--' + e.attr}></span>
            <div class="row__main">
              <div class="row__title">${e.kind === 'paper' ? html`<${Rich} text=${e.label} />` : e.label}</div>
              <div class="row__sub">${KIND[e.kind] || e.kind}, ${whenLabel(e.day)}</div>
            </div>
            <span class="xp-gain num">${e.xp > 0 ? '+' : ''}${e.xp}</span>
          </div>`) : html`<${Empty} title="No XP yet">Finish a task, tick a habit or log a session and it shows up here.</${Empty}>`}
        </div>
      </${Section}>
    </div>
    ${rules && html`<${RulesSheet} goal=${p.goal} onClose=${() => setRules(false)} />`}
  </div>`;
}

// Shown once per new level reached on this device.
export function LevelUp({ level, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4800);
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, []);
  return html`<div class="levelup" role="alertdialog" aria-label=${`Level up: level ${level}, Mark ${roman(level)}`} onClick=${onClose}>
    <div class="levelup__inner">
      <${Orb} size=${56} live=${true} />
      <span class="overline" style="color:rgba(244,244,241,0.6)">Level up</span>
      <div class="levelup__num num">${level}</div>
      <div class="levelup__mark">Mark ${roman(level)} online</div>
      <p class="levelup__sub">Tap anywhere to continue.</p>
    </div>
  </div>`;
}
