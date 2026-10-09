// Studio: shared helpers and small pieces for projects, clients and invoices.
import { html } from '../../../vendor/preact.js';
import { Icon } from '../../ui.js';
import { todayISO, daysBetween } from '../../lib/dates.js';

export const STAGES = [
  { id: 'lead', label: 'Lead' },
  { id: 'brief', label: 'Brief' },
  { id: 'design', label: 'Design' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'done', label: 'Delivered' },
];
export const stageLabel = (id) => (STAGES.find((s) => s.id === id) || STAGES[0]).label;
export const stageIndex = (id) => Math.max(0, STAGES.findIndex((s) => s.id === id));

// Card colours: pastels, plus three bold ones.
export const SWATCHES = ['pink', 'mint', 'aqua', 'lime', 'butter', 'lilac', 'peach', 'green', 'blue', 'red', 'ink'];
export const swatchFor = (seed) => SWATCHES[[...String(seed || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 7];

export function money(n, currency = 'EUR') {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
  } catch (e) {
    return `${v} ${currency}`;
  }
}
export const hoursOf = (minutes) => {
  const h = (Number(minutes) || 0) / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`;
};
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function dueText(iso, today = todayISO()) {
  if (!iso) return 'No due date';
  const n = daysBetween(today, iso);
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} late`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `${n} days left`;
}

// A sent invoice past its due date is overdue. Quotes go draft, sent, accepted or declined.
export function invoiceState(inv, today = todayISO()) {
  if (inv.kind === 'quote') return inv.status || 'draft';
  if (inv.status === 'paid') return 'paid';
  if (inv.status === 'sent') return inv.due && inv.due < today ? 'overdue' : 'sent';
  return 'draft';
}
export const STATE_LABEL = { draft: 'Draft', sent: 'Sent', overdue: 'Overdue', paid: 'Paid', accepted: 'Accepted', declined: 'Declined' };

// INV-2026-007, Q-2026-003: one more than the highest number this year.
export function nextNumber(invoices, kind, today = todayISO()) {
  const prefix = `${kind === 'quote' ? 'Q' : 'INV'}-${today.slice(0, 4)}-`;
  let max = 0;
  for (const i of invoices) {
    if (i.kind === kind && String(i.number || '').startsWith(prefix)) max = Math.max(max, Number(String(i.number).slice(prefix.length)) || 0);
  }
  return prefix + String(max + 1).padStart(3, '0');
}

export function projectStats(p, data) {
  const tasks = data.tasks.filter((t) => t.projectId === p.id);
  const minutes = data.timelogs.filter((t) => t.projectId === p.id).reduce((a, t) => a + (Number(t.minutes) || 0), 0);
  const bills = data.invoices.filter((i) => i.projectId === p.id && i.kind !== 'quote');
  const invoiced = bills.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const paid = bills.filter((i) => i.status === 'paid').reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const budget = Number(p.budget) || 0;
  return {
    open: tasks.filter((t) => !t.done).length,
    done: tasks.filter((t) => t.done).length,
    minutes,
    invoiced,
    paid,
    rate: minutes >= 30 && budget ? budget / (minutes / 60) : null,
  };
}

export function clientStats(c, data, today = todayISO()) {
  const projects = data.projects.filter((p) => p.clientId === c.id);
  const bills = data.invoices.filter((i) => i.clientId === c.id && i.kind !== 'quote');
  const sum = (list) => list.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  return {
    projects,
    active: projects.filter((p) => p.stage !== 'done').length,
    paid: sum(bills.filter((i) => i.status === 'paid')),
    unpaid: sum(bills.filter((i) => i.status === 'sent')),
    overdue: bills.filter((i) => invoiceState(i, today) === 'overdue').length,
  };
}

export const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');

export function SwatchPicker({ value, onChange }) {
  return html`<div class="swatches" role="radiogroup" aria-label="Colour">
    ${SWATCHES.map((s) => html`<button key=${s} type="button" role="radio" aria-checked=${value === s ? 'true' : 'false'} aria-label=${s} class=${'swatch sw-' + s} onClick=${() => onChange(s)}></button>`)}
  </div>`;
}

export function Avatar({ client, size = 40 }) {
  const sw = (client && client.color) || swatchFor(client && client.name);
  return html`<span class=${'avatar sw-' + sw} style=${`--size:${size}px`} aria-hidden="true">${initials(client && client.name)}</span>`;
}

// Tag dots are saturated, so they read on any card.
const TAG_COLORS = ['#FF4FD8', '#1FBF75', '#2F2FE5', '#FF7A1A', '#F2B705', '#E5341F', '#121212'];
const tagColor = (t) => TAG_COLORS[[...String(t)].reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_COLORS.length];

export function TypeTags({ types }) {
  if (!types || !types.length) return null;
  return html`<span class="tags">${types.map((t) => html`<span key=${t} class="tag"><i class="sw-dot" style=${`background:${tagColor(t)}`}></i>${t}</span>`)}</span>`;
}

// The compact version of the stage track, for cards: five segments, filled up to the current stage.
export function StageBar({ stage }) {
  const at = stageIndex(stage);
  return html`<div class="sbar" role="img" aria-label=${`Stage ${at + 1} of ${STAGES.length}: ${stageLabel(stage)}`}>
    ${STAGES.map((s, i) => html`<i key=${s.id} class=${i <= at ? 'on' : ''}></i>`)}
  </div>`;
}

// The stage track: five steps, done ones filled.
export function StageTrack({ stage, onChange }) {
  const at = stageIndex(stage);
  return html`<div class="stages" role=${onChange ? 'radiogroup' : 'img'} aria-label=${`Stage: ${stageLabel(stage)}`}>
    ${STAGES.map((s, i) => onChange
      ? html`<button key=${s.id} type="button" role="radio" aria-checked=${s.id === stage ? 'true' : 'false'} class=${'stage' + (i < at ? ' stage--past' : '') + (i === at ? ' stage--now' : '')} onClick=${() => onChange(s.id)}>${s.label}</button>`
      : html`<span key=${s.id} class=${'stage' + (i < at ? ' stage--past' : '') + (i === at ? ' stage--now' : '')}>${s.label}</span>`)}
  </div>`;
}

export function Arrow() {
  return html`<${Icon} name="arrowUpRight" />`;
}
