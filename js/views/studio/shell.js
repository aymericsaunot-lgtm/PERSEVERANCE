// Studio: the frame around the screens (top bar on wide screens, tab bar on phones), and the
// one-time choice of space for a new account.
import { html, useState } from '../../../vendor/preact.js';
import { Icon, Mark } from '../../ui.js';
import { TasksView, todayTasks } from '../tasks.js';
import { ProgressView } from '../progress.js';
import { SettingsView } from '../settings.js';
import { StudioToday, StudioLife } from './today.js';
import { ProjectsView } from './projects.js';
import { ClientsView } from './clients.js';
import { MoneyView } from './money.js';
import { ProjectSheet } from './sheets.js';
import { invoiceState, Arrow } from './common.js';
import { todayISO } from '../../lib/dates.js';

const NAV = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'projects', label: 'Projects', icon: 'projects' },
  { id: 'clients', label: 'Clients', icon: 'clients' },
  { id: 'money', label: 'Money', icon: 'money' },
  { id: 'life', label: 'Life', icon: 'glove' },
];

export function StudioShell({ state, p, route, go, install, onSignOut }) {
  const [main, sub] = route.split('/');
  const [newProject, setNewProject] = useState(false);
  const today = todayISO();
  const badges = {
    today: todayTasks(state.data.tasks).length,
    money: state.data.invoices.filter((i) => i.kind !== 'quote' && invoiceState(i) === 'overdue').length,
  };
  let view;
  if (main === 'projects') view = html`<${ProjectsView} state=${state} go=${go} />`;
  else if (main === 'clients') view = html`<${ClientsView} state=${state} go=${go} />`;
  else if (main === 'money') view = html`<${MoneyView} state=${state} go=${go} />`;
  else if (main === 'life') view = html`<${StudioLife} state=${state} />`;
  else if (main === 'tasks') view = html`<${TasksView} state=${state} go=${go} />`;
  else if (main === 'progress') view = html`<${ProgressView} state=${state} p=${p} go=${go} />`;
  else if (main === 'settings') view = html`<${SettingsView} state=${state} sub=${sub} go=${go} install=${install} onSignOut=${onSignOut} />`;
  else view = html`<${StudioToday} state=${state} p=${p} go=${go} />`;
  const active = main || 'today';

  return html`<div class="s-shell">
    <header class="s-bar">
      <button class="s-brand" onClick=${() => go('today')}><${Mark} size=${26} /><span>Studio</span></button>
      <nav class="s-links" aria-label="Sections">
        ${NAV.map((n) => html`<button key=${n.id} class="s-link" aria-current=${active === n.id ? 'page' : undefined} onClick=${() => go(n.id)}>${n.label}${badges[n.id] > 0 && html`<span class="s-badge">${badges[n.id]}</span>`}</button>`)}
      </nav>
      <div class="s-bar__tools">
        <button class="s-level" onClick=${() => go('progress')} aria-label=${`Level ${p.level}. Open progress`}><span>Lv ${p.level}</span><i style=${`width:${Math.round(p.pct * 100)}%`}></i></button>
        <button class="icon-btn" aria-label="Settings" onClick=${() => go('settings')}><${Icon} name="settings" /></button>
        <button class="s-pill" onClick=${() => setNewProject(true)}><${Icon} name="plus" size="xs" />New project</button>
      </div>
    </header>
    <main class="main s-main" id="main">${view}</main>
    <nav class="tabbar s-tabbar" aria-label="Sections">
      ${NAV.map((n) => html`<button key=${n.id} class="tabbar__item" aria-current=${active === n.id ? 'page' : undefined} onClick=${() => go(n.id)}>
        <span class="tabbar__icon"><${Icon} name=${n.icon} />${badges[n.id] > 0 && n.id === 'money' && html`<span class="tabbar__badge">${badges[n.id]}</span>`}</span>
        ${n.label}
      </button>`)}
    </nav>
    ${newProject && html`<${ProjectSheet} project=${{ stage: 'brief', start: today }} state=${state} onClose=${() => setNewProject(false)} />`}
  </div>`;
}

export function EditionChooser({ onPick }) {
  return html`<div class="chooser">
    <div class="chooser__inner">
      <${Mark} size=${48} />
      <h1 class="chooser__title">Which space is yours?</h1>
      <p class="chooser__sub">Each account keeps its own data. You can switch later in Settings.</p>
      <div class="chooser__cards">
        <button class="chooser__card sw-pink" onClick=${() => onPick('studio')}>
          <span class="chooser__kicker">For designers</span>
          <span class="chooser__name">Studio</span>
          <span class="chooser__text">Projects and clients, quotes and invoices, hours, habits and boxing.</span>
          <${Arrow} />
        </button>
        <button class="chooser__card chooser__card--paper" onClick=${() => onPick('research')}>
          <span class="chooser__kicker">For research</span>
          <span class="chooser__name">Research</span>
          <span class="chooser__text">PhD planning, papers and the arXiv watch, beamtimes, surf and habits.</span>
          <${Arrow} />
        </button>
      </div>
    </div>
  </div>`;
}
