// Studio: the project, client and invoice sheets.
import { html, useState } from '../../../vendor/preact.js';
import { actions } from '../../store.js';
import { Icon, Sheet, Field, Segmented, DangerButton, toast } from '../../ui.js';
import { todayISO, addDays, fmtDate } from '../../lib/dates.js';
import { XP, timeXP } from '../../lib/xp.js';
import { TaskRow, TaskSheet, QuickAddTask } from '../tasks.js';
import {
  STAGES, SwatchPicker, StageTrack, money, hoursOf, dueText, invoiceState, STATE_LABEL, nextNumber,
  projectStats, clientStats, swatchFor, byDue, Avatar,
} from './common.js';

const num = (v) => Math.max(0, Number(String(v).replace(',', '.')) || 0);

function ClientSelect({ clients, value, onChange, newName, onNewName }) {
  return html`<div>
    <select class="select" value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
      <option value="">No client</option>
      ${clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => html`<option key=${c.id} value=${c.id}>${c.name}${c.company ? `, ${c.company}` : ''}</option>`)}
      <option value="__new">New client…</option>
    </select>
    ${value === '__new' && html`<input class="input" style="margin-top:8px" placeholder="Client name" value=${newName} onInput=${(e) => onNewName(e.currentTarget.value)} />`}
  </div>`;
}

function resolveClient(id, newName) {
  if (id !== '__new') return id;
  const name = newName.trim();
  if (!name) return '';
  return actions.add('clients', { name, company: '', email: '', phone: '', website: '', notes: '', color: swatchFor(name), createdAt: Date.now() });
}

export function ProjectSheet({ project, state, onClose }) {
  const { clients, settings } = state.data;
  const isNew = !project.id;
  const live = isNew ? project : state.data.projects.find((p) => p.id === project.id) || project;
  const [f, setF] = useState({
    title: live.title || '', clientId: live.clientId || '', types: live.types || [], budget: live.budget || '',
    start: live.start || (isNew ? todayISO() : ''), due: live.due || '', color: live.color || 'pink', link: live.link || '', notes: live.notes || '',
  });
  const [newClient, setNewClient] = useState('');
  const [minutes, setMinutes] = useState('');
  const [openTask, setOpenTask] = useState(null);
  const [openInvoice, setOpenInvoice] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const cur = settings.currency || 'EUR';

  const save = () => {
    if (!f.title.trim()) { toast('Give the project a name'); return; }
    const data = { ...f, title: f.title.trim(), clientId: resolveClient(f.clientId, newClient), budget: num(f.budget), link: f.link.trim(), notes: f.notes.trim() };
    if (isNew) actions.add('projects', { ...data, stage: live.stage || 'brief', revisions: 0, doneAt: null });
    else actions.update('projects', live.id, data);
    onClose();
  };
  const setStage = (stage) => {
    if (stage === live.stage) return;
    actions.update('projects', live.id, { stage, doneAt: stage === 'done' ? live.doneAt || Date.now() : null });
    if (stage === 'done') toast('Project delivered', { xp: XP.project });
  };
  const logTime = (m) => {
    const mins = Math.round(m);
    if (!mins) return;
    actions.add('timelogs', { projectId: live.id, date: todayISO(), minutes: mins, note: '' });
    toast(`${hoursOf(mins)} on ${live.title}`, { xp: timeXP(mins) });
    setMinutes('');
  };
  const toggleType = (t) => setF({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] });

  const s = isNew ? null : projectStats(live, state.data);
  const tasks = isNew ? [] : state.data.tasks.filter((t) => t.projectId === live.id).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || byDue(a, b));
  const logs = isNew ? [] : state.data.timelogs.filter((t) => t.projectId === live.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const bills = isNew ? [] : state.data.invoices.filter((i) => i.projectId === live.id).sort((a, b) => (b.issued || '').localeCompare(a.issued || ''));

  const details = html`
    <${Field} label="Project"><input class="input" data-autofocus value=${f.title} placeholder="Brand identity for…" onInput=${set('title')} /></${Field}>
    <${Field} label="Client"><${ClientSelect} clients=${clients} value=${f.clientId} onChange=${(v) => setF({ ...f, clientId: v })} newName=${newClient} onNewName=${setNewClient} /></${Field}>
    <div class="field" style="margin-top:15px">
      <span class="field__label">Type</span>
      <div class="chips">${(settings.projectTypes || []).map((t) => html`<button key=${t} type="button" class="chip" aria-pressed=${f.types.includes(t) ? 'true' : 'false'} onClick=${() => toggleType(t)}>${t}</button>`)}</div>
    </div>
    <div class="fields-2" style="margin-top:15px">
      <${Field} label=${`Budget (${cur})`}><input class="input" inputmode="decimal" value=${f.budget} onInput=${set('budget')} placeholder="0" /></${Field}>
      <${Field} label="Due"><input class="input" type="date" value=${f.due} onInput=${set('due')} /></${Field}>
    </div>
    <div class="field" style="margin-top:15px"><span class="field__label">Colour</span><${SwatchPicker} value=${f.color} onChange=${(c) => setF({ ...f, color: c })} /></div>
    <${Field} label="Link" hint="Figma, Drive, Dropbox: where the files live."><input class="input" type="url" value=${f.link} onInput=${set('link')} placeholder="https://" /></${Field}>
    <${Field} label="Notes"><textarea class="textarea" value=${f.notes} onInput=${set('notes')} placeholder="Brief, deliverables, feedback"></textarea></${Field}>`;

  return html`<${Sheet} title=${isNew ? 'New project' : live.title} onClose=${onClose} actions=${html`
      ${!isNew && html`<${DangerButton} onConfirm=${() => { actions.remove('projects', live.id); toast('Project deleted'); onClose(); }} />`}
      <button class="btn btn--primary" onClick=${save}>${isNew ? 'Create project' : 'Save'}</button>`}>
    ${isNew ? details : html`
      <${StageTrack} stage=${live.stage} onChange=${setStage} />
      <div class="facts">
        <span><b>${dueText(live.due)}</b>${live.due ? fmtDate(live.due) : ''}</span>
        <span><b>${hoursOf(s.minutes)}</b>logged</span>
        <span><b>${money(live.budget, cur)}</b>budget</span>
        ${s.rate && html`<span><b>${money(Math.round(s.rate), cur)}</b>per hour</span>`}
      </div>

      <h3 class="sheet-section">Tasks</h3>
      <div class="group">
        ${tasks.map((t) => html`<${TaskRow} key=${t.id} task=${t} areas=${[]} onOpen=${setOpenTask} showArea=${false} />`)}
        <div style=${tasks.length ? 'border-top:1px solid var(--rule)' : ''}><${QuickAddTask} areas=${[]} projectId=${live.id} placeholder="Add a task to this project" compact=${true} /></div>
      </div>

      <h3 class="sheet-section">Time</h3>
      <div class="chips" style="align-items:center">
        ${[30, 60, 120, 240].map((m) => html`<button key=${m} type="button" class="chip" onClick=${() => logTime(m)}>+ ${m < 60 ? `${m} min` : `${m / 60} h`}</button>`)}
        <input class="input" style="width:88px;min-height:32px;padding:4px 10px" inputmode="numeric" placeholder="min" aria-label="Minutes" value=${minutes} onInput=${(e) => setMinutes(e.currentTarget.value)} onKeyDown=${(e) => e.key === 'Enter' && logTime(num(minutes))} />
        ${minutes && html`<button type="button" class="btn btn--sm btn--primary" onClick=${() => logTime(num(minutes))}>Log</button>`}
      </div>
      ${logs.length > 0 && html`<div class="mini-list">${logs.slice(0, 4).map((t) => html`<div key=${t.id} class="mini-row">
        <span>${fmtDate(t.date)}</span><b>${hoursOf(t.minutes)}</b>
        <button class="icon-btn icon-btn--sm" aria-label="Delete this entry" onClick=${() => actions.remove('timelogs', t.id)}><${Icon} name="x" size="xs" /></button>
      </div>`)}</div>`}

      <h3 class="sheet-section">Revisions</h3>
      <div class="counter">
        <button type="button" class="icon-btn" aria-label="One revision fewer" onClick=${() => actions.update('projects', live.id, { revisions: Math.max(0, (live.revisions || 0) - 1) })}><${Icon} name="x" size="xs" /></button>
        <span class="counter__value">${live.revisions || 0}</span>
        <button type="button" class="btn btn--sm" onClick=${() => actions.update('projects', live.id, { revisions: (live.revisions || 0) + 1 })}><${Icon} name="plus" size="xs" />Round</button>
      </div>

      <h3 class="sheet-section">Money</h3>
      <div class="facts">
        <span><b>${money(s.invoiced, cur)}</b>invoiced</span>
        <span><b>${money(s.paid, cur)}</b>paid</span>
      </div>
      <div class="group">
        ${bills.map((i) => html`<button key=${i.id} class="row row--button" onClick=${() => setOpenInvoice(i)}>
          <div class="row__main"><div class="row__title">${i.number}</div><div class="row__sub">${i.kind === 'quote' ? 'Quote' : 'Invoice'}, ${fmtDate(i.issued)}</div></div>
          <span class=${'state state--' + invoiceState(i)}>${STATE_LABEL[invoiceState(i)]}</span>
          <span class="row__side row__side--strong">${money(i.amount, cur)}</span>
        </button>`)}
        <button class="row row--button" onClick=${() => setOpenInvoice({ kind: 'invoice', clientId: live.clientId, projectId: live.id, amount: Math.max(0, (Number(live.budget) || 0) - s.invoiced) })}>
          <span class="faint" style="display:flex"><${Icon} name="plus" size="sm" /></span><span class="muted">New invoice or quote</span>
        </button>
      </div>

      ${live.link && html`<p style="margin-top:16px"><a href=${live.link} target="_blank" rel="noopener" class="link-btn">Open the project files</a></p>`}
      <h3 class="sheet-section">Details</h3>
      ${details}`}
    ${openTask && html`<${TaskSheet} task=${openTask} areas=${settings.taskAreas || []} onClose=${() => setOpenTask(null)} />`}
    ${openInvoice && html`<${InvoiceSheet} invoice=${openInvoice} state=${state} onClose=${() => setOpenInvoice(null)} />`}
  </${Sheet}>`;
}

export function ClientSheet({ client, state, onClose }) {
  const isNew = !client.id;
  const live = isNew ? client : state.data.clients.find((c) => c.id === client.id) || client;
  const [f, setF] = useState({ name: live.name || '', company: live.company || '', email: live.email || '', phone: live.phone || '', website: live.website || '', notes: live.notes || '', color: live.color || swatchFor(live.name || String(Date.now())) });
  const [openProject, setOpenProject] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const cur = state.data.settings.currency || 'EUR';
  const save = () => {
    if (!f.name.trim()) { toast('Give the client a name'); return; }
    const data = { ...f, name: f.name.trim(), company: f.company.trim(), email: f.email.trim(), phone: f.phone.trim(), website: f.website.trim(), notes: f.notes.trim() };
    if (isNew) { actions.add('clients', { ...data, createdAt: Date.now() }); toast('Client added', { xp: XP.client }); }
    else actions.update('clients', live.id, data);
    onClose();
  };
  const s = isNew ? null : clientStats(live, state.data);
  return html`<${Sheet} title=${isNew ? 'New client' : live.name} onClose=${onClose} actions=${html`
      ${!isNew && html`<${DangerButton} onConfirm=${() => { actions.remove('clients', live.id); toast('Client deleted'); onClose(); }} />`}
      <button class="btn btn--primary" onClick=${save}>${isNew ? 'Add client' : 'Save'}</button>`}>
    ${!isNew && html`<div class="client-head">
      <${Avatar} client=${{ ...live, color: f.color }} size=${56} />
      <div class="facts" style="margin:0">
        <span><b>${s.active}</b>active</span>
        <span><b>${money(s.paid, cur)}</b>paid</span>
        <span><b>${money(s.unpaid, cur)}</b>unpaid</span>
      </div>
    </div>
    ${s.projects.length > 0 && html`<div class="group" style="margin-bottom:18px">${s.projects.map((p) => html`<button key=${p.id} class="row row--button" onClick=${() => setOpenProject(p)}>
      <span class=${'dot sw-dot sw-' + (p.color || 'pink')}></span>
      <div class="row__main"><div class="row__title">${p.title}</div><div class="row__sub">${STAGES.find((x) => x.id === p.stage)?.label || 'Brief'}${p.due ? `, ${dueText(p.due).toLowerCase()}` : ''}</div></div>
      <${Icon} name="chevronRight" size="sm" />
    </button>`)}</div>`}`}
    <${Field} label="Name"><input class="input" data-autofocus value=${f.name} onInput=${set('name')} placeholder="Who you work with" /></${Field}>
    <${Field} label="Company"><input class="input" value=${f.company} onInput=${set('company')} /></${Field}>
    <div class="fields-2" style="margin-top:15px">
      <${Field} label="Email"><input class="input" type="email" value=${f.email} onInput=${set('email')} /></${Field}>
      <${Field} label="Phone"><input class="input" type="tel" value=${f.phone} onInput=${set('phone')} /></${Field}>
    </div>
    <${Field} label="Website or Instagram"><input class="input" value=${f.website} onInput=${set('website')} /></${Field}>
    <div class="field" style="margin-top:15px"><span class="field__label">Colour</span><${SwatchPicker} value=${f.color} onChange=${(c) => setF({ ...f, color: c })} /></div>
    <${Field} label="Notes"><textarea class="textarea" value=${f.notes} onInput=${set('notes')} placeholder="How they like to work, rates, contacts"></textarea></${Field}>
    ${openProject && html`<${ProjectSheet} project=${openProject} state=${state} onClose=${() => setOpenProject(null)} />`}
  </${Sheet}>`;
}

const INVOICE_STATES = [{ id: 'draft', label: 'Draft' }, { id: 'sent', label: 'Sent' }, { id: 'paid', label: 'Paid' }];
const QUOTE_STATES = [{ id: 'draft', label: 'Draft' }, { id: 'sent', label: 'Sent' }, { id: 'accepted', label: 'Accepted' }, { id: 'declined', label: 'Declined' }];

export function InvoiceSheet({ invoice, state, onClose }) {
  const { clients, projects, invoices, settings } = state.data;
  const isNew = !invoice.id;
  const live = isNew ? invoice : invoices.find((i) => i.id === invoice.id) || invoice;
  const today = todayISO();
  const days = Number(settings.paymentDays) || 30;
  const [f, setF] = useState(() => {
    const kind = live.kind || 'invoice';
    return {
      kind, number: live.number || nextNumber(invoices, kind, today), clientId: live.clientId || '', projectId: live.projectId || '',
      amount: live.amount != null && live.amount !== '' ? String(live.amount) : '', issued: live.issued || today,
      due: live.due || addDays(today, days), status: live.status || 'draft', notes: live.notes || '',
    };
  });
  const [newClient, setNewClient] = useState('');
  const [convert, setConvert] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });
  const cur = settings.currency || 'EUR';
  const clientProjects = projects.filter((p) => !f.clientId || f.clientId === '__new' || p.clientId === f.clientId);
  const setKind = (kind) => setF({ ...f, kind, number: nextNumber(invoices, kind, today), status: 'draft' });

  const save = () => {
    if (!f.number.trim()) { toast('Give it a number'); return; }
    const now = Date.now();
    const data = {
      kind: f.kind, number: f.number.trim(), clientId: resolveClient(f.clientId, newClient), projectId: f.projectId,
      amount: num(f.amount), issued: f.issued, due: f.due, status: f.status, notes: f.notes.trim(),
      sentAt: f.status === 'draft' ? null : live.sentAt || now,
      paidAt: f.status === 'paid' ? live.paidAt || now : null,
      acceptedAt: f.status === 'accepted' ? live.acceptedAt || now : null,
    };
    if (isNew) actions.add('invoices', data); else actions.update('invoices', live.id, data);
    if (f.status === 'paid' && live.status !== 'paid') toast('Paid. Nice.', { xp: XP.invoicePaid + (live.sentAt ? 0 : XP.invoiceSent) });
    else if (f.status === 'accepted' && live.status !== 'accepted') toast('Quote accepted', { xp: XP.quote });
    else if (f.status === 'sent' && !live.sentAt && f.kind === 'invoice') toast('Invoice sent', { xp: XP.invoiceSent });
    onClose();
  };

  return html`<${Sheet} title=${isNew ? (f.kind === 'quote' ? 'New quote' : 'New invoice') : f.number} onClose=${onClose} actions=${html`
      ${!isNew && html`<${DangerButton} onConfirm=${() => { actions.remove('invoices', live.id); toast('Deleted'); onClose(); }} />`}
      <button class="btn btn--primary" onClick=${save}>${isNew ? 'Save' : 'Save changes'}</button>`}>
    ${isNew && html`<div style="margin-bottom:16px"><${Segmented} label="Kind" value=${f.kind} onChange=${setKind} items=${[{ id: 'invoice', label: 'Invoice' }, { id: 'quote', label: 'Quote' }]} /></div>`}
    <div class="field"><span class="field__label">Status</span><${Segmented} label="Status" value=${f.status} onChange=${(v) => setF({ ...f, status: v })} items=${f.kind === 'quote' ? QUOTE_STATES : INVOICE_STATES} /></div>
    <div class="fields-2" style="margin-top:15px">
      <${Field} label="Number"><input class="input" value=${f.number} onInput=${set('number')} /></${Field}>
      <${Field} label=${`Amount (${cur})`}><input class="input" inputmode="decimal" data-autofocus value=${f.amount} onInput=${set('amount')} placeholder="0" /></${Field}>
    </div>
    <${Field} label="Client"><${ClientSelect} clients=${clients} value=${f.clientId} onChange=${(v) => setF({ ...f, clientId: v, projectId: '' })} newName=${newClient} onNewName=${setNewClient} /></${Field}>
    <${Field} label="Project">
      <select class="select" value=${f.projectId} onChange=${(e) => setF({ ...f, projectId: e.currentTarget.value })}>
        <option value="">No project</option>
        ${clientProjects.map((p) => html`<option key=${p.id} value=${p.id}>${p.title}</option>`)}
      </select>
    </${Field}>
    <div class="fields-2" style="margin-top:15px">
      <${Field} label="Issued"><input class="input" type="date" value=${f.issued} onInput=${(e) => { const v = e.currentTarget.value; setF({ ...f, issued: v, due: isNew && v ? addDays(v, days) : f.due }); }} /></${Field}>
      <${Field} label=${f.kind === 'quote' ? 'Valid until' : 'Due'}><input class="input" type="date" value=${f.due} onInput=${set('due')} /></${Field}>
    </div>
    <${Field} label="Notes"><textarea class="textarea" value=${f.notes} onInput=${set('notes')} placeholder="What it covers"></textarea></${Field}>
    ${!isNew && f.kind === 'quote' && f.status === 'accepted' && html`<button class="btn btn--ghost btn--block" style="margin-top:16px" onClick=${() => setConvert({ kind: 'invoice', clientId: f.clientId, projectId: f.projectId, amount: num(f.amount) })}><${Icon} name="arrowRight" size="sm" />Turn into an invoice</button>`}
    ${convert && html`<${InvoiceSheet} invoice=${convert} state=${state} onClose=${() => setConvert(null)} />`}
  </${Sheet}>`;
}
