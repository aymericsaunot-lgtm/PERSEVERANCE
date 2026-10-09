// Studio: today at a glance. A headline written from the data, then tasks, projects and money.
import { html, useState } from '../../../vendor/preact.js';
import { actions } from '../../store.js';
import { Icon, Section, Empty, toast } from '../../ui.js';
import { todayISO, daysBetween, isoOf, startOfWeek, fmtDate } from '../../lib/dates.js';
import { sportXP } from '../../lib/xp.js';
import { TaskRow, TaskSheet, QuickAddTask, todayTasks } from '../tasks.js';
import { HabitChips, HabitList, SportLog } from '../life.js';
import { inWords } from '../progress.js';
import { money, hoursOf, dueText, invoiceState, STATE_LABEL, byDue } from './common.js';
import { ProjectCard } from './projects.js';
import { ProjectSheet, InvoiceSheet } from './sheets.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function StudioToday({ state, p, go }) {
  const { tasks, projects, invoices, clients, habits, timelogs, settings } = state.data;
  const today = todayISO();
  const cur = settings.currency || 'EUR';
  const [openTask, setOpenTask] = useState(null);
  const [openProject, setOpenProject] = useState(null);
  const [openInvoice, setOpenInvoice] = useState(null);
  const byId = new Map(projects.map((x) => [x.id, x]));
  const list = todayTasks(tasks, today);
  const active = projects.filter((x) => x.stage !== 'done').sort(byDue);
  const next = active.find((x) => x.due);
  const sent = invoices.filter((i) => i.kind !== 'quote' && i.status === 'sent');
  const overdue = sent.filter((i) => invoiceState(i, today) === 'overdue');
  const owed = sent.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const weekStart = isoOf(startOfWeek());
  const weekMinutes = timelogs.filter((t) => t.date >= weekStart).reduce((a, t) => a + (Number(t.minutes) || 0), 0);
  const sport = (settings.sportTypes || ['Boxing'])[0];
  const now = new Date();

  const lead = active.length ? `${cap(inWords(active.length))} ${active.length === 1 ? 'project' : 'projects'} on the go` : 'A clear desk today';
  const logSport = () => {
    actions.add('sessions', { type: sport, minutes: 60, date: today, note: '', conditions: '' });
    toast(`${sport} logged`, { xp: sportXP(60) });
  };

  return html`<div>
    <header class="s-hero">
      <span class="s-label">${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <h1 class="s-hero__line">${lead}${next ? html`, <mark class="s-mark">${next.title}</mark> ${dueText(next.due, today).replace(/^Due /, 'due ').toLowerCase()}` : ''}.</h1>
      ${overdue.length > 0 && html`<p class="s-hero__sub">${cap(inWords(overdue.length))} ${overdue.length === 1 ? 'invoice is' : 'invoices are'} overdue: worth a polite reminder.</p>`}
    </header>

    <div class="tiles">
      <button class="tile sw-pink" onClick=${() => go('tasks')}><span class="tile__label">Today</span><span class="tile__big">${list.length}</span><span class="tile__sub">${list.length === 1 ? 'task' : 'tasks'} to do</span></button>
      <button class="tile sw-aqua" onClick=${() => go('projects')}><span class="tile__label">This week</span><span class="tile__big">${hoursOf(weekMinutes)}</span><span class="tile__sub">on projects</span></button>
      <button class=${'tile ' + (overdue.length ? 'sw-red' : 'sw-butter')} onClick=${() => go('money')}><span class="tile__label">Owed to you</span><span class="tile__big">${money(owed, cur)}</span><span class="tile__sub">${overdue.length ? `${overdue.length} overdue` : `${sent.length} ${sent.length === 1 ? 'invoice' : 'invoices'} out`}</span></button>
      <button class="tile sw-mint" onClick=${() => go('progress')}><span class="tile__label">Level ${p.level}</span><span class="tile__big">${p.todayXP}<small>/${p.goal}</small></span><span class="tile__sub">XP today</span></button>
    </div>

    <div class="bento">
      <div class="bento__col bento__col--main">
        <div style="--o:1">
          <${Section} title="To do today" action=${html`<button class="link-btn" onClick=${() => go('tasks')}>All tasks</button>`}>
            <div class="group">
              ${list.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${settings.taskAreas || []} project=${byId.get(t.projectId)} onOpen=${setOpenTask} />`)}
              <div style=${list.length ? 'border-top:1px solid var(--rule)' : ''}><${QuickAddTask} areas=${settings.taskAreas || []} defaultDue=${today} placeholder="Add a task for today" compact=${true} /></div>
            </div>
          </${Section}>
        </div>
        <div style="--o:2">
          <${Section} title="On the go" action=${html`<button class="link-btn" onClick=${() => go('projects')}>All projects</button>`}>
            ${active.length
              ? html`<div class="pgrid pgrid--two">${active.slice(0, 4).map((x) => html`<${ProjectCard} key=${x.id} project=${x} state=${state} onOpen=${setOpenProject} />`)}</div>`
              : html`<div class="group"><${Empty} title="Nothing on the go">Start a project from Projects.</${Empty}></div>`}
          </${Section}>
        </div>
      </div>
      <div class="bento__col">
        <div style="--o:3">
          <${Section} title="Money" action=${html`<button class="link-btn" onClick=${() => go('money')}>All</button>`}>
            <div class="group">
              ${sent.length ? sent.sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 4).map((i) => {
                const st = invoiceState(i, today);
                return html`<button key=${i.id} class="row row--button" onClick=${() => setOpenInvoice(i)}>
                  <div class="row__main">
                    <div class="row__title">${(clients.find((c) => c.id === i.clientId) || {}).name || i.number}</div>
                    <div class="row__sub">${st === 'overdue' ? `${daysBetween(i.due, today)} days overdue` : i.due ? `Due ${fmtDate(i.due)}` : i.number}</div>
                  </div>
                  <span class=${'state state--' + st}>${STATE_LABEL[st]}</span>
                  <span class="row__side row__side--strong">${money(i.amount, cur)}</span>
                </button>`;
              }) : html`<${Empty}>Nothing waiting to be paid.</${Empty}>`}
            </div>
          </${Section}>
        </div>
        <div style="--o:4">
          <${Section} title="Habits" action=${html`<button class="link-btn" onClick=${() => go('life')}>Life</button>`}>
            <div class="group">
              <${HabitChips} habits=${habits} />
              <div class="quick-sport"><button class="chip" onClick=${logSport}><${Icon} name="glove" size="xs" />${sport}, 60 min</button><span class="faint">one tap to log it</span></div>
            </div>
          </${Section}>
        </div>
      </div>
    </div>
    ${openTask && html`<${TaskSheet} task=${openTask} areas=${settings.taskAreas || []} onClose=${() => setOpenTask(null)} />`}
    ${openProject && html`<${ProjectSheet} key=${openProject.id} project=${openProject} state=${state} onClose=${() => setOpenProject(null)} />`}
    ${openInvoice && html`<${InvoiceSheet} key=${openInvoice.id} invoice=${openInvoice} state=${state} onClose=${() => setOpenInvoice(null)} />`}
  </div>`;
}

export function StudioLife({ state }) {
  return html`<div>
    <header class="s-head">
      <span class="s-label">Habits and training</span>
      <div class="s-head__row"><h1 class="s-title">Life</h1></div>
    </header>
    <div class="grid-2">
      <${HabitList} habits=${state.data.habits} />
      <${SportLog} sessions=${state.data.sessions} settings=${state.data.settings} surfNow=${null} />
    </div>
  </div>`;
}
