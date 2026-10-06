import { html, useState } from '../../vendor/preact.js';
import { Icon, Rich, Section, Empty } from '../ui.js';
import { todayISO, fmtLong, greeting, relDays, fmtShort } from '../lib/dates.js';
import { TaskRow, TaskSheet, QuickAddTask, todayTasks } from './tasks.js';
import { ReadingStats, PaperSheet } from './papers.js';
import { authorShort } from '../lib/papers.js';
import { Horizon, NextUp, thesisProgress } from './phd.js';
import { HabitChips, SurfMini } from './life.js';

export function TodayView({ state, go }) {
  const { tasks, papers, arxiv, chapters, habits, settings } = state.data;
  const areas = settings.taskAreas || [];
  const today = todayISO();
  const [openTask, setOpenTask] = useState(null);
  const [openPaper, setOpenPaper] = useState(null);
  const list = todayTasks(tasks, today);
  const late = list.filter((t) => t.due && t.due < today).length;
  const reading = papers.filter((p) => p.status === 'reading').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 3);
  const newMatches = arxiv.filter((x) => x.status === 'new').length;
  const pct = thesisProgress(chapters);
  const target = settings.thesis.target;
  const paper = openPaper && papers.find((p) => p.id === openPaper.id);

  return html`<div>
    <h1 class="page-title">${fmtLong(today)}</h1>
    <p class="page-sub">${greeting()}. ${list.length ? `${list.length} ${list.length === 1 ? 'task' : 'tasks'} for today${late ? `, ${late} overdue` : ''}.` : 'Nothing due today.'}</p>
    <div class="grid-2">
      <div class="stack">
        <${Section} title="Coming up">
          <div class="group">
            <${Horizon} data=${state.data} />
            <${NextUp} data=${state.data} go=${go} limit=${3} />
          </div>
        </${Section}>
        <${Section} title="Today" action=${html`<button class="link-btn" onClick=${() => go('tasks')}>All tasks</button>`}>
          <div class="group">
            ${list.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${areas} onOpen=${setOpenTask} />`)}
            <div style=${list.length ? 'border-top:1px solid var(--line)' : ''}>
              <${QuickAddTask} areas=${areas} defaultDue=${today} placeholder="Add a task for today" compact=${true} />
            </div>
          </div>
        </${Section}>
        <${Section} title="Habits" action=${html`<button class="link-btn" onClick=${() => go('life')}>History</button>`}>
          <div class="group"><${HabitChips} habits=${habits} /></div>
        </${Section}>
      </div>
      <div class="stack">
        <${Section} title="Reading" action=${html`<button class="link-btn" onClick=${() => go('papers')}>Library</button>`}>
          <div class="group">
            <${ReadingStats} papers=${papers} compact=${true} />
            ${reading.map((p) => html`<button key=${p.id} class="row row--button" onClick=${() => setOpenPaper(p)}>
              <span class="faint" style="display:flex"><${Icon} name="book" size="sm" /></span>
              <div class="row__main">
                <div class="paper__title" style="font-size:16px"><${Rich} text=${p.title} /></div>
                <div class="row__sub">${authorShort(p)}${p.year ? `, ${p.year}` : ''}</div>
              </div>
            </button>`)}
            ${newMatches > 0 && html`<button class="row row--button" onClick=${() => go('papers/watch')}>
              <span style="color:var(--accent);display:flex"><${Icon} name="bell" size="sm" /></span>
              <div class="row__main"><div class="row__title">${newMatches} new arXiv ${newMatches === 1 ? 'match' : 'matches'}</div></div>
              <span class="faint" style="display:flex"><${Icon} name="chevronRight" size="sm" /></span>
            </button>`}
          </div>
        </${Section}>
        <${Section} title="Surf" action=${html`<button class="link-btn" onClick=${() => go('life')}>Forecast</button>`}>
          <${SurfMini} settings=${settings} go=${go} />
        </${Section}>
        <${Section} title="Thesis" action=${html`<button class="link-btn" onClick=${() => go('phd')}>Chapters</button>`}>
          <div class="group">
            ${chapters.length ? html`<button class="row row--button" onClick=${() => go('phd')}>
              <div class="row__main">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
                  <span class="row__title">${settings.thesis.title || 'PhD thesis'}</span>
                  <span class="num muted">${pct}%</span>
                </div>
                <div class="bar" style="margin-top:8px"><div class="bar__fill" style=${`width:${pct}%`}></div></div>
                ${target && html`<div class="row__sub" style="margin-top:8px">Submission ${relDays(target, today).text}, ${fmtShort(target)}</div>`}
              </div>
            </button>` : html`<${Empty}>Add your chapters in PhD to track progress here.</${Empty}>`}
          </div>
        </${Section}>
      </div>
    </div>
    ${openTask && html`<${TaskSheet} task=${openTask} areas=${areas} onClose=${() => setOpenTask(null)} />`}
    ${paper && html`<${PaperSheet} key=${paper.id} paper=${paper} settings=${settings} onClose=${() => setOpenPaper(null)} />`}
  </div>`;
}
