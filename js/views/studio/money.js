// Studio: quotes and invoices, what came in and what is still owed.
import { html, useState } from '../../../vendor/preact.js';
import { Icon, Segmented, Section, Empty, useWidth } from '../../ui.js';
import { todayISO, isoOf, fmtDate, daysBetween } from '../../lib/dates.js';
import { money, invoiceState, STATE_LABEL, SWATCHES } from './common.js';
import { InvoiceSheet } from './sheets.js';

const sum = (list) => list.reduce((a, i) => a + (Number(i.amount) || 0), 0);
const dayOf = (ms) => (ms ? isoOf(new Date(ms)) : '');

// Paid per month over the last year, one pastel bar per month, this month in ink.
function MonthBars({ invoices, currency }) {
  const [ref, W] = useWidth(320);
  const H = 150;
  const now = new Date();
  const months = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = isoOf(d).slice(0, 7);
    months.push({ key, label: d.toLocaleDateString('en-GB', { month: 'narrow' }), total: sum(invoices.filter((i) => dayOf(i.paidAt).startsWith(key))) });
  }
  const max = Math.max(1, ...months.map((m) => m.total));
  const gap = 6;
  const bw = (W - gap * 11) / 12;
  return html`<div class="mbars" ref=${ref}>
    <svg viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} role="img" aria-label=${`Paid per month: ${months.map((m) => `${m.key} ${Math.round(m.total)}`).join(', ')}`}>
      ${months.map((m, i) => {
        const h = m.total ? Math.max(6, (m.total / max) * (H - 26)) : 3;
        const x = i * (bw + gap);
        const current = i === 11;
        return html`<g key=${m.key}>
          <rect x=${x} y=${H - 18 - h} width=${bw} height=${h} rx="5" class=${current ? 'mbar mbar--now' : `mbar sw-${SWATCHES[i % 7]}`} />
          <text x=${x + bw / 2} y=${H - 3} text-anchor="middle" class="mbars__label">${m.label}</text>
        </g>`;
      })}
    </svg>
    <div class="mbars__note">Best month ${money(max === 1 ? 0 : max, currency)}</div>
  </div>`;
}

export function MoneyView({ state }) {
  const { invoices, clients, projects, settings } = state.data;
  const today = todayISO();
  const cur = settings.currency || 'EUR';
  const [tab, setTab] = useState('invoice');
  const [open, setOpen] = useState(null);
  const clientName = (id) => (clients.find((c) => c.id === id) || {}).name || '';
  const projectName = (id) => (projects.find((p) => p.id === id) || {}).title || '';

  const bills = invoices.filter((i) => i.kind !== 'quote');
  const quotes = invoices.filter((i) => i.kind === 'quote');
  const paid = bills.filter((i) => i.status === 'paid').sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0));
  const sent = bills.filter((i) => i.status === 'sent').sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  const overdue = sent.filter((i) => invoiceState(i, today) === 'overdue');
  const waiting = sent.filter((i) => invoiceState(i, today) !== 'overdue');
  const drafts = bills.filter((i) => !i.status || i.status === 'draft');
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  const groups = tab === 'invoice'
    ? [['Overdue', overdue], ['Waiting for payment', waiting], ['Drafts', drafts], ['Paid', paid.slice(0, 12)]]
    : [['Waiting for an answer', quotes.filter((q) => q.status === 'sent')], ['Drafts', quotes.filter((q) => !q.status || q.status === 'draft')], ['Accepted', quotes.filter((q) => q.status === 'accepted')], ['Declined', quotes.filter((q) => q.status === 'declined')]];

  const row = (i) => {
    const st = invoiceState(i, today);
    const when = st === 'paid' ? `paid ${fmtDate(dayOf(i.paidAt))}` : i.due ? (st === 'overdue' ? `${daysBetween(i.due, today)} days overdue` : `due ${fmtDate(i.due)}`) : '';
    return html`<button key=${i.id} class="row row--button" onClick=${() => setOpen(i)}>
      <div class="row__main">
        <div class="row__title">${clientName(i.clientId) || projectName(i.projectId) || 'No client'}</div>
        <div class="row__sub">${[i.number, clientName(i.clientId) && projectName(i.projectId), when].filter(Boolean).join(' · ')}</div>
      </div>
      <span class=${'state state--' + st}>${STATE_LABEL[st]}</span>
      <span class="row__side row__side--strong">${money(i.amount, cur)}</span>
    </button>`;
  };

  return html`<div>
    <header class="s-head">
      <span class="s-label">${year} so far: ${money(sum(paid.filter((i) => dayOf(i.paidAt).startsWith(year))), cur)}</span>
      <div class="s-head__row">
        <h1 class="s-title">Money</h1>
        <button class="s-circle s-circle--butter" onClick=${() => setOpen({ kind: tab })}><${Icon} name="plus" /><span>${tab === 'quote' ? 'New quote' : 'New invoice'}</span></button>
      </div>
    </header>

    <div class="tiles">
      <div class="tile sw-mint"><span class="tile__label">Paid this month</span><span class="tile__big">${money(sum(paid.filter((i) => dayOf(i.paidAt).startsWith(month))), cur)}</span></div>
      <div class="tile sw-butter"><span class="tile__label">Waiting</span><span class="tile__big">${money(sum(waiting), cur)}</span><span class="tile__sub">${waiting.length} ${waiting.length === 1 ? 'invoice' : 'invoices'}</span></div>
      <div class=${'tile ' + (overdue.length ? 'sw-red' : 'sw-aqua')}><span class="tile__label">Overdue</span><span class="tile__big">${money(sum(overdue), cur)}</span><span class="tile__sub">${overdue.length ? `${overdue.length} to chase` : 'All on time'}</span></div>
      <div class="tile sw-pink"><span class="tile__label">Quotes out</span><span class="tile__big">${money(sum(quotes.filter((q) => q.status === 'sent')), cur)}</span><span class="tile__sub">${quotes.filter((q) => q.status === 'sent').length} waiting</span></div>
    </div>

    <div class="grid-2">
      <${Section} title="Income" meta="Last 12 months">
        <div class="group"><${MonthBars} invoices=${paid} currency=${cur} /></div>
      </${Section}>
      <div>
        <div class="toolbar"><${Segmented} label="Invoices or quotes" value=${tab} onChange=${setTab} items=${[{ id: 'invoice', label: 'Invoices', count: bills.length }, { id: 'quote', label: 'Quotes', count: quotes.length }]} /></div>
        ${groups.every(([, list]) => !list.length)
          ? html`<div class="group"><${Empty} title=${tab === 'quote' ? 'No quotes yet' : 'No invoices yet'}>${tab === 'quote' ? 'Send a quote, mark it accepted, then turn it into an invoice in one tap.' : 'Create one from a project, or with the button above.'}</${Empty}></div>`
          : groups.filter(([, list]) => list.length).map(([title, list]) => html`<${Section} key=${title} title=${title} meta=${money(sum(list), cur)}>
              <div class="group">${list.map(row)}</div>
            </${Section}>`)}
      </div>
    </div>
    ${open && html`<${InvoiceSheet} key=${open.id || 'new-' + open.kind} invoice=${open} state=${state} onClose=${() => setOpen(null)} />`}
  </div>`;
}
