// Studio: clients, with what is active, paid and still owed.
import { html, useState } from '../../../vendor/preact.js';
import { Icon, Empty } from '../../ui.js';
import { Avatar, money, clientStats, Arrow } from './common.js';
import { ClientSheet } from './sheets.js';

export function ClientsView({ state }) {
  const { clients, settings } = state.data;
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const cur = settings.currency || 'EUR';
  const rows = clients
    .map((c) => ({ c, s: clientStats(c, state.data) }))
    .filter(({ c }) => !q || `${c.name} ${c.company}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.s.active - a.s.active || a.c.name.localeCompare(b.c.name));
  const owed = rows.reduce((a, r) => a + r.s.unpaid, 0);
  return html`<div>
    <header class="s-head">
      <span class="s-label">${clients.length} ${clients.length === 1 ? 'client' : 'clients'}${owed ? `, ${money(owed, cur)} still owed` : ''}</span>
      <div class="s-head__row">
        <h1 class="s-title">Clients</h1>
        <button class="s-circle s-circle--mint" onClick=${() => setOpen({})}><${Icon} name="plus" /><span>New client</span></button>
      </div>
    </header>
    ${clients.length > 5 && html`<div class="toolbar"><input class="input toolbar__grow" type="search" placeholder="Find a client" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} /></div>`}
    ${rows.length
      ? html`<div class="cgrid">${rows.map(({ c, s }) => html`<button key=${c.id} class="ccard" onClick=${() => setOpen(c)}>
          <div class="ccard__top"><${Avatar} client=${c} size=${52} /><${Arrow} /></div>
          <div class="ccard__name">${c.name}</div>
          <div class="ccard__company">${c.company || c.email || ' '}</div>
          <div class="ccard__stats">
            <span><b>${s.active}</b>active</span>
            <span><b>${money(s.paid, cur)}</b>paid</span>
            <span class=${s.overdue ? 'is-late' : ''}><b>${money(s.unpaid, cur)}</b>${s.overdue ? 'overdue' : 'owed'}</span>
          </div>
        </button>`)}</div>`
      : html`<div class="group"><${Empty} title=${clients.length ? 'No match' : 'No clients yet'}>${clients.length ? 'Try another name.' : 'Add the people you design for. Projects and invoices link to them.'}</${Empty}></div>`}
    ${open && html`<${ClientSheet} key=${open.id || 'new'} client=${open} state=${state} onClose=${() => setOpen(null)} />`}
  </div>`;
}
