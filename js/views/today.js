import { html, useState } from '../../vendor/preact.js';
import { Icon, Rich, Section, Empty } from '../ui.js';
import { todayISO, relDays, fmtShort } from '../lib/dates.js';
import { TaskRow, TaskSheet, QuickAddTask, todayTasks } from './tasks.js';
import { ReadingStats, PaperSheet } from './papers.js';
import { authorShort } from '../lib/papers.js';
import { Horizon, NextUp, thesisProgress, upcoming } from './phd.js';
import { HabitChips, SurfHero, useSurf } from './life.js';
import { TodayGauge, LevelCard, LevelLink, inWords } from './progress.js';

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const count = (n, one, many) => `${n < 20 ? inWords(n) : n} ${n === 1 ? one : many}`;

// The almanac line: sun, tide and swell for today, when the forecast is in.
function Facts({ settings }) {
  const { summary } = useSurf(settings.surf);
  const now = Date.now() / 1000;
  const facts = [];
  if (summary) {
    if (summary.sun.rise) facts.push([summary.sun.rise, 'sunrise']);
    if (summary.sun.set) facts.push([summary.sun.set, 'sunset']);
    const tide = summary.tide.extremes.find((e) => e.t > now) || summary.tide.extremes[summary.tide.extremes.length - 1];
    if (tide) facts.push([tide.label, `${tide.type === 'High' ? 'high' : 'low'} water`]);
    const n = summary.now;
    if (n.height != null) facts.push([`${n.height.toFixed(1)} m`, `swell at ${Math.round(n.period || 0)} s`]);
    if (n.sst != null) facts.push([`${n.sst.toFixed(0)}°C`, 'sea']);
  }
  const d = new Date();
  const dayOfYear = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
  if (!facts.length) facts.push([`Day ${dayOfYear}`, `of ${new Date(d.getFullYear(), 1, 29).getDate() === 29 ? 366 : 365}`]);
  return html`<div class="masthead__facts">${facts.map(([v, l]) => html`<span key=${l}><b>${v}</b>${l}</span>`)}</div>`;
}

export function TodayView({ state, p, go }) {
  const { tasks, papers, arxiv, chapters, habits, settings } = state.data;
  const areas = settings.taskAreas || [];
  const today = todayISO();
  const [openTask, setOpenTask] = useState(null);
  const [openPaper, setOpenPaper] = useState(null);
  const list = todayTasks(tasks, today);
  const late = list.filter((t) => t.due && t.due < today).length;
  const reading = papers.filter((x) => x.status === 'reading').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 3);
  const newMatches = arxiv.filter((x) => x.status === 'new').length;
  const pct = thesisProgress(chapters);
  const target = settings.thesis.target;
  const paper = openPaper && papers.find((x) => x.id === openPaper.id);
  const next = upcoming(state.data, today).find((i) => i.kind !== 'thesis');
  const now = new Date();

  const lede = [
    list.length ? `${cap(count(list.length, 'task', 'tasks'))} on today's list${late ? `, ${late === list.length ? (late === 1 ? 'and it is late' : 'all of them late') : `${inWords(late)} of them late`}` : ''}.` : 'Nothing due today.',
    next && `${next.title} ${next.side}.`,
  ].filter(Boolean).join(' ');

  return html`<div>
    <header class="masthead">
      <div class="masthead__top">
        <span class="overline">${now.toLocaleDateString('en-GB', { weekday: 'long' })} · Week ${isoWeek(now)}</span>
        <${LevelLink} p=${p} go=${go} />
      </div>
      <h1 class="masthead__date">${now.getDate()} ${now.toLocaleDateString('en-GB', { month: 'long' })}</h1>
      <${Facts} settings=${settings} />
      <p class="masthead__lede">${lede}</p>
    </header>

    <div class="bento">
      <div class="bento__col bento__col--main">
        <div style="--o:1">
          <${Section} title="Today" action=${html`<button class="link-btn" onClick=${() => go('tasks')}>All tasks</button>`}>
            <div class="group">
              ${list.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${areas} onOpen=${setOpenTask} />`)}
              <div style=${list.length ? 'border-top:1px solid var(--rule)' : ''}>
                <${QuickAddTask} areas=${areas} defaultDue=${today} placeholder="Add a task for today" compact=${true} />
              </div>
            </div>
          </${Section}>
        </div>
        <div style="--o:3">
          <${Section} title="Habits" action=${html`<button class="link-btn" onClick=${() => go('life')}>History</button>`}>
            <div class="group"><${HabitChips} habits=${habits} /></div>
          </${Section}>
        </div>
        <div style="--o:5">
          <${Section} title="Coming up" action=${html`<button class="link-btn" onClick=${() => go('phd')}>PhD</button>`}>
            <div class="group">
              <${Horizon} data=${state.data} />
              <${NextUp} data=${state.data} go=${go} limit=${3} />
            </div>
          </${Section}>
        </div>
      </div>

      <div class="bento__col">
        <div class="duo" style="--o:2">
          <${TodayGauge} p=${p} go=${go} />
          <${LevelCard} p=${p} go=${go} />
        </div>
        <div style="--o:4"><${SurfHero} settings=${settings} link=${true} /></div>
        <div style="--o:6">
          <${Section} title="Reading" action=${html`<button class="link-btn" onClick=${() => go('papers')}>Library</button>`}>
            <div class="group">
              <${ReadingStats} papers=${papers} compact=${true} />
              ${reading.map((x) => html`<button key=${x.id} class="row row--button" onClick=${() => setOpenPaper(x)}>
                <span class="faint" style="display:flex"><${Icon} name="book" size="sm" /></span>
                <div class="row__main">
                  <div class="paper__title" style="font-size:16px"><${Rich} text=${x.title} /></div>
                  <div class="row__sub">${authorShort(x)}${x.year ? `, ${x.year}` : ''}</div>
                </div>
              </button>`)}
              ${newMatches > 0 && html`<button class="row row--button" onClick=${() => go('papers/watch')}>
                <span style="color:var(--accent);display:flex"><${Icon} name="bell" size="sm" /></span>
                <div class="row__main"><div class="row__title">${newMatches} new arXiv ${newMatches === 1 ? 'match' : 'matches'}</div></div>
                <span class="faint" style="display:flex"><${Icon} name="chevronRight" size="sm" /></span>
              </button>`}
            </div>
          </${Section}>
        </div>
        <div style="--o:7">
          <${Section} title="Thesis" action=${html`<button class="link-btn" onClick=${() => go('phd')}>Chapters</button>`}>
            <div class="group">
              ${chapters.length ? html`<button class="thesis-head row--button" style="width:100%" onClick=${() => go('phd')}>
                <div class="thesis-head__pct">${pct}<span class="countdown__unit">%</span></div>
                <div class="thesis-head__main">
                  <div class="row__title">${settings.thesis.title || 'PhD thesis'}</div>
                  <div class="row__sub">${target ? `Submission ${relDays(target, today).text}, ${fmtShort(target)}` : 'No submission date yet'}</div>
                  <div class="bar" style="margin-top:10px"><div class="bar__fill" style=${`width:${pct}%`}></div></div>
                </div>
              </button>` : html`<${Empty}>Add your chapters in PhD to track progress here.</${Empty}>`}
            </div>
          </${Section}>
        </div>
      </div>
    </div>
    ${openTask && html`<${TaskSheet} task=${openTask} areas=${areas} onClose=${() => setOpenTask(null)} />`}
    ${paper && html`<${PaperSheet} key=${paper.id} paper=${paper} settings=${settings} onClose=${() => setOpenPaper(null)} />`}
  </div>`;
}
