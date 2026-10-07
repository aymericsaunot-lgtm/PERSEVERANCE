// Progress: your level, today's XP on a dial against the daily goal, the four attributes,
// weekly XP and the latest gains.
import { html, useState, useEffect } from '../../vendor/preact.js';
import { actions } from '../store.js';
import { Rich, Section, Sheet, PageHead, Empty, useWidth } from '../ui.js';
import { RULES } from '../lib/xp.js';
import { todayISO, daysBetween, fmtDate, fmtShort, parseISO } from '../lib/dates.js';

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export const inWords = (n) => (n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n));

export function Ruler({ pct, ticks = 41, label }) {
  const on = Math.round(Math.max(0, Math.min(1, pct || 0)) * (ticks - 1));
  return html`<div class="ruler" role="img" aria-label=${label}>
    ${Array.from({ length: ticks }, (_, i) => html`<i key=${i} class=${i < on ? 'on' : i === on ? 'head' : ''}></i>`)}
  </div>`;
}

// Today's XP on an analogue dial, from 0 to the daily goal.
function Dial({ xp, goal }) {
  const cx = 100;
  const cy = 104;
  const frac = Math.max(0, Math.min(1, xp / goal));
  const at = (f, r) => [cx - r * Math.cos(f * Math.PI), cy - r * Math.sin(f * Math.PI)];
  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    const major = i % 5 === 0;
    const [x1, y1] = at(f, 86);
    const [x2, y2] = at(f, major ? 72 : 78);
    ticks.push(html`<line key=${i} x1=${x1} y1=${y1} x2=${x2} y2=${y2} class=${major ? 'gauge__tick gauge__tick--major' : 'gauge__tick'} />`);
  }
  const [ax, ay] = at(frac, 92);
  const arc = frac > 0 ? `M${cx - 92},${cy} A92,92 0 0 1 ${ax.toFixed(2)},${ay.toFixed(2)}` : '';
  return html`<svg viewBox="0 0 200 116" aria-hidden="true">
    ${arc && html`<path d=${arc} class="gauge__arc" />`}
    ${ticks}
    <text class="gauge__scale" x=${cx - 86} y=${cy + 12} text-anchor="middle">0</text>
    <text class="gauge__scale" x=${cx} y=${cy - 58} text-anchor="middle">${Math.round(goal / 2)}</text>
    <text class="gauge__scale" x=${cx + 86} y=${cy + 12} text-anchor="middle">${goal}</text>
    <line x1=${cx} y1=${cy} x2=${cx - 66} y2=${cy} class="gauge__needle" style=${`transform: rotate(${frac * 180}deg); transform-origin: ${cx}px ${cy}px`} />
    <circle cx=${cx} cy=${cy} r="5" class="gauge__hub" />
  </svg>`;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Week({ week }) {
  const hit = week.filter((d) => d.hit).length;
  return html`<div class="week" role="img" aria-label=${`Daily goal reached on ${hit} of 7 days this week`}>
    ${week.map((d, i) => html`<span key=${d.day} class=${[d.future ? 'future' : d.hit ? 'hit' : d.xp > 0 ? 'part' : '', d.today ? 'today' : ''].join(' ')}><i></i>${DAY_LETTERS[i]}</span>`)}
  </div>`;
}

export function TodayGauge({ p, go }) {
  return html`<button class="group tile-btn gauge" onClick=${() => go('progress')} aria-label=${`Today ${p.todayXP} of ${p.goal} XP. Open progress`}>
    <span class="overline">Today</span>
    <${Dial} xp=${p.todayXP} goal=${p.goal} />
    <div class="gauge__value">${p.todayXP}</div>
    <div class="gauge__unit">of ${p.goal} XP${p.todayXP > p.goal ? `, ${p.todayXP - p.goal} over` : ''}</div>
    <${Week} week=${p.week} />
  </button>`;
}

export function LevelCard({ p, go }) {
  return html`<button class="group tile-btn lvl" onClick=${() => go('progress')} aria-label=${`Level ${p.level}. Open progress`}>
    <div class="lvl__top"><span class="overline">Level</span><span class="xp-gain">${fmt(p.total)} XP</span></div>
    <div class="lvl__num">${p.level}</div>
    <div class="lvl__sub">${fmt(p.next - p.total)} XP to level ${p.level + 1}</div>
    <div class="lvl__attrs">${p.attrs.map((a) => html`<span key=${a.id} class=${'spot--' + a.id}><i class="spot-dot"></i>${a.label}<b>${a.level}</b></span>`)}</div>
    <${Ruler} pct=${p.pct} ticks=${31} label=${`${Math.round(p.pct * 100)}% of the way to level ${p.level + 1}`} />
  </button>`;
}

export function LevelLink({ p, go }) {
  return html`<button class="level-link" onClick=${() => go('progress')} aria-label=${`Level ${p.level}, ${Math.round(p.pct * 100)}% to the next. Open progress`}>
    Level ${p.level}<span class="bar"><span class="bar__fill" style=${`display:block;width:${Math.round(p.pct * 100)}%`}></span></span>
  </button>`;
}

export function SideLevel({ p, go, active }) {
  return html`<button class="side-level" aria-current=${active ? 'page' : undefined} onClick=${() => go('progress')}>
    <span class="overline">Level</span>
    <div class="side-level__num">${p.level}</div>
    <div class="side-level__sub">${p.todayXP} of ${p.goal} XP today</div>
    <div class="bar"><div class="bar__fill" style=${`width:${Math.round(Math.min(1, p.todayXP / p.goal) * 100)}%`}></div></div>
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
  const best = weeks.reduce((b, w, i) => (w.xp > weeks[b].xp ? i : b), 0);
  const bx = x(best);
  const by = y(weeks[best].xp);
  const anchorEnd = bx > W - 90;
  return html`<div class="chart" ref=${ref}>
    <svg viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} role="img" aria-label=${`XP per week, last 12 weeks: ${weeks.map((w) => w.xp).join(', ')}`}>
      ${[0.25, 0.5, 0.75].map((f) => html`<line key=${f} x1="0" x2=${W} y1=${y(max * f)} y2=${y(max * f)} stroke="var(--rule)" stroke-dasharray="2 4" />`)}
      <line x1="0" x2=${W} y1=${H - 6} y2=${H - 6} stroke="var(--ink)" />
      <path d=${line} fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" />
      ${weeks[best].xp > 0 && html`<g>
        <line x1=${bx} x2=${bx} y1=${by - 24} y2=${H - 6} stroke="var(--accent)" stroke-width="1.2" />
        <path d=${`M${bx},${by - 24} l11,4 l-11,4 Z`} fill="var(--accent)" />
        <text class="chart__label" x=${anchorEnd ? bx - 6 : bx + 15} y=${by - 15} text-anchor=${anchorEnd ? 'end' : 'start'}>Best week, ${fmt(weeks[best].xp)} XP</text>
      </g>`}
      ${weeks.map((w, i) => html`<rect key=${w.start} x=${x(i) - (w.current ? 4 : 2.5)} y=${y(w.xp) - (w.current ? 4 : 2.5)} width=${w.current ? 8 : 5} height=${w.current ? 8 : 5} fill=${w.current ? 'var(--accent)' : 'var(--sheet)'} stroke=${w.current ? 'var(--accent)' : 'var(--ink)'} stroke-width="1.2" />`)}
    </svg>
    <div class="chart__axis"><span>Week of ${fmtShort(weeks[0].start)}</span><span>This week</span></div>
  </div>`;
}

const KIND = { task: 'Task', deadline: 'Deadline', beamtime: 'Beamtime', thesis: 'Thesis', paper: 'Paper read', sport: 'Sport', habit: 'Habit', bonus: 'Bonus' };

function whenLabel(day) {
  const n = daysBetween(day, todayISO());
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? parseISO(day).toLocaleDateString('en-GB', { weekday: 'long' }) : fmtDate(day);
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
    <p class="muted" style="margin-bottom:12px">XP comes from what you already log, so there is nothing to track twice. Undoing something takes its XP back.</p>
    <div class="rules">
      ${RULES.map(([what, xp, attr]) => html`<div key=${what} class="rules__row"><span class=${'spot-dot spot--' + attr}></span><span>${what}</span><span>${xp}</span></div>`)}
    </div>
    <p class="field__hint" style="margin-top:12px">Work, Mind, Body and Discipline each have their own level, so you can see what you have been neglecting.</p>
    <div class="field" style="margin-top:20px">
      <span class="field__label">Daily goal</span>
      <div class="chips">
        ${presets.map((n) => html`<button key=${n} class="chip" aria-pressed=${Number(value) === n ? 'true' : 'false'} onClick=${() => setValue(n)}>${n} XP</button>`)}
        <input class="input" style="width:92px;min-height:30px;padding:3px 10px" inputmode="numeric" aria-label="Daily goal in XP" value=${value} onInput=${(e) => setValue(e.currentTarget.value)} />
      </div>
      <span class="field__hint">A full day of tasks, habits and some sport lands around 100.</span>
    </div>
  </${Sheet}>`;
}

export function ProgressView({ state, p }) {
  const [rules, setRules] = useState(false);
  const delta = p.lastWeekXP > 0 ? Math.round(((p.weekXP - p.lastWeekXP) / p.lastWeekXP) * 100) : null;
  return html`<div>
    <${PageHead} over=${`${fmt(p.total)} XP in total`} title="Progress"
      action=${html`<button class="link-btn" onClick=${() => setRules(true)}>How XP works</button>`} />

    <div class="prog-hero">
      <div class="prog-hero__main">
        <div class="prog-hero__num" aria-hidden="true">${p.level}</div>
        <div>
          <div class="prog-hero__name">Level ${inWords(p.level)}</div>
          <div class="prog-hero__xp">${fmt(p.into)} of ${fmt(p.step)} XP, ${fmt(p.next - p.total)} to level ${p.level + 1}</div>
        </div>
      </div>
      <${Ruler} pct=${p.pct} ticks=${61} label=${`${Math.round(p.pct * 100)}% of the way to level ${p.level + 1}`} />
    </div>
    <div class="prog-stats">
      <div class="stat"><div class="stat__value">${p.todayXP}</div><div class="stat__label">Today, goal ${p.goal}</div></div>
      <div class="stat"><div class="stat__value">${fmt(p.weekXP)}</div><div class="stat__label">This week${delta != null ? `, ${delta >= 0 ? '+' : ''}${delta}% on last` : ''}</div></div>
      <div class="stat"><div class="stat__value">${p.goalStreak}</div><div class="stat__label">${p.goalStreak === 1 ? 'Day' : 'Days'} in a row at goal</div></div>
    </div>

    <${Section} title="Attributes" meta="This week">
      <div class="attr-grid">
        ${p.attrs.map((a) => html`<div key=${a.id} class=${`group attr spot--${a.id}`} title=${a.from}>
          <span class="attr__name">${a.label}</span>
          <div class="attr__lvl"><small>LV</small>${a.level}</div>
          <div class="attr__meta">${fmt(a.xp)} XP${a.week ? `, ${fmt(a.week)} this week` : ''}</div>
          <div class="bar" style="margin-top:14px"><div class="bar__fill" style=${`width:${Math.round(a.pct * 100)}%`}></div></div>
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
            <span class=${'spot-dot spot--' + e.attr}></span>
            <div class="row__main">
              <div class="row__title">${e.kind === 'paper' ? html`<${Rich} text=${e.label} />` : e.label}</div>
              <div class="row__sub">${KIND[e.kind] || e.kind}, ${whenLabel(e.day)}</div>
            </div>
            <span class="xp-gain">${e.xp > 0 ? '+' : ''}${e.xp}</span>
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
    const t = setTimeout(onClose, 4500);
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, []);
  return html`<div class="levelup" role="alertdialog" aria-label=${`Level up: level ${level}`} onClick=${onClose}>
    <div class="levelup__inner">
      <span class="overline" style="color:inherit;opacity:0.8">New level</span>
      <div class="levelup__num">${level}</div>
      <div class="levelup__word">Level ${inWords(level)}</div>
      <p class="levelup__sub">Tap to carry on.</p>
    </div>
  </div>`;
}
