import { html, useState, useMemo, useEffect } from '../../vendor/preact.js';
import { actions } from '../store.js';
import { Icon, Check, Section, Segmented, Sheet, Field, Empty, DatePick, DangerButton, toast } from '../ui.js';
import { todayISO, addDays, relDays, fmtDate, daysBetween } from '../lib/dates.js';

const AREA_HUES = ['#0F7F78', '#5865D6', '#D9480F', '#8B5CF6', '#5C8A12', '#0369A1', '#BE185D', '#B45309'];
export function areaColor(area, areas) {
  const i = Math.max(0, (areas || []).indexOf(area));
  return AREA_HUES[i % AREA_HUES.length];
}

export function dueInfo(due, today = todayISO()) {
  if (!due) return null;
  const n = daysBetween(today, due);
  if (n < 0) return { text: n === -1 ? '1 day late' : `${-n} days late`, cls: 'due due--late' };
  if (n === 0) return { text: 'Today', cls: 'due due--soon' };
  if (n === 1) return { text: 'Tomorrow', cls: 'due' };
  if (n < 7) return { text: fmtDate(due).split(' ')[0], cls: 'due' };
  return { text: fmtDate(due), cls: 'due' };
}

export function completeTask(task) {
  const done = !task.done;
  actions.update('tasks', task.id, { done, doneAt: done ? Date.now() : null });
  if (done) {
    toast('Task done', { action: 'Undo', onAction: () => actions.update('tasks', task.id, { done: false, doneAt: null }) });
  }
}

export function TaskRow({ task, areas, onOpen, showArea = true }) {
  const due = !task.done && dueInfo(task.due);
  return html`<div class=${'row row--indent row--button' + (task.done ? ' row--done' : '')} role="button" tabindex="0"
      onClick=${() => onOpen(task)} onKeyDown=${(e) => e.key === 'Enter' && onOpen(task)}>
    <${Check} checked=${!!task.done} label=${task.done ? 'Mark as not done' : 'Mark as done'} onChange=${() => completeTask(task)} />
    <div class="row__main">
      <div class="row__title">${task.title}</div>
      ${(showArea && task.area) || task.notes ? html`<div class="row__sub" style="display:flex;align-items:center;gap:6px">
        ${showArea && task.area && html`<span class="dot" style=${`background:${areaColor(task.area, areas)}`}></span><span>${task.area}</span>`}
        ${task.notes && html`<${Icon} name="edit" size="xs" />`}
      </div>` : null}
    </div>
    ${task.starred && !task.done && html`<span class="faint" aria-label="Starred" style="color:var(--warn);display:flex"><${Icon} name="star" size="xs" cls="filled" /></span>`}
    ${due && html`<span class=${due.cls}>${due.text}</span>`}
  </div>`;
}

function parseQuick(text, areas) {
  let title = text.trim();
  let area = null;
  let starred = false;
  title = title.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (m, sp, tag) => {
    const hit = areas.find((a) => a.toLowerCase().replace(/\s+/g, '') === tag.toLowerCase());
    if (hit) { area = hit; return sp; }
    return m;
  });
  if (/\s!$|^!|\s\*$/.test(title)) { starred = true; title = title.replace(/\s*[!*]$/, '').replace(/^!\s*/, ''); }
  return { title: title.replace(/\s+/g, ' ').trim(), area, starred };
}

export function QuickAddTask({ areas, defaultDue = '', placeholder = 'Add a task', compact = false }) {
  const [text, setText] = useState('');
  const [area, setArea] = useState(areas[0] || '');
  const [due, setDue] = useState(defaultDue);
  const [starred, setStarred] = useState(false);
  const [focused, setFocused] = useState(false);
  const today = todayISO();
  useEffect(() => setDue(defaultDue), [defaultDue]);
  const submit = (e) => {
    e.preventDefault();
    const q = parseQuick(text, areas);
    if (!q.title) return;
    actions.add('tasks', { title: q.title, area: q.area || area, due, starred: starred || q.starred, done: false, doneAt: null, notes: '' });
    setText('');
    setStarred(false);
  };
  const dueOpts = [['', 'No date'], [today, 'Today'], [addDays(today, 1), 'Tomorrow']];
  const showOpts = !compact || focused || text;
  return html`<form onSubmit=${submit}>
    <div class="quickadd">
      <${Icon} name="plus" size="sm" cls="faint" />
      <input class="quickadd__input" value=${text} placeholder=${placeholder} aria-label="New task"
        onInput=${(e) => setText(e.currentTarget.value)} onFocus=${() => setFocused(true)} />
      ${text && html`<button class="btn btn--primary btn--sm" type="submit">Add</button>`}
    </div>
    ${showOpts && html`<div class="quickadd__opts">
      ${areas.map((a) => html`<button type="button" key=${a} class="chip" aria-pressed=${area === a ? 'true' : 'false'} onClick=${() => setArea(a)}>
        <span class="dot" style=${`background:${areaColor(a, areas)}`}></span>${a}</button>`)}
      <span style="width:6px"></span>
      ${dueOpts.map(([v, label]) => html`<button type="button" key=${label} class="chip" aria-pressed=${due === v ? 'true' : 'false'} onClick=${() => setDue(v)}>${label}</button>`)}
      <${DatePick} value=${due} onChange=${setDue} pressed=${!!due && !dueOpts.some(([v]) => v === due)}>
        <${Icon} name="calendar" size="xs" />${due && !dueOpts.some(([v]) => v === due) ? fmtDate(due) : 'Pick a date'}
      </${DatePick}>
      <button type="button" class="chip" aria-pressed=${starred ? 'true' : 'false'} onClick=${() => setStarred(!starred)}><${Icon} name="star" size="xs" />Star</button>
    </div>`}
  </form>`;
}

export function TaskSheet({ task, areas, onClose }) {
  const [form, setForm] = useState({ title: task.title || '', notes: task.notes || '', area: task.area || '', due: task.due || '', starred: !!task.starred });
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget ? e.currentTarget.value : e });
  const today = todayISO();
  const save = () => {
    if (!form.title.trim()) return;
    actions.update('tasks', task.id, { ...form, title: form.title.trim() });
    onClose();
  };
  const del = () => {
    actions.remove('tasks', task.id);
    toast('Task deleted');
    onClose();
  };
  return html`<${Sheet} title="Task" onClose=${onClose} actions=${html`
      <${DangerButton} onConfirm=${del} />
      <button class="btn btn--primary" onClick=${save}>Save</button>`}>
    <${Field} label="Title"><input class="input" data-autofocus value=${form.title} onInput=${set('title')} onKeyDown=${(e) => e.key === 'Enter' && save()} /></${Field}>
    <div class="field" style="margin-top:14px">
      <span class="field__label">Area</span>
      <div class="chips">
        ${areas.map((a) => html`<button key=${a} class="chip" aria-pressed=${form.area === a ? 'true' : 'false'} onClick=${() => setForm({ ...form, area: a })}>
          <span class="dot" style=${`background:${areaColor(a, areas)}`}></span>${a}</button>`)}
      </div>
    </div>
    <div class="field" style="margin-top:14px">
      <span class="field__label">Due</span>
      <div class="chips" style="margin-bottom:8px">
        ${[[today, 'Today'], [addDays(today, 1), 'Tomorrow'], [addDays(today, 7), 'Next week'], ['', 'No date']].map(([v, l]) => html`
          <button key=${l} class="chip" aria-pressed=${form.due === v ? 'true' : 'false'} onClick=${() => setForm({ ...form, due: v })}>${l}</button>`)}
      </div>
      <input class="input" type="date" value=${form.due} onInput=${set('due')} aria-label="Due date" />
    </div>
    <div class="field" style="margin-top:14px">
      <span class="field__label">Notes</span>
      <textarea class="textarea" value=${form.notes} onInput=${set('notes')} placeholder="Details, links, next step"></textarea>
    </div>
    <div style="margin-top:14px">
      <button class="chip" aria-pressed=${form.starred ? 'true' : 'false'} onClick=${() => setForm({ ...form, starred: !form.starred })}><${Icon} name="star" size="xs" />Starred tasks show on Today</button>
    </div>
  </${Sheet}>`;
}

function groupByDate(tasks, today) {
  const groups = new Map();
  for (const t of tasks) {
    let key;
    if (!t.due) key = 'No date';
    else {
      const n = daysBetween(today, t.due);
      key = n < 0 ? 'Overdue' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? 'This week' : n < 31 ? 'This month' : 'Later';
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const order = ['Overdue', 'Today', 'Tomorrow', 'This week', 'This month', 'Later', 'No date'];
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)]);
}

const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0);

export function todayTasks(tasks, today = todayISO()) {
  return tasks.filter((t) => !t.done && ((t.due && t.due <= today) || t.starred)).sort(byDue);
}

export function TasksView({ state }) {
  const { tasks, settings } = state.data;
  const areas = settings.taskAreas || [];
  const [tab, setTab] = useState('today');
  const [areaFilter, setAreaFilter] = useState('');
  const [open, setOpen] = useState(null);
  const today = todayISO();

  const filtered = useMemo(() => tasks.filter((t) => !areaFilter || t.area === areaFilter), [tasks, areaFilter]);
  const openTasks = filtered.filter((t) => !t.done);
  const lists = {
    today: todayTasks(filtered, today),
    upcoming: openTasks.filter((t) => t.due && t.due > today).sort(byDue),
    all: openTasks.slice().sort(byDue),
    done: filtered.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)),
  };
  const items = lists[tab];

  let body;
  if (!items.length) {
    const msg = {
      today: ['Nothing due today', 'Starred tasks and anything due today or overdue shows up here.'],
      upcoming: ['No upcoming tasks', 'Give a task a date and it lands here.'],
      all: ['No open tasks', 'Add one above. Type #PhD in the title to set the area.'],
      done: ['Nothing finished yet', 'Completed tasks from the last 30 days stay here.'],
    }[tab];
    body = html`<div class="group"><${Empty} title=${msg[0]}>${msg[1]}</${Empty}></div>`;
  } else if (tab === 'all') {
    const byArea = new Map();
    for (const t of items) {
      const k = t.area || 'No area';
      if (!byArea.has(k)) byArea.set(k, []);
      byArea.get(k).push(t);
    }
    body = [...byArea].map(([area, list]) => html`<${Section} key=${area} title=${area} meta=${String(list.length)}>
      <div class="group">${list.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${areas} showArea=${false} onOpen=${setOpen} />`)}</div>
    </${Section}>`);
  } else if (tab === 'upcoming') {
    body = groupByDate(items, today).map(([k, list]) => html`<${Section} key=${k} title=${k} meta=${String(list.length)}>
      <div class="group">${list.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${areas} onOpen=${setOpen} />`)}</div>
    </${Section}>`);
  } else {
    body = html`<div class="group">${items.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${areas} onOpen=${setOpen} />`)}</div>`;
  }

  return html`<div>
    <h1 class="page-title">Tasks</h1>
    <div class="group" style="margin-bottom:18px">
      <${QuickAddTask} areas=${areas} defaultDue=${tab === 'today' ? today : ''} placeholder=${tab === 'today' ? 'Add a task for today' : 'Add a task'} compact=${true} />
    </div>
    <div class="toolbar">
      <${Segmented} label="Task lists" value=${tab} onChange=${setTab} items=${[
        { id: 'today', label: 'Today', count: lists.today.length },
        { id: 'upcoming', label: 'Upcoming', count: lists.upcoming.length },
        { id: 'all', label: 'All', count: lists.all.length },
        { id: 'done', label: 'Done' },
      ]} />
    </div>
    <div class="chips chips--scroll" style="margin-bottom:16px">
      <button class="chip" aria-pressed=${!areaFilter ? 'true' : 'false'} onClick=${() => setAreaFilter('')}>All areas</button>
      ${areas.map((a) => html`<button key=${a} class="chip" aria-pressed=${areaFilter === a ? 'true' : 'false'} onClick=${() => setAreaFilter(areaFilter === a ? '' : a)}>
        <span class="dot" style=${`background:${areaColor(a, areas)}`}></span>${a}</button>`)}
    </div>
    ${body}
    ${open && html`<${TaskSheet} task=${open} areas=${areas} onClose=${() => setOpen(null)} />`}
  </div>`;
}

export { relDays };
