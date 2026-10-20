// Level system. XP comes from what you already log (finished tasks, papers read, delivered
// projects, paid invoices, habits, sport...), so there is nothing extra to track and old data
// counts too. Finished tasks only stay synced for 30 days, so days older than a week are
// frozen into meta/progress and read back from there.
import { todayISO, addDays, isoOf, startOfWeek, parseISO } from './dates.js';

// Four attribute slots; each space names them after what feeds them.
const LABELS = {
  research: [
    ['work', 'Work', 'Tasks, deadlines, beamtimes and thesis progress'],
    ['mind', 'Mind', 'Papers read'],
    ['body', 'Body', 'Sport sessions'],
    ['discipline', 'Discipline', 'Habits'],
  ],
  studio: [
    ['work', 'Craft', 'Tasks, hours on projects and delivered projects'],
    ['mind', 'Business', 'New clients, quotes accepted, invoices sent and paid'],
    ['body', 'Body', 'Sport sessions'],
    ['discipline', 'Discipline', 'Habits'],
  ],
};
export const attrsFor = (edition) => (LABELS[edition] || LABELS.research).map(([id, label, from]) => ({ id, label, from }));
export const ATTRS = attrsFor('research');
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
  project: 80,
  client: 20,
  quote: 30,
  invoiceSent: 10,
  invoicePaid: 40,
  fast: 15,
  paperAdded: 5,
  paperStarted: 5,
  quest: 15,
  fullDay: 10,
};

// Daily quests: one per attribute, judged on what that day already holds, so they need no
// extra logging and count for the past week too. All four in a day is a Full day: +10 to
// every attribute.
const count = (evs, kind) => evs.filter((e) => e.kind === kind).length;
const has = (evs, ...kinds) => evs.some((e) => kinds.includes(e.kind));
const QUESTS = {
  research: [
    { id: 'work', attr: 'work', title: 'Finish 3 tasks', hint: 'or submit a deadline, or move the thesis', test: (e) => count(e, 'task') >= 3 || has(e, 'deadline', 'thesis', 'beamtime') },
    { id: 'mind', attr: 'mind', title: 'Add, start or finish a paper', hint: 'adding an arXiv match counts', test: (e) => has(e, 'paper', 'added', 'started') },
    { id: 'body', attr: 'body', title: 'Log a sport session', hint: 'surf, run, gym, table tennis', test: (e) => has(e, 'sport') },
    { id: 'discipline', attr: 'discipline', title: 'Tick every habit', hint: 'all of today’s habits', test: (e, c) => has(e, 'bonus') || (c.habits <= 1 && has(e, 'habit')) },
  ],
  studio: [
    { id: 'work', attr: 'work', title: 'Log 2 hours of studio time', hint: 'or deliver a project, or finish 3 tasks', test: (e) => e.filter((x) => x.kind === 'time').reduce((a, x) => a + x.xp, 0) >= 20 || has(e, 'project') || count(e, 'task') >= 3 },
    { id: 'mind', attr: 'mind', title: 'Move the business', hint: 'a client, a quote or an invoice, or a Clients or Admin task', test: (e) => has(e, 'client', 'quote', 'sent', 'paid') || e.some((x) => x.kind === 'task' && ['Clients', 'Admin'].includes(x.area)) },
    { id: 'body', attr: 'body', title: 'Log a sport session', hint: 'boxing counts double in spirit', test: (e) => has(e, 'sport') },
    { id: 'discipline', attr: 'discipline', title: 'Tick every habit or finish a fast', hint: 'whichever comes first', test: (e, c) => has(e, 'bonus', 'fast') || (c.habits <= 1 && has(e, 'habit')) },
  ],
};
export const questsFor = (edition) => QUESTS[edition] || QUESTS.research;

// A title for every few levels.
const TITLES = [[30, 'Legend'], [25, 'Grandmaster'], [20, 'Master'], [16, 'Veteran'], [12, 'Expert'], [8, 'Journeyman'], [5, 'Adept'], [3, 'Apprentice'], [1, 'Novice']];
export const titleFor = (level) => TITLES.find(([at]) => level >= at)[1];

// One XP per two minutes of sport, at most 60 per session.
export const sportXP = (minutes) => Math.max(0, Math.min(60, Math.round((Number(minutes) || 0) / 2)));
// Ten XP per hour on a project, at most 80 per entry.
export const timeXP = (minutes) => Math.max(0, Math.min(80, Math.round((Number(minutes) || 0) / 6)));

const RULES_BY = {
  research: [
    ['Task done', `${XP.task} XP, starred ${XP.starredTask}`, 'work'],
    ['Deadline submitted', `${XP.deadline} XP`, 'work'],
    ['Beamtime completed', `${XP.beamtime} XP`, 'work'],
    ['Thesis progress', `${XP.thesisPoint} XP per chapter point`, 'work'],
    ['Paper added or started', `${XP.paperAdded} XP each`, 'mind'],
    ['Paper read', `${XP.paper} XP`, 'mind'],
    ['Sport', '1 XP per 2 minutes, up to 60', 'body'],
    ['Habit ticked', `${XP.habit} XP`, 'discipline'],
    ['Every habit in a day', `${XP.allHabits} XP bonus`, 'discipline'],
    ['Daily quest done', `${XP.quest} XP to its attribute`, 'work'],
    ['Full day: all four quests', `+${XP.fullDay} XP to every attribute`, 'discipline'],
  ],
  studio: [
    ['Task done', `${XP.task} XP, starred ${XP.starredTask}`, 'work'],
    ['Hours on a project', '10 XP an hour, up to 80 an entry', 'work'],
    ['Project delivered', `${XP.project} XP`, 'work'],
    ['New client', `${XP.client} XP`, 'mind'],
    ['Quote accepted', `${XP.quote} XP`, 'mind'],
    ['Invoice sent, then paid', `${XP.invoiceSent} XP, then ${XP.invoicePaid}`, 'mind'],
    ['Sport', '1 XP per 2 minutes, up to 60', 'body'],
    ['Habit ticked', `${XP.habit} XP, ${XP.allHabits} bonus for all of them`, 'discipline'],
    ['Fast completed', `${XP.fast} XP`, 'discipline'],
    ['Daily quest done', `${XP.quest} XP to its attribute`, 'work'],
    ['Full day: all four quests', `+${XP.fullDay} XP to every attribute`, 'discipline'],
  ],
};
export const rulesFor = (edition) => RULES_BY[edition] || RULES_BY.research;
export const RULES = RULES_BY.research;

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
  const push = (day, attr, xp, label, kind, at = 0, extra = null) => {
    if (day && day <= today && xp) out.push({ day, attr, xp, label, kind, at, ...extra });
  };
  for (const t of data.tasks) {
    if (t.done && t.doneAt && !t.doneByOther) push(dayOf(t.doneAt), 'work', t.starred ? XP.starredTask : XP.task, t.title, 'task', t.doneAt, { area: t.area || '' });
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
    if (p.addedAt) push(dayOf(p.addedAt), 'mind', XP.paperAdded, p.title, 'added', p.addedAt);
    if (p.startedAt) push(dayOf(p.startedAt), 'mind', XP.paperStarted, p.title, 'started', p.startedAt);
  }
  for (const s of data.sessions) push(s.date, 'body', sportXP(s.minutes), `${s.type}, ${s.minutes} min`, 'sport', s.createdAt || 0);

  // Studio
  const projects = data.projects || [];
  const title = new Map(projects.map((p) => [p.id, p.title]));
  for (const p of projects) if (p.stage === 'done' && p.doneAt) push(dayOf(p.doneAt), 'work', XP.project, p.title, 'project', p.doneAt);
  for (const t of data.timelogs || []) push(t.date, 'work', timeXP(t.minutes), `${title.get(t.projectId) || 'Studio time'}, ${Math.round((t.minutes / 60) * 10) / 10} h`, 'time', t.createdAt || 0);
  for (const c of data.clients || []) if (c.createdAt) push(dayOf(c.createdAt), 'mind', XP.client, c.name, 'client', c.createdAt);
  const fastHours = Number(data.settings.fastHours) || 14;
  for (const f of data.fasts || []) {
    if (f.end && f.end - f.start >= (Number(f.target) || fastHours) * 3600000) {
      push(dayOf(f.end), 'discipline', XP.fast, `Fast, ${Math.round(((f.end - f.start) / 3600000) * 10) / 10} h`, 'fast', f.end);
    }
  }
  for (const inv of data.invoices || []) {
    const label = `${inv.number || (inv.kind === 'quote' ? 'Quote' : 'Invoice')}${title.get(inv.projectId) ? `, ${title.get(inv.projectId)}` : ''}`;
    if (inv.kind === 'quote') {
      if (inv.acceptedAt) push(dayOf(inv.acceptedAt), 'mind', XP.quote, label, 'quote', inv.acceptedAt);
    } else {
      if (inv.sentAt) push(dayOf(inv.sentAt), 'mind', XP.invoiceSent, label, 'sent', inv.sentAt);
      if (inv.paidAt) push(dayOf(inv.paidAt), 'mind', XP.invoicePaid, label, 'paid', inv.paidAt);
    }
  }

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

  // Quests, from the day's other gains.
  const byDay = new Map();
  for (const e of out) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e);
  }
  const quests = questsFor(data.settings.edition);
  const ctx = { habits: active.length };
  for (const [day, evs] of byDay) {
    const done = quests.filter((q) => q.test(evs, ctx));
    for (const q of done) push(day, q.attr, XP.quest, `Quest: ${q.title}`, 'quest', 0, { qid: q.id });
    if (done.length === quests.length) {
      for (const a of ['work', 'mind', 'body', 'discipline']) push(day, a, XP.fullDay, 'Full day: every quest done', 'fullday');
    }
  }
  return out;
}

// Badges: earned once, kept in meta/progress so they stay when old data leaves the sync window.
const BADGES = [
  { id: 'quest', title: 'First quest', desc: 'Finish a daily quest', test: (c) => c.questsDone > 0, of: () => [0, 1] },
  { id: 'fullday', title: 'Full day', desc: 'All four quests in one day', test: (c) => c.fullDay },
  { id: 'roll3', title: 'On a roll', desc: 'Daily goal 3 days in a row', test: (c) => c.goalStreak >= 3, of: (c) => [c.goalStreak, 3] },
  { id: 'roll7', title: 'Unstoppable', desc: 'Daily goal 7 days in a row', test: (c) => c.goalStreak >= 7, of: (c) => [c.goalStreak, 7] },
  { id: 'habit7', title: 'Iron habit', desc: 'One habit 7 days in a row', test: (c) => c.habitStreak >= 7, of: (c) => [c.habitStreak, 7] },
  { id: 'allround', title: 'All-rounder', desc: 'Every attribute at level 3', test: (c) => c.minAttr >= 3, of: (c) => [c.minAttr, 3] },
  { id: 'sport20', title: 'Mover', desc: '20 sport sessions', test: (c) => c.sessions >= 20, of: (c) => [c.sessions, 20] },
  { id: 'papers10', title: 'Bookworm', desc: '10 papers read', test: (c) => c.papersRead >= 10, of: (c) => [c.papersRead, 10], edition: 'research' },
  { id: 'paid5', title: 'Rainmaker', desc: '5 invoices paid', test: (c) => c.paid >= 5, of: (c) => [c.paid, 5], edition: 'studio' },
  { id: 'fast7', title: 'Night shift', desc: '7 fasts completed', test: (c) => c.fasts >= 7, of: (c) => [c.fasts, 7], edition: 'studio' },
  { id: 'lv5', title: 'Adept', desc: 'Reach level 5', test: (c) => c.level >= 5, of: (c) => [c.level, 5] },
  { id: 'lv10', title: 'Journeyman', desc: 'Reach level 10', test: (c) => c.level >= 10, of: (c) => [c.level, 10] },
  { id: 'lv20', title: 'Master', desc: 'Reach level 20', test: (c) => c.level >= 20, of: (c) => [c.level, 20] },
];

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

  const edition = data.settings.edition === 'studio' ? 'studio' : 'research';
  const doneToday = new Set(events.filter((e) => e.day === today && e.kind === 'quest').map((e) => e.qid));
  const quests = questsFor(edition).map((q) => ({ id: q.id, attr: q.attr, title: q.title, hint: q.hint, done: doneToday.has(q.id) }));
  const lvl = levelInfo(total);
  const attrs = attrsFor(data.settings.edition).map((a, i) => ({ ...a, xp: Math.max(0, totals[i]), week: Math.max(0, weekAttr[i]), ...attrLevel(totals[i]) }));
  const ctx = {
    questsDone: events.filter((e) => e.kind === 'quest').length,
    fullDay: events.some((e) => e.kind === 'fullday'),
    goalStreak,
    habitStreak: Math.max(0, ...data.habits.map((h) => streak(h.days, today))),
    minAttr: Math.min(...attrs.map((a) => a.level)),
    sessions: data.sessions.length,
    papersRead: data.papers.filter((x) => x.status === 'read').length,
    paid: (data.invoices || []).filter((i) => i.paidAt).length,
    fasts: (data.fasts || []).filter((f) => f.end && f.end - f.start >= (Number(f.target) || Number(data.settings.fastHours) || 14) * 3600000).length,
    level: lvl.level,
  };
  const kept = doc.badges || {};
  const badges = BADGES.filter((b) => !b.edition || b.edition === edition).map((b) => {
    const [n, of] = b.of ? b.of(ctx) : [0, 1];
    return { id: b.id, title: b.title, desc: b.desc, earned: !!kept[b.id] || b.test(ctx), at: kept[b.id] || null, n: Math.min(n, of), of };
  });

  return {
    total,
    ...lvl,
    title: titleFor(lvl.level),
    quests,
    fullDayToday: quests.every((q) => q.done),
    badges,
    goal,
    todayXP: dayXP(today),
    todayAttr: days.get(today) || zero(),
    week,
    weekXP,
    lastWeekXP,
    weeks,
    goalStreak,
    attrs,
    rules: rulesFor(data.settings.edition),
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
