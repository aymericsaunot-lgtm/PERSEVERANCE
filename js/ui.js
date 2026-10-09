// Shared interface pieces: icons, rich text, sheets, chips, toasts.
import { html, useEffect, useLayoutEffect, useRef, useState } from '../vendor/preact.js';
import { latexToSegments, chemSegments, sameTag } from './lib/text.js';
import { parseISO } from './lib/dates.js';

const PATHS = {
  today: '<path d="M3 18h18"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 8V5"/><path d="m5.3 11.3-1.8-1.8"/><path d="m18.7 11.3 1.8-1.8"/>',
  tasks: '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.3 2.5 2.5 4.9-5.1"/>',
  papers: '<path d="M6.5 3h7.5l4.5 4.5V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4.5h4.5"/><path d="M8.5 12.5h7M8.5 16h5"/>',
  phd: '<path d="M3 20h18"/><path d="M3.5 19c3.2 0 4.6-12 8.5-12s5.3 12 8.5 12"/>',
  life: '<path d="M2.5 10c2 0 2.4-2 4.8-2s2.7 2 4.7 2 2.4-2 4.7-2 2.8 2 4.8 2"/><path d="M2.5 15c2 0 2.4-2 4.8-2s2.7 2 4.7 2 2.4-2 4.7-2 2.8 2 4.8 2"/><path d="M2.5 20c2 0 2.4-2 4.8-2s2.7 2 4.7 2 2.4-2 4.7-2 2.8 2 4.8 2"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9"/><path d="m7 13.5 5-5 5 5"/><path d="M5 4h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  arrow: '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  beam: '<circle cx="9.5" cy="13" r="6"/><path d="m14 9 6.5-5"/><path d="M9.5 13h.01"/>',
  book: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h6"/>',
  thermo: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 16-4-4 4-4"/><path d="M6 12h10"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  sport: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  habit: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.6"/><path d="M20 4v4.6h-4.6"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.4"/><path d="M4 20v-4.6h4.6"/>',
  more: '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" stroke="none"/>',
  speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>',
  speakerOff: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="m16 10 4 4M20 10l-4 4"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8.5v7M8.5 12h7"/>',
  peak: '<path d="M2.5 20h19"/><path d="m4 20 5.5-8.5 3.5 4.5 2-3 5 7"/><path d="M15 10V3.5l3.5 1.6L15 6.8"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7"/><path d="m16.5 6 2.5 2.5"/><path d="m14 8.5 2 2"/>',
  memory: '<path d="M9.5 4.5A3 3 0 0 0 6.6 7 3 3 0 0 0 4.5 12a3 3 0 0 0 2.1 4.6 3 3 0 0 0 5.4 1.2V6.2a3 3 0 0 0-2.5-1.7z"/><path d="M14.5 4.5A3 3 0 0 1 17.4 7a3 3 0 0 1 2.1 5 3 3 0 0 1-2.1 4.6 3 3 0 0 1-5.4 1.2"/>',
  sparkle: '<path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5z"/><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  projects: '<rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/><rect x="13.5" y="14" width="7" height="6" rx="1.5"/>',
  clients: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6 6 0 0 1 3.5 5.5"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  glove: '<path d="M7.5 11.5V8a4.5 4.5 0 0 1 4.5-4.5h1A4.5 4.5 0 0 1 17.5 8v5.5a5 5 0 0 1-5 5H12a4.5 4.5 0 0 1-4.5-4.5z"/><path d="M7.5 11.5H11a2 2 0 0 1 0 4H8.5"/><path d="M9 18.5V21h7.5v-3"/>',
};

export function Icon({ name, size, cls = '', label }) {
  const sizeCls = size === 'sm' ? ' icon--sm' : size === 'xs' ? ' icon--xs' : '';
  return html`<svg class=${'icon' + sizeCls + (cls ? ' ' + cls : '')} viewBox="0 0 24 24" aria-hidden=${label ? undefined : 'true'} role=${label ? 'img' : undefined} aria-label=${label} dangerouslySetInnerHTML=${{ __html: PATHS[name] || '' }}></svg>`;
}

// The app mark: a low sun over the sea, on buoy orange.
export function Mark({ size = 28, cls = '' }) {
  return html`<svg class=${'mark ' + cls} width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#DD4F1C" />
    <circle cx="32" cy="33" r="12" fill="#F8F6F0" />
    <path d="M0 39c7-3.5 12 3 20 0s12-4 20-1 13 3.5 24-.5V50c0 7.7-6.3 14-14 14H14C6.3 64 0 57.7 0 50z" fill="#1C1A16" />
    <path d="M10 48.5c5-2 9 1.6 14 0M34 52.5c5-2 9 1.6 14 0" stroke="#F8F6F0" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.55" />
  </svg>`;
}

// Width of an element in CSS pixels, kept current, for charts drawn in real pixels.
export function useWidth(initial = 600, min = 200) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const update = () => ref.current && setW(Math.max(min, Math.round(ref.current.getBoundingClientRect().width)));
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(ref.current);
    return () => ro && ro.disconnect();
  }, []);
  return [ref, w];
}

// Page header: a small mono line above a large title.
export function PageHead({ over, title, sub, action }) {
  return html`<header class="page-head">
    ${(over || action) && html`<div class="page-head__row"><span class="overline">${over}</span>${action}</div>`}
    <h1 class="page-title">${title}</h1>
    ${sub && html`<p class="page-sub">${sub}</p>`}
  </header>`;
}

function renderSegments(segs) {
  return segs.map((x, i) => (x.t === 'sub' ? html`<sub key=${i}>${x.s}</sub>` : x.t === 'sup' ? html`<sup key=${i}>${x.s}</sup>` : x.t === 'i' ? html`<i key=${i}>${x.s}</i>` : x.s));
}

// LaTeX-flavoured text (titles, abstracts) rendered without innerHTML.
export function Rich({ text }) {
  return html`<span>${renderSegments(latexToSegments(text || ''))}</span>`;
}

// Chemical formula: digits after letters become subscripts.
export function Chem({ text }) {
  return html`<span>${renderSegments(chemSegments(text || ''))}</span>`;
}

export function Section({ title, meta, action, children, id }) {
  return html`<section class="section" id=${id}>
    ${(title || action) && html`<div class="section__head">
      <h2 class="section__title">${title}</h2>
      ${meta != null && meta !== '' ? html`<span class="section__meta">${meta}</span>` : action}
    </div>`}
    ${children}
  </section>`;
}

export function Segmented({ items, value, onChange, label }) {
  return html`<div class="segmented" role="tablist" aria-label=${label}>
    ${items.map((it) => html`<button key=${it.id} class="segmented__item" role="tab" aria-selected=${value === it.id ? 'true' : 'false'} onClick=${() => onChange(it.id)}>
      ${it.label}${it.count != null && html`<span class="segmented__count num">${it.count}</span>`}
    </button>`)}
  </div>`;
}

export function Check({ checked, onChange, label }) {
  return html`<button class="check" role="checkbox" aria-checked=${checked ? 'true' : 'false'} aria-label=${label} onClick=${(e) => { e.stopPropagation(); onChange(!checked); }}>
    <${Icon} name="check" />
  </button>`;
}

export function Empty({ title, children }) {
  return html`<div class="empty">
    ${title && html`<p class="empty__title">${title}</p>`}
    ${children && html`<p>${children}</p>`}
  </div>`;
}

export function DateChip({ iso, accent }) {
  const d = parseISO(iso);
  if (!d) return null;
  return html`<span class=${'date-chip' + (accent ? ' date-chip--accent' : '')} aria-hidden="true">
    <span class="date-chip__day">${d.getDate()}</span>
    <span class="date-chip__mon">${d.toLocaleDateString('en-GB', { month: 'short' })}</span>
  </span>`;
}

export function Field({ label, hint, children }) {
  return html`<label class="field">
    <span class="field__label">${label}</span>
    ${children}
    ${hint && html`<span class="field__hint">${hint}</span>`}
  </label>`;
}

// Two taps to delete: the first arms the button for three seconds.
export function DangerButton({ onConfirm, label = 'Delete', armedLabel = 'Tap again to delete' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button type="button" class=${'btn btn--danger' + (armed ? ' btn--armed' : '')} onClick=${() => (armed ? onConfirm() : setArmed(true))}>
    <${Icon} name="trash" size="sm" />${armed ? armedLabel : label}
  </button>`;
}

// A chip that opens the native date picker; the input itself stays invisible.
export function DatePick({ value, onChange, children, pressed = false, cls = 'chip' }) {
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    if (el.showPicker) {
      try { el.showPicker(); return; } catch (e) { /* fall through */ }
    }
    el.focus();
    el.click();
  };
  return html`<span style="position:relative;display:inline-flex">
    <button type="button" class=${cls} aria-pressed=${pressed ? 'true' : 'false'} onClick=${open}>${children}</button>
    <input ref=${ref} type="date" value=${value || ''} tabindex="-1" aria-hidden="true"
      onInput=${(e) => onChange(e.currentTarget.value)} onChange=${(e) => onChange(e.currentTarget.value)}
      style="position:absolute;left:0;bottom:0;width:100%;height:1px;opacity:0;pointer-events:none;border:0;padding:0" />
  </span>`;
}

let openSheets = 0;
export function Sheet({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    openSheets++;
    document.body.style.overflow = 'hidden';
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('[data-autofocus]');
    if (first && window.matchMedia('(min-width: 900px)').matches) first.focus();
    else if (ref.current) ref.current.focus();
    return () => {
      openSheets--;
      if (!openSheets) document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return html`<div class="sheet-root">
    <div class="sheet-scrim" onClick=${onClose}></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${ref}>
      <div class="sheet__grab"></div>
      <div class="sheet__head">
        <h2 class="sheet__title">${title}</h2>
        <button class="icon-btn icon-btn--sm" aria-label="Close" onClick=${onClose}><${Icon} name="x" size="sm" /></button>
      </div>
      ${children}
      ${actions && html`<div class="sheet__foot">${actions}</div>`}
    </div>
  </div>`;
}

function PlainText({ text }) {
  return text;
}

export function TagEditor({ value = [], suggestions = [], onChange, placeholder = 'Add a tag', plain = false }) {
  const Label = plain ? PlainText : Chem;
  const [text, setText] = useState('');
  const add = (raw) => {
    const t = String(raw || '').trim().replace(/,$/, '');
    if (!t) return;
    if (value.some((v) => sameTag(v, t))) { setText(''); return; }
    const known = suggestions.find((s) => sameTag(s, t));
    onChange([...value, known || t]);
    setText('');
  };
  const remove = (t) => onChange(value.filter((v) => v !== t));
  const rest = suggestions.filter((s) => !value.some((v) => sameTag(v, s)));
  return html`<div>
    <div class="chips" style="margin-bottom:8px">
      ${value.map((t) => html`<span key=${t} class="chip chip--on"><${Label} text=${t} />
        <button class="chip__x" aria-label=${'Remove ' + t} onClick=${(e) => { e.preventDefault(); remove(t); }}><${Icon} name="x" size="xs" /></button>
      </span>`)}
    </div>
    <input class="input" value=${text} placeholder=${placeholder}
      onInput=${(e) => setText(e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); } }}
      onBlur=${() => text && add(text)} />
    ${rest.length > 0 && html`<div class="chips" style="margin-top:8px">
      ${rest.map((s) => html`<button key=${s} class="chip chip--add" onClick=${(e) => { e.preventDefault(); add(s); }}><${Icon} name="plus" size="xs" /><${Label} text=${s} /></button>`)}
    </div>`}
  </div>`;
}

// Toasts
let toastList = [];
const toastSubs = new Set();
export function toast(message, { action, onAction, ms = 3800, xp = 0 } = {}) {
  const id = Math.random().toString(36).slice(2);
  toastList = [...toastList, { id, message, action, onAction, xp }];
  toastSubs.forEach((f) => f());
  setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id);
    toastSubs.forEach((f) => f());
  }, ms);
}

export function Toasts() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    toastSubs.add(f);
    return () => toastSubs.delete(f);
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${toastList.map((t) => html`<div key=${t.id} class="toast">
      ${t.xp > 0 && html`<span class="toast__xp num">+${t.xp} XP</span>`}
      <span>${t.message}</span>
      ${t.action && html`<button class="link-btn" onClick=${() => { t.onAction && t.onAction(); toastList = toastList.filter((x) => x.id !== t.id); toastSubs.forEach((f) => f()); }}>${t.action}</button>`}
    </div>`)}
  </div>`;
}

export function downloadFile(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
