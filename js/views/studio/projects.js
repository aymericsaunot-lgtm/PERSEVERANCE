// Studio: projects as colour blocks, filtered by stage.
import { html, useState } from '../../../vendor/preact.js';
import { Icon, Segmented, Empty } from '../../ui.js';
import { todayISO, daysBetween } from '../../lib/dates.js';
import { STAGES, stageLabel, StageBar, TypeTags, Arrow, money, hoursOf, projectStats, byDue } from './common.js';
import { ProjectSheet } from './sheets.js';

export function ProjectCard({ project, state, onOpen }) {
  const client = state.data.clients.find((c) => c.id === project.clientId);
  const s = projectStats(project, state.data);
  const cur = state.data.settings.currency || 'EUR';
  const n = project.due ? daysBetween(todayISO(), project.due) : null;
  const done = project.stage === 'done';
  return html`<button class=${'pcard sw-' + (project.color || 'pink')} onClick=${() => onOpen(project)}>
    <div class="pcard__meta"><span>${client ? client.name : 'No client'}</span><span>${stageLabel(project.stage)}</span></div>
    <div class="pcard__head"><span class="pcard__title">${project.title}</span><${Arrow} /></div>
    <div class="pcard__body">
      <div class="pcard__big">
        ${done ? html`<span>Delivered</span>` : n == null ? html`<span>No date</span>` : n < 0 ? html`${-n}<small>${n === -1 ? 'day' : 'days'} late</small>` : n === 0 ? html`<span>Today</span>` : html`${n}<small>${n === 1 ? 'day' : 'days'} left</small>`}
      </div>
      <${TypeTags} types=${project.types} />
      <div class="pcard__stats">
        <span>${s.open} ${s.open === 1 ? 'task' : 'tasks'} open</span>
        <span>${hoursOf(s.minutes)}</span>
        ${project.budget ? html`<span>${money(project.budget, cur)}</span>` : null}
      </div>
      <${StageBar} stage=${project.stage} />
    </div>
  </button>`;
}

export function ProjectsView({ state }) {
  const { projects } = state.data;
  const [tab, setTab] = useState('active');
  const [open, setOpen] = useState(null);
  const count = (id) => projects.filter((p) => p.stage === id).length;
  const shown = projects
    .filter((p) => (tab === 'active' ? p.stage !== 'done' : tab === 'all' ? true : p.stage === tab))
    .sort((a, b) => (a.stage === 'done') - (b.stage === 'done') || byDue(a, b));
  const items = [
    { id: 'active', label: 'Active', count: projects.filter((p) => p.stage !== 'done').length },
    ...STAGES.map((s) => ({ id: s.id, label: s.label, count: count(s.id) || null })),
    { id: 'all', label: 'All' },
  ];
  return html`<div>
    <header class="s-head">
      <span class="s-label">${projects.filter((p) => p.stage !== 'done').length} active, ${count('done')} delivered</span>
      <div class="s-head__row">
        <h1 class="s-title">Projects</h1>
        <button class="s-circle" onClick=${() => setOpen({ stage: 'brief' })}><${Icon} name="plus" /><span>New project</span></button>
      </div>
    </header>
    <div class="toolbar"><${Segmented} label="Stage" value=${tab} onChange=${setTab} items=${items} /></div>
    ${shown.length
      ? html`<div class="pgrid">${shown.map((p) => html`<${ProjectCard} key=${p.id} project=${p} state=${state} onOpen=${setOpen} />`)}</div>`
      : html`<div class="group"><${Empty} title=${projects.length ? 'Nothing at this stage' : 'No projects yet'}>${projects.length ? 'Pick another stage above.' : 'Start with the one on your desk: name, client, budget, due date.'}</${Empty}></div>`}
    ${open && html`<${ProjectSheet} key=${open.id || 'new'} project=${open} state=${state} onClose=${() => setOpen(null)} />`}
  </div>`;
}
