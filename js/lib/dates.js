// Date helpers. Dates are stored as local "YYYY-MM-DD" strings; instants as epoch ms.

export const DAY = 86400000;
const LOCALE = 'en-GB';

const pad = (n) => String(n).padStart(2, '0');

export function isoOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return isoOf(new Date());
}

export function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

// Whole days from a to b (b - a), robust to DST changes.
export function daysBetween(aIso, bIso) {
  const a = parseISO(aIso);
  const b = parseISO(bIso);
  if (!a || !b) return 0;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1);
}

export function weekdayShort(iso) {
  return parseISO(iso).toLocaleDateString(LOCALE, { weekday: 'short' });
}

export function fmtLong(iso) {
  return parseISO(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtDate(iso, withYear = false) {
  if (!iso) return '';
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(LOCALE, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(withYear || !sameYear ? { year: 'numeric' } : {}),
  });
}

export function fmtShort(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function monthShort(iso) {
  return parseISO(iso).toLocaleDateString(LOCALE, { month: 'short' });
}

export function fmtRange(startIso, endIso) {
  if (!endIso || endIso === startIso) return fmtShort(startIso);
  const a = parseISO(startIso);
  const b = parseISO(endIso);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} to ${fmtShort(endIso)}`;
  }
  return `${fmtShort(startIso)} to ${fmtShort(endIso)}`;
}

// "today", "tomorrow", "in 9 days", "yesterday", "3 days ago"
export function relDays(iso, today = todayISO()) {
  const n = daysBetween(today, iso);
  let text;
  if (n === 0) text = 'today';
  else if (n === 1) text = 'tomorrow';
  else if (n === -1) text = 'yesterday';
  else if (n > 1) text = `in ${n} days`;
  else text = `${-n} days ago`;
  return { n, text };
}

export function fmtTime(ms, timeZone) {
  return new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
}

export function fmtAgo(ms) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
