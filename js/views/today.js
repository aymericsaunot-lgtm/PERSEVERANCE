import { html, useState } from '../../vendor/preact.js';
import { Icon, Rich, Section, Empty } from '../ui.js';
import { todayISO, greeting, relDays, fmtShort } from '../lib/dates.js';
import { progressOf } from '../lib/xp.js';
import { TaskRow, TaskSheet, QuickAddTask, todayTasks } from './tasks.js';
import { ReadingStats, PaperSheet } from './papers.js';
import { authorShort } from '../lib/papers.js';
import { Horizon, NextUp, thesisProgress, upcoming } from './phd.js';
import { HabitChips, SurfHero } from './life.js';
import { BriefingCard } from './jarvis.js';
import { TodayRing, LevelCard, LevelChip } from './progress.js';

// One column on phones, in the order given by --o; two columns on wide screens.
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
  const p = progressOf(state.data);
  const name = ((settings.profile && settings.profile.name) || '').trim();
  const next = upcoming(state.data, today).find((i) => i.kind !== 'thesis');
  const now = new Date();
  const summary = [
    list.length ? `${list.length} ${list.length === 1 ? 'task' : 'tasks'} today${late ? `, ${late} overdue` : ''}` : 'Nothing due today',
    next && `${next.title} ${next.side}`,
  ].filter(Boolean).join(' · ');

  return html`<div>
    <header class="hero">
      <div class="hero__top">
        <span class="overline">${now.toLocaleDateString('en-GB', { weekday: 'long' })} · ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span>
        <${LevelChip} p=${p} go=${go} />
      </div>
      <h1 class="hero__title">${greeting()}${name ? ',' : '.'}${name && html`<strong>${name}.</strong>`}</h1>
      <p class="hero__sub">${summary}.</p>
    </header>

    <div class="bento">
      <div class="bento__col bento__col--main">
        <div style="--o:1"><${BriefingCard} state=${state} go=${go} /></div>
        <div style="--o:3">
          <${Section} title="Today" action=${html`<button class="link-btn" onClick=${() => go('tasks')}>All tasks</button>`}>
            <div class="group">
              ${list.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${areas} onOpen=${setOpenTask} />`)}
              <div style=${list.length ? 'border-top:1px solid var(--line)' : ''}>
                <${QuickAddTask} areas=${areas} defaultDue=${today} placeholder="Add a task for today" compact=${true} />
              </div>
            </div>
          </${Section}>
        </div>
        <div style="--o:4">
          <${Section} title="Habits" action=${html`<button class="link-btn" onClick=${() => go('life')}>History</button>`}>
            <div class="group"><${HabitChips} habits=${habits} /></div>
          </${Section}>
        </div>
        <div style="--o:6">
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
          <${TodayRing} p=${p} go=${go} />
          <${LevelCard} p=${p} go=${go} />
        </div>
        <div style="--o:5"><${SurfHero} settings=${settings} link=${true} /></div>
        <div style="--o:7">
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
        <div style="--o:8">
          <${Section} title="Thesis" action=${html`<button class="link-btn" onClick=${() => go('phd')}>Chapters</button>`}>
            <div class="group">
              ${chapters.length ? html`<button class="thesis-head row--button" style="width:100%" onClick=${() => go('phd')}>
                <div class="thesis-head__pct num">${pct}<span class="countdown__unit" style="font-size:14px">%</span></div>
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
