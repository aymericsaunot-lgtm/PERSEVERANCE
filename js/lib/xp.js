// Level system. XP comes from what you already log (finished tasks, papers read, habits,
// sport, thesis progress), so there is nothing extra to track and old data counts too.
// Finished tasks only stay synced for 30 days, so days older than a week are frozen
// into meta/progress and read back from there.
import { todayISO, addDays, isoOf, startOfWeek, parseISO } from './dates.js';

export const ATTRS = [
  { id: 'work', label: 'Work', from: 'Tasks, deadlines, beamtimes and thesis progress' },
  { id: 'mind', label: 'Mind', from: 'Papers read' },
  { id: 'body', label: 'Body', from: 'Sport sessions' },
  { id: 'discipline', label: 'Discipline', from: 'Habits' },
];
const SLOT = { work: 0, mind: 1, body: 2, discipline: 3 };

export const XP = {
  task: 10,
  starredTask: 20,
  deadline: 40,
  beamtime: 100,
  paper: 30,
  habit: 10,
  allHabits: 20,
  thesisPoint: 6,
};

// One XP per two minutes of sport, at most 60 per session.
export const sportXP = (minutes) => Math.max(0, Math.min(60, Math.round((Number(minutes) || 0) / 2)));

export const RULES = [
  ['Task done', `${XP.task} XP, starred ${XP.starredTask}`, 'work'],
  ['Deadline submitted', `${XP.deadline} XP`, 'work'],
  ['Beamtime completed', `${XP.beamtime} XP`, 'work'],
  ['Thesis progress', `${XP.thesisPoint} XP per chapter point`, 'work'],
  ['Paper read', `${XP.paper} XP`, 'mind'],
  ['Sport', '1 XP per 2 minutes, up to 60', 'body'],
  ['Habit ticked', `${XP.habit} XP`, 'discipline'],
  ['Every habit in a day', `${XP.allHabits} XP bonus`, 'discipline'],
];

const dayOf = (ms) => isoOf(new Date(ms));
const zero = () => [0, 0, 0, 0];
const sum = (row) => (row ? row[0] + row[1] + row[2] + row[3] : 0);

// Level L to L+1 takes 100 + 50 L XP: level 2 after a good day, level 10 after about six weeks.
export function levelInfo(xp) {
  let level = 1;
  let floor = 0;
  let step = 150;
  while (xp >= floor + step) { floor += step; level++; step = 100 + 50 * level; }
  return { level, floor, next: floor + step, into: xp - floor, step, pct: Math.max(0, Math.min(1, (xp - floor) / step)) };
}

export function attrLevel(xp) {
  const v = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(v / 40)) + 1;
  const floor = 40 * (level - 1) ** 2;
  const next = 40 * level ** 2;
  return { level, pct: (v - floor) / (next - floor), toNext: next - v };
}

// Consecutive days in `days` ending today (or yesterday, while today is still open).
export function streak(days, today = todayISO()) {
  const set = new Set(days || []);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// Every XP gain the live data can explain, oldest data included.
export function xpEvents(data, today = todayISO()) {
  const out = [];
  const push = (day, attr, xp, label, kind, at = 0) => {
    if (day && day <= today && xp) out.push({ day, attr, xp, label, kind, at });
  };
  for (const t of data.tasks) {
    if (t.done && t.doneAt) push(dayOf(t.doneAt), 'work', t.starred ? XP.starredTask : XP.task, t.title, 'task', t.doneAt);
  }
  for (const d of data.deadlines) {
    if (d.done) push(d.doneAt ? dayOf(d.doneAt) : d.date, 'work', XP.deadline, d.title, 'deadline', d.doneAt || 0);
  }
  for (const b of data.beamtimes) {
    const end = b.end || b.start;
    if (end && end < today) push(end, 'work', XP.beamtime, `${b.facility} beamtime`, 'beamtime');
  }
  for (const c of data.chapters) {
    for (const [day, pts] of Object.entries(c.gains || {})) {
      push(day, 'work', Math.round((Number(pts) || 0) * XP.thesisPoint), `${c.title}, ${pts > 0 ? '+' : ''}${pts}%`, 'thesis');
    }
  }
  for (const p of data.papers) {
    if (p.status === 'read' && p.readAt) push(dayOf(p.readAt), 'mind', XP.paper, p.title, 'paper', p.readAt);
  }
  for (const s of data.sessions) push(s.date, 'body', sportXP(s.minutes), `${s.type}, ${s.minutes} min`, 'sport', s.createdAt || 0);

  const active = data.habits.filter((h) => !h.archived);
  const perDay = new Map();
  for (const h of data.habits) {
    for (const day of h.days || []) {
      push(day, 'discipline', XP.habit, h.name, 'habit');
      perDay.set(day, (perDay.get(day) || 0) + 1);
    }
  }
  for (const [day, n] of perDay) {
    const existing = active.filter((h) => !h.createdAt || dayOf(h.createdAt) <= day).length;
    if (existing >= 2 && n >= existing) push(day, 'discipline', XP.allHabits, 'Every habit done', 'bonus');
  }
  return out;
}

function rowsByDay(events) {
  const m = new Map();
  for (const e of events) {
    let row = m.get(e.day);
    if (!row) { row = zero(); m.set(e.day, row); }
    row[SLOT[e.attr]] += e.xp;
  }
  return m;
}

// The patch that freezes finished days (older than a week) into meta/progress, or null.
// `days` is left out when empty: a merge with an empty map would replace the stored one.
export function archivePatch(data, today = todayISO()) {
  const doc = data.progress || {};
  const target = addDays(today, -7);
  if (doc.through && doc.through >= target) return null;
  const known = doc.days || {};
  const days = {};
  for (const [day, row] of rowsByDay(xpEvents(data, today))) {
    if (day > target || (doc.through && day <= doc.through) || known[day]) continue;
    days[day] = row;
  }
  return Object.keys(days).length ? { through: target, days } : { through: target };
}

function computeProgress(data, today) {
  const events = xpEvents(data, today);
  const live = rowsByDay(events);
  const doc = data.progress || {};
  const through = doc.through || null;
  const days = new Map();
  if (through) {
    for (const [day, row] of Object.entries(doc.days || {})) if (day <= through && Array.isArray(row)) days.set(day, row);
  }
  for (const [day, row] of live) if (!through || day > through) days.set(day, row);

  const totals = zero();
  for (const row of days.values()) row.forEach((v, i) => { totals[i] += Number(v) || 0; });
  // Thesis progress logged before XP existed still counts, just without a date.
  const thesisNow = data.chapters.reduce((s, c) => s + (Number(c.progress) || 0), 0);
  const thesisLogged = data.chapters.reduce((s, c) => s + Object.values(c.gains || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
  totals[0] += Math.max(0, Math.round((thesisNow - thesisLogged) * XP.thesisPoint));

  const total = Math.max(0, totals.reduce((a, b) => a + b, 0));
  const goal = Number(data.settings.xpGoal) || 100;
  const dayXP = (d) => Math.max(0, sum(days.get(d)));

  const weekStart = isoOf(startOfWeek(parseISO(today)));
  const week = [];
  const weekAttr = zero();
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const xp = dayXP(d);
    week.push({ day: d, xp, hit: xp >= goal, future: d > today, today: d === today });
    const row = days.get(d);
    if (row) row.forEach((v, k) => { weekAttr[k] += v; });
  }
  const weekXP = week.reduce((a, d) => a + d.xp, 0);
  let lastWeekXP = 0;
  for (let i = 1; i <= 7; i++) lastWeekXP += dayXP(addDays(weekStart, -i));

  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const start = addDays(weekStart, -7 * w);
    let xp = 0;
    for (let i = 0; i < 7; i++) xp += dayXP(addDays(start, i));
    weeks.push({ start, xp, current: w === 0 });
  }

  let goalStreak = 0;
  for (let d = dayXP(today) >= goal ? today : addDays(today, -1); dayXP(d) >= goal; d = addDays(d, -1)) goalStreak++;

  const recent = events
    .slice()
    .sort((a, b) => b.day.localeCompare(a.day) || (b.at || 0) - (a.at || 0))
    .slice(0, 24);

  return {
    total,
    ...levelInfo(total),
    goal,
    todayXP: dayXP(today),
    todayAttr: days.get(today) || zero(),
    week,
    weekXP,
    lastWeekXP,
    weeks,
    goalStreak,
    attrs: ATTRS.map((a, i) => ({ ...a, xp: Math.max(0, totals[i]), week: Math.max(0, weekAttr[i]), ...attrLevel(totals[i]) })),
    recent,
  };
}

// state.data is replaced on every change, so a WeakMap keyed on it caches one computation per state.
const cache = new WeakMap();
export function progressOf(data, today = todayISO()) {
  const hit = cache.get(data);
  if (hit && hit.today === today) return hit.value;
  const value = computeProgress(data, today);
  cache.set(data, { today, value });
  return value;
}
