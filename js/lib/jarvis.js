// Jarvis, the assistant: Claude Sonnet 5.5 called straight from this browser with your own
// Anthropic API key. The key stays in this browser's local storage. It is never synced,
// exported or sent anywhere except api.anthropic.com.
import { useEffect, useState } from '../../vendor/preact.js';
import { getState, actions } from '../store.js';
import { todayISO, addDays, isoOf, daysBetween, fmtDate } from './dates.js';
import { progressOf, streak, sportXP } from './xp.js';
import { latexToPlain, uid } from './text.js';
import { loadForecast, summarize, compass, SCORE_LABEL } from './surf.js';
import { beamtimeState, thesisProgress } from '../views/phd.js';
import { readingStats } from '../views/papers.js';

export const MODEL = 'claude-sonnet-5-5';
export const MODEL_LABEL = 'Claude Sonnet 5.5';
// server-side-fallback: a request declined by a safety classifier is retried on another model
// within the same call. thinking-binding-controls: if stored history ever stops matching (an app
// update that changes the tools), old reasoning is dropped instead of the request failing.
const BETAS = ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'];
const MAX_TOKENS = 16000;
const MAX_STEPS = 8;
export const DEPTHS = [
  { id: 'low', label: 'Quick' },
  { id: 'medium', label: 'Balanced' },
  { id: 'high', label: 'Deep' },
];
export const BRIEFING_PROMPT = 'Briefing, please.';

const KEY_STORE = 'dash.jarvis.key';
const CONV_STORE = 'dash.jarvis.conv.v1';
const VOICE_STORE = 'dash.jarvis.voice';

const read = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const write = (k, v) => {
  try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* storage unavailable */ }
};

// A conversation lasts one day, and the day turns over at 4 am so late nights stay in one thread.
export const convDay = () => isoOf(new Date(Date.now() - 4 * 3600 * 1000));

function loadConv() {
  try {
    const c = JSON.parse(localStorage.getItem(CONV_STORE) || 'null');
    return c && c.v === 1 && Array.isArray(c.turns) ? c : null;
  } catch (e) { return null; }
}

const jstate = { conv: loadConv(), busy: false, live: null, error: null, controller: null };
const subs = new Set();
function emit() { subs.forEach((f) => f()); }
let frame = 0;
function emitSoon() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; emit(); });
}

export function useJarvis() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);
  return jstate;
}

function saveConv() {
  try {
    if (jstate.conv) localStorage.setItem(CONV_STORE, JSON.stringify(jstate.conv));
    else localStorage.removeItem(CONV_STORE);
  } catch (e) { /* storage full or blocked: the conversation stays in memory */ }
}

export const getApiKey = () => read(KEY_STORE);
export const hasApiKey = () => !!read(KEY_STORE);
export function setApiKey(key) {
  write(KEY_STORE, (key || '').trim());
  client = null;
  emit();
}
export const voiceOn = () => read(VOICE_STORE) === '1';
export function setVoice(on) {
  write(VOICE_STORE, on ? '1' : '');
  if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
  emit();
}

// The SDK (vendor/anthropic.js, about 200 KB) loads the first time Jarvis is used.
let sdk = null;
let client = null;
let clientKey = '';
async function loadSdk() {
  if (!sdk) sdk = await import('../../vendor/anthropic.js');
  return sdk;
}
async function getClient() {
  const key = getApiKey();
  if (!key) throw Object.assign(new Error('Add your Anthropic API key in Settings to bring Jarvis online.'), { code: 'nokey' });
  const { default: Anthropic } = await loadSdk();
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    clientKey = key;
  }
  return client;
}

// Checks the key and model access without spending tokens.
export async function testApiKey(key) {
  const { default: Anthropic } = await loadSdk();
  const c = new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true, maxRetries: 0 });
  return c.models.retrieve(MODEL);
}

export function describeError(err) {
  if (!err) return 'Something went wrong.';
  if (err.code === 'nokey') return err.message;
  const E = sdk || {};
  const is = (cls) => cls && err instanceof cls;
  const detail = (err.error && err.error.error && err.error.error.message) || err.message || '';
  if (is(E.AuthenticationError)) return 'Anthropic rejected the API key. Check it in Settings, Jarvis.';
  if (is(E.PermissionDeniedError)) return `This API key cannot use ${MODEL_LABEL}. Check its workspace in the Claude Console.`;
  if (is(E.NotFoundError)) return `${MODEL_LABEL} is not available to this API key.`;
  if (is(E.RateLimitError)) return 'Rate limit reached. Give it a minute, then try again.';
  if (is(E.APIConnectionError)) return navigator.onLine ? 'Could not reach Anthropic. Try again in a moment.' : 'You are offline. Jarvis needs a connection.';
  if (is(E.APIError) && err.status === 529) return 'Anthropic is overloaded right now. Try again in a minute.';
  if (is(E.InternalServerError)) return 'Anthropic had a server error. Try again shortly.';
  if (is(E.BadRequestError)) return `Anthropic refused the request: ${detail}`;
  if (is(E.APIError)) return `Anthropic error ${err.status || ''}: ${detail}`.trim();
  return detail || 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// What Jarvis knows: the persona, the user profile and memories, and a snapshot of the dashboard.

function persona(settings) {
  const goal = Number(settings.xpGoal) || 100;
  return `You are Jarvis, the personal assistant built into the user's dashboard app. Your manner comes from J.A.R.V.I.S. in Iron Man: composed, quick, precise and quietly witty, always a step ahead. Be that, not a parody of it: no film quotes, no catchphrases.

# What you see
A snapshot of the dashboard closes this prompt: tasks, habits, the PhD schedule (beamtimes, deadlines, thesis chapters), reading list and arXiv matches, sport log, surf forecast and the level system. Later messages may bring a newer snapshot or the current time; the newest is the truth. Never invent tasks, dates, papers or numbers. If something is not in the snapshot, say you don't see it.

# What you can do
You can add, change and complete tasks, tick habits, log sport sessions, add PhD deadlines and remember lasting facts about the user. When the user asks for one of these, do it, then confirm in a few words what changed. Several changes in one go are fine. When two items could match, or a date is unclear in a way that matters, ask one short question instead of guessing. When the user mentions something about themselves worth knowing next week (a goal, a routine, a preference, a constraint), remember it without being asked and say so briefly.
Resolve relative dates ("Friday", "next week", "tomorrow") against the date in the snapshot, and pass dates to tools as YYYY-MM-DD.

# The level system
XP comes automatically from what the user logs: task done 10 (starred 20), deadline submitted 40, beamtime completed 100, thesis progress 6 per chapter point, paper read 30, sport 1 per 2 minutes (at most 60 a session), habit ticked 10, plus 20 when every habit is done that day. Levels are called Marks, like the suits: level 7 is Mark VII. The daily goal is ${goal} XP. The four attributes are Work, Mind, Body and Discipline.
Use it to push the user, with judgement: a level within reach, a streak worth protecting, a neglected attribute, a week that beats the last. At most one such nudge per reply, and none when the user is focused on something else.

# How you talk
- Lead with the answer or the action. Most replies are two to five sentences.
- Be specific: name the task, the paper, the beamtime, the swell in metres and seconds.
- Be candid. If the user is overcommitted, behind on the thesis or skipping habits, say so plainly and kindly, with one concrete next step.
- Warm, never gushing: no flattery, no emoji.
- Reply in the language the user writes in.
- Plain text. A short list only for a plan or several items; **bold** for at most one key phrase. No headings, no tables.

# Briefings
When asked for a briefing, write at most 90 words, fitted to the time of day: in the morning the day ahead, later on what is left today and what comes tomorrow. Cover what matters most (overdue items, today's starred and due tasks, the next deadline or beamtime if it is within two weeks), add one observation from the data (surf window, reading, habits, momentum), and end with one concrete push. Start straight in, with at most a two-word greeting.`;
}

function profileBlock(data) {
  const p = data.settings.profile || {};
  const name = (p.name || '').trim();
  const lines = ['# About the user'];
  lines.push(name ? `Address the user as "${name}".` : 'The user has not said how to be addressed: use no name or title.');
  if ((p.about || '').trim()) lines.push(`In their own words: ${p.about.trim()}`);
  const mem = data.memories.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  if (mem.length) {
    lines.push('', 'Things you have been asked to remember (oldest first):');
    for (const m of mem) lines.push(`- ${m.text}`);
  }
  return lines.join('\n');
}

const wd = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
const day = (iso) => `${iso} (${wd(iso)})`;
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

function nowLine() {
  const d = new Date();
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* ignore */ }
  return `${date}, ${time}${tz ? ` (${tz})` : ''}`;
}

async function surfSummary(settings) {
  try {
    const demo = getState().status.mode === 'demo';
    const fc = await Promise.race([
      loadForecast(settings.surf, { demo }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return summarize(fc, settings.surf);
  } catch (e) {
    return null;
  }
}

function snapshotBody(data, surf) {
  const today = todayISO();
  const s = data.settings;
  const L = [];

  const p = progressOf(data);
  const lived = p.week.filter((d) => !d.future);
  L.push('## Progress');
  L.push(`Level ${p.level} (Mark ${p.mark}), ${p.total} XP in total, ${p.next - p.total} XP to level ${p.level + 1}.`);
  L.push(`Today ${p.todayXP} of ${p.goal} XP. Goal reached on ${lived.filter((d) => d.hit).length} of ${lived.length} days this week; goal streak ${p.goalStreak} day(s).`);
  L.push(`This week ${p.weekXP} XP, last week ${p.lastWeekXP} XP.`);
  L.push(`Attributes: ${p.attrs.map((a) => `${a.label} level ${a.level} (${a.xp} XP, +${a.week} this week)`).join('; ')}.`);

  const open = data.tasks.filter((t) => !t.done)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
  L.push('', `## Open tasks (${open.length})`);
  for (const t of open.slice(0, 40)) {
    const bits = [t.area || 'no area'];
    if (t.due) bits.push(t.due < today ? `overdue, was due ${day(t.due)}` : t.due === today ? 'due today' : `due ${day(t.due)}`);
    if (t.starred) bits.push('starred');
    L.push(`- [${t.id}] ${t.title} (${bits.join(', ')})${t.notes ? `. Notes: ${clip(t.notes.replace(/\s+/g, ' '), 140)}` : ''}`);
  }
  if (open.length > 40) L.push(`- and ${open.length - 40} more`);
  const doneToday = data.tasks.filter((t) => t.done && t.doneAt && isoOf(new Date(t.doneAt)) === today);
  L.push(doneToday.length ? `Done today: ${doneToday.map((t) => t.title).join('; ')}.` : 'Nothing finished today yet.');

  const habits = data.habits.filter((h) => !h.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
  L.push('', '## Habits');
  if (!habits.length) L.push('No habits set up.');
  for (const h of habits) {
    const set = new Set(h.days || []);
    let week = 0;
    for (let i = 0; i < 7; i++) if (set.has(addDays(today, -i))) week++;
    L.push(`- [${h.id}] ${h.name}: ${set.has(today) ? 'done today' : 'not yet today'}, streak ${streak(h.days, today)}, ${week} of the last 7 days`);
  }

  L.push('', '## PhD');
  const bts = data.beamtimes.map((b) => ({ b, st: beamtimeState(b, today) })).filter((x) => x.st.phase !== 'past')
    .sort((a, b) => a.b.start.localeCompare(b.b.start));
  if (!bts.length) L.push('No beamtime scheduled.');
  for (const { b, st } of bts) {
    const when = st.phase === 'now' ? `running now, day ${st.day} of ${st.total}` : `in ${st.n} days`;
    L.push(`- Beamtime ${b.facility}${b.beamline ? ` (${b.beamline})` : ''}: ${day(b.start)} to ${day(b.end || b.start)}, ${when}${b.notes ? `. Notes: ${clip(b.notes, 120)}` : ''}`);
  }
  const dls = data.deadlines.filter((d) => !d.done && d.date).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of dls.slice(0, 12)) {
    const n = daysBetween(today, d.date);
    L.push(`- Deadline [${d.id}] ${d.title}${d.facility ? `, ${d.facility}` : ''} (${d.kind || 'other'}): ${day(d.date)}, ${n < 0 ? `${-n} days late` : n === 0 ? 'today' : `in ${n} days`}`);
  }
  if (!dls.length) L.push('No open deadlines.');
  const chs = data.chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const th = s.thesis || {};
  L.push(`Thesis "${th.title || 'PhD thesis'}": ${thesisProgress(chs)}% overall${th.target ? `, target submission ${day(th.target)} (${daysBetween(today, th.target)} days away)` : ', no target date set'}.`);
  if (chs.length) L.push(`Chapters: ${chs.map((c) => `${c.title} ${Number(c.progress) || 0}%`).join('; ')}.`);

  const r = readingStats(data.papers);
  L.push('', '## Reading');
  L.push(`Read ${r.week} this week, ${r.month} this month, ${r.year} this year. ${r.toread} waiting to be read.`);
  if (r.reading.length) L.push(`Reading now: ${r.reading.slice(0, 4).map((x) => `"${clip(latexToPlain(x.title), 110)}"`).join('; ')}.`);
  const toread = data.papers.filter((x) => x.status === 'toread').sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  if (toread.length) L.push(`Next in the queue: ${toread.slice(0, 4).map((x) => `"${clip(latexToPlain(x.title), 110)}"`).join('; ')}.`);
  const fresh = data.arxiv.filter((x) => x.status === 'new');
  if (fresh.length) L.push(`${fresh.length} new arXiv matches: ${fresh.slice(0, 5).map((x) => `"${clip(latexToPlain(x.title), 100)}"`).join('; ')}.`);

  L.push('', '## Sport');
  const since = addDays(today, -13);
  const recent = data.sessions.filter((x) => x.date >= since);
  if (!recent.length) L.push('No sessions in the last two weeks.');
  else {
    const by = new Map();
    for (const x of recent) {
      const cur = by.get(x.type) || { n: 0, min: 0 };
      by.set(x.type, { n: cur.n + 1, min: cur.min + (Number(x.minutes) || 0) });
    }
    L.push(`Last 14 days: ${[...by].map(([t, v]) => `${t} ${v.n}x (${v.min} min)`).join(', ')}.`);
    const last = recent.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    L.push(`Latest: ${last.type}, ${last.minutes} min, ${day(last.date)}${last.note ? `, "${clip(last.note, 80)}"` : ''}.`);
  }

  if (surf) {
    const n = surf.now;
    const spot = s.surf || {};
    L.push('', `## Surf at ${spot.name || 'the home spot'} (beach faces ${compass(Number(spot.facing))})`);
    L.push(`Now: ${n.height != null ? n.height.toFixed(1) : '?'} m at ${n.period != null ? Math.round(n.period) : '?'} s from ${compass(n.dir)}, wind ${n.wind != null ? Math.round(n.wind) : '?'} km/h${n.rel ? ` ${n.rel}` : ''}${n.sst != null ? `, water ${n.sst.toFixed(0)}°C` : ''}: ${SCORE_LABEL[n.score]}.`);
    const t0 = surf.days[0];
    L.push(t0 && t0.best ? `Best window today around ${t0.bestLabel}: ${SCORE_LABEL[t0.best.score]}, ${t0.best.height.toFixed(1)} m, wind ${Math.round(t0.best.wind ?? 0)} km/h ${t0.best.rel || ''}.`.trim() : 'No daylight session left today.');
    const next = surf.days.slice(1, 5).filter((d) => d.best);
    if (next.length) L.push(`Next days: ${next.map((d) => `${d.name} ${d.best.height.toFixed(1)} m ${SCORE_LABEL[d.best.score]} around ${d.bestLabel}`).join('; ')}.`);
  }

  L.push('', '## Lists');
  L.push(`Task areas: ${(s.taskAreas || []).join(', ') || 'none'}.`);
  L.push(`Sport types: ${(s.sportTypes || []).join(', ') || 'none'}.`);
  return L.join('\n');
}

async function snapshot(state) {
  const surf = await surfSummary(state.data.settings);
  return { now: nowLine(), body: snapshotBody(state.data, surf) };
}

async function startConversation(state) {
  const snap = await snapshot(state);
  return {
    v: 1,
    id: uid(),
    day: convDay(),
    startedAt: Date.now(),
    // Frozen for the whole conversation, so the prompt cache and earlier reasoning stay valid.
    system: [
      { type: 'text', text: persona(state.data.settings) },
      { type: 'text', text: profileBlock(state.data) },
      { type: 'text', text: `# Dashboard snapshot\nNow: ${snap.now}\n\n${snap.body}` },
    ],
    body: snap.body,
    clockAt: Date.now(),
    turns: [],
    actions: {},
    notes: [],
  };
}

// New facts go in as appended system messages; earlier turns are never edited.
async function addContext(conv, state) {
  const snap = await snapshot(state);
  const notes = (conv.notes || []).splice(0);
  const parts = [];
  if (notes.length) parts.push(`The user undid these actions from the app: ${notes.join('; ')}.`);
  if (snap.body !== conv.body) {
    parts.push(`<dashboard_update>\nNow: ${snap.now}\n\n${snap.body}\n</dashboard_update>`);
    conv.body = snap.body;
    conv.clockAt = Date.now();
  } else if (Date.now() - (conv.clockAt || 0) > 10 * 60 * 1000) {
    parts.push(`Now: ${snap.now}.`);
    conv.clockAt = Date.now();
  }
  if (parts.length) conv.turns.push({ m: { role: 'system', content: parts.join('\n\n') }, hidden: true, at: Date.now() });
}

// ---------------------------------------------------------------------------
// Tools: what Jarvis can change. Inputs are validated before anything is written.

const TOOLS = [
  {
    name: 'add_task',
    description: 'Add a task to the user\'s list. Use it whenever the user asks to add, note, plan or be reminded of something to do. Give a due date when the user mentions one; star it when they call it important or urgent, or want it on Today.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title starting with a verb, e.g. "Book the train to Berlin".' },
        area: { type: 'string', description: 'One of the task areas listed in the snapshot. Leave it out when unsure.' },
        due: { type: 'string', description: 'Due date, YYYY-MM-DD.' },
        starred: { type: 'boolean', description: 'Pin the task to Today.' },
        notes: { type: 'string', description: 'Details, links or the next step.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Change an open task: reschedule, rename, star or unstar, move to another area, or edit its notes. Use the task id in square brackets from the snapshot, and send only the fields that change.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string' },
        due: { type: 'string', description: 'New due date, YYYY-MM-DD, or an empty string to remove the date.' },
        starred: { type: 'boolean' },
        area: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done when the user says they finished it, or reopen it with done set to false. Use the task id from the snapshot.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, done: { type: 'boolean', description: 'Defaults to true.' } },
      required: ['task_id'],
    },
  },
  {
    name: 'check_habit',
    description: 'Tick a habit as done for a day (today unless the user says otherwise), or untick it with done set to false. Use the habit id from the snapshot.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        habit_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today.' },
        done: { type: 'boolean', description: 'Defaults to true.' },
      },
      required: ['habit_id'],
    },
  },
  {
    name: 'log_sport',
    description: 'Log a sport session the user did. Use one of the sport types from the snapshot when it fits.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'For example Surf.' },
        minutes: { type: 'integer', description: 'Duration in minutes.' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today.' },
        note: { type: 'string' },
      },
      required: ['type', 'minutes'],
    },
  },
  {
    name: 'add_deadline',
    description: 'Add a PhD deadline: a proposal call, a report, a conference abstract or an admin due date.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD.' },
        kind: { type: 'string', enum: ['proposal', 'conference', 'admin', 'other'] },
        facility: { type: 'string', description: 'Facility or institution, if any.' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'remember',
    description: 'Save a lasting fact about the user for future conversations: goals, routines, preferences, constraints, people and projects that matter. Use it when the user shares something worth knowing next week, or asks you to remember. Not for passwords, secrets or details that only matter today.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'One self-contained sentence, e.g. "Writes best in the morning and keeps lab work for the afternoon."' } },
      required: ['fact'],
    },
  },
];

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T12:00:00'));
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = (input, ...names) => { for (const n of names) if (input[n] !== undefined) return input[n]; return undefined; };
// Exact id, or an unambiguous prefix of at least six characters.
const findIn = (list, id) => {
  const key = String(id || '');
  if (!key) return undefined;
  const exact = list.find((x) => x.id === key);
  if (exact || key.length < 6) return exact;
  const hits = list.filter((x) => x.id && x.id.startsWith(key));
  return hits.length === 1 ? hits[0] : undefined;
};
const matchName = (options, value) => (options || []).find((o) => o.toLowerCase() === String(value || '').trim().toLowerCase());

class ToolError extends Error {}
const fail = (msg) => { throw new ToolError(msg); };

function execute(name, input) {
  const data = getState().data;
  const today = todayISO();
  switch (name) {
    case 'add_task': {
      const title = text(input.title, 200) || fail('title is required');
      const due = input.due ? (isDate(input.due) ? input.due : fail('due must be a date as YYYY-MM-DD')) : '';
      const area = input.area ? matchName(data.settings.taskAreas, input.area) || '' : '';
      const starred = input.starred === true;
      const id = actions.add('tasks', { title, area, due, starred, done: false, doneAt: null, notes: text(input.notes, 2000) });
      return {
        result: { ok: true, task_id: id, title, area: area || null, due: due || null, starred, ...(input.area && !area ? { note: `"${input.area}" is not one of the task areas, so the task has no area` } : {}) },
        action: { label: 'Task added', detail: title + (due ? `, ${fmtDate(due)}` : ''), undo: { kind: 'remove', col: 'tasks', id } },
      };
    }
    case 'update_task': {
      const t = findIn(data.tasks, String(pick(input, 'task_id', 'taskId', 'id') || '')) || fail('no task with this id; use an id from the snapshot');
      const patch = {};
      if (input.title !== undefined) patch.title = text(input.title, 200) || fail('title cannot be empty');
      if (input.due !== undefined) patch.due = input.due === '' || input.due === null ? '' : isDate(input.due) ? input.due : fail('due must be YYYY-MM-DD or an empty string');
      if (input.starred !== undefined) patch.starred = input.starred === true;
      if (input.area !== undefined) patch.area = matchName(data.settings.taskAreas, input.area) || fail(`area must be one of: ${(data.settings.taskAreas || []).join(', ')}`);
      if (input.notes !== undefined) patch.notes = text(input.notes, 2000);
      if (!Object.keys(patch).length) fail('nothing to change');
      const before = {};
      for (const k of Object.keys(patch)) before[k] = t[k] ?? (k === 'starred' ? false : '');
      actions.update('tasks', t.id, patch);
      const what = [patch.due !== undefined && (patch.due ? `due ${fmtDate(patch.due)}` : 'no date'), patch.starred !== undefined && (patch.starred ? 'starred' : 'unstarred'), patch.area && patch.area, patch.title && 'renamed', patch.notes !== undefined && 'notes'].filter(Boolean).join(', ');
      return {
        result: { ok: true, task_id: t.id, changed: patch },
        action: { label: 'Task updated', detail: `${patch.title || t.title}${what ? `, ${what}` : ''}`, undo: { kind: 'update', col: 'tasks', id: t.id, patch: before } },
      };
    }
    case 'complete_task': {
      const t = findIn(data.tasks, String(pick(input, 'task_id', 'taskId', 'id') || '')) || fail('no task with this id; use an id from the snapshot');
      const done = input.done !== false;
      actions.update('tasks', t.id, { done, doneAt: done ? Date.now() : null });
      return {
        result: { ok: true, task_id: t.id, title: t.title, done },
        action: { label: done ? 'Task done' : 'Task reopened', detail: t.title, xp: done ? (t.starred ? 20 : 10) : 0, undo: { kind: 'update', col: 'tasks', id: t.id, patch: { done: !!t.done, doneAt: t.doneAt || null } } },
      };
    }
    case 'check_habit': {
      const key = String(pick(input, 'habit_id', 'habitId', 'id') || '');
      const h = findIn(data.habits, key) || data.habits.find((x) => x.name.toLowerCase() === key.toLowerCase()) || fail('no habit with this id; use an id from the snapshot');
      const date = input.date ? (isDate(input.date) ? input.date : fail('date must be YYYY-MM-DD')) : today;
      if (date > today) fail('cannot tick a habit for a future day');
      const done = input.done !== false;
      const was = (h.days || []).includes(date);
      if (was !== done) actions.toggleHabitDay(h, date);
      return {
        result: { ok: true, habit: h.name, date, done, changed: was !== done },
        action: { label: done ? 'Habit ticked' : 'Habit unticked', detail: `${h.name}${date === today ? '' : `, ${fmtDate(date)}`}`, xp: done && !was ? 10 : 0, undo: was !== done ? { kind: 'habit', id: h.id, date } : null },
      };
    }
    case 'log_sport': {
      const raw = text(input.type, 60) || fail('type is required');
      const type = matchName(data.settings.sportTypes, raw) || raw;
      const minutes = Math.round(Number(input.minutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 720) fail('minutes must be a whole number between 1 and 720');
      const date = input.date ? (isDate(input.date) ? input.date : fail('date must be YYYY-MM-DD')) : today;
      if (date > today) fail('cannot log a session in the future');
      const id = actions.add('sessions', { type, minutes, date, note: text(input.note, 300), conditions: '' });
      return {
        result: { ok: true, session_id: id, type, minutes, date },
        action: { label: `${type} logged`, detail: `${minutes} min${date === today ? '' : `, ${fmtDate(date)}`}`, xp: sportXP(minutes), undo: { kind: 'remove', col: 'sessions', id } },
      };
    }
    case 'add_deadline': {
      const title = text(input.title, 200) || fail('title is required');
      const date = isDate(input.date) ? input.date : fail('date must be YYYY-MM-DD');
      const kind = ['proposal', 'conference', 'admin', 'other'].includes(input.kind) ? input.kind : 'other';
      const id = actions.add('deadlines', { title, date, kind, facility: text(input.facility, 80), url: '', notes: '', done: false });
      return {
        result: { ok: true, deadline_id: id, title, date, kind },
        action: { label: 'Deadline added', detail: `${title}, ${fmtDate(date)}`, undo: { kind: 'remove', col: 'deadlines', id } },
      };
    }
    case 'remember': {
      const fact = text(pick(input, 'fact', 'text', 'memory'), 400) || fail('fact is required');
      const id = actions.add('memories', { text: fact, at: Date.now() });
      return { result: { ok: true, remembered: fact }, action: { label: 'Remembered', detail: fact, undo: { kind: 'remove', col: 'memories', id } } };
    }
    default:
      return fail(`unknown tool ${name}`);
  }
}

function runTool(conv, block) {
  const name = String(block.name || '').toLowerCase();
  const input = block.input;
  let out;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    out = { error: JSON.stringify({ INVALID_JSON: JSON.stringify(input ?? null) }) };
  } else {
    try {
      out = execute(name, input);
    } catch (err) {
      if (!(err instanceof ToolError)) console.error(err);
      out = { error: err instanceof ToolError ? err.message : 'the app could not apply this change' };
    }
  }
  if (out.error) {
    conv.actions[block.id] = { label: 'Could not apply', detail: out.error, failed: true };
    return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: out.error };
  }
  conv.actions[block.id] = out.action;
  return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out.result) };
}

export function undoAction(toolUseId) {
  const conv = jstate.conv;
  const a = conv && conv.actions[toolUseId];
  if (!a || a.undone || !a.undo) return;
  const u = a.undo;
  if (u.kind === 'remove') actions.remove(u.col, u.id);
  else if (u.kind === 'update') actions.update(u.col, u.id, u.patch);
  else if (u.kind === 'habit') {
    const h = getState().data.habits.find((x) => x.id === u.id);
    if (h) actions.toggleHabitDay(h, u.date);
  }
  a.undone = true;
  conv.notes = [...(conv.notes || []), `${a.label}: ${a.detail}`];
  saveConv();
  emit();
}

// ---------------------------------------------------------------------------
// The conversation loop.

// After a mid-answer fallback, reasoning and tool calls from before the switch are not sent back.
export function afterFallback(content) {
  const types = (content || []).map((b) => b.type);
  const last = types.lastIndexOf('fallback');
  if (last < 0) return content || [];
  return content.filter((b, i) => i > last || b.type === 'text');
}

function pushTurn(conv, m, extra = {}) {
  conv.turns.push({ m, at: Date.now(), ...extra });
  saveConv();
  emit();
}

async function runLoop(conv) {
  const c = await getClient();
  const effort = (getState().data.settings.jarvis || {}).depth || 'low';
  let badJson = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const controller = new AbortController();
    jstate.controller = controller;
    const stream = c.beta.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: BETAS,
      fallbacks: 'default',
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort },
      cache_control: { type: 'ephemeral' },
      system: conv.system,
      tools: TOOLS,
      messages: conv.turns.map((t) => t.m),
    }, { signal: controller.signal });
    stream.on('streamEvent', (event, snapshot) => { jstate.live = snapshot; emitSoon(); });

    let message;
    try {
      message = await stream.finalMessage();
      badJson = 0;
    } catch (err) {
      jstate.live = null;
      // Only a tool input that could not be parsed is retried; API errors go to the user.
      if ((sdk && err instanceof sdk.APIError) || controller.signal.aborted || badJson++ >= 2) throw err;
      continue;
    }
    jstate.live = null;

    if (message.stop_reason === 'refusal') return { refused: true };
    const content = afterFallback(message.content).filter((b) => b.type !== 'fallback');
    const uses = content.filter((b) => b.type === 'tool_use');
    if (message.stop_reason === 'max_tokens' && uses.length) {
      // A tool input cut off at the limit can still parse: keep the text, never run it.
      pushTurn(conv, { role: 'assistant', content: content.filter((b) => b.type !== 'tool_use') });
      return { cut: true };
    }
    pushTurn(conv, { role: 'assistant', content });
    if (message.stop_reason === 'pause_turn') continue;
    if (message.stop_reason !== 'tool_use' || !uses.length) return { done: true, cut: message.stop_reason === 'max_tokens' };
    pushTurn(conv, { role: 'user', content: uses.map((b) => runTool(conv, b)) });
  }
  return { done: true };
}

export function assistantText(content) {
  return afterFallback(content).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
}

// Text of the replies after the most recent turn of the given kind (or after the last user message).
export function replyAfter(conv, kind) {
  if (!conv) return '';
  let start = -1;
  for (let i = conv.turns.length - 1; i >= 0; i--) {
    const t = conv.turns[i];
    if (kind ? t.kind === kind : (t.m.role === 'user' && typeof t.m.content === 'string')) { start = i; break; }
  }
  if (start < 0) return '';
  const parts = [];
  for (let i = start + 1; i < conv.turns.length; i++) {
    const t = conv.turns[i];
    if (t.m.role === 'user' && typeof t.m.content === 'string') break;
    if (t.m.role === 'assistant') parts.push(assistantText(t.m.content));
  }
  return parts.filter(Boolean).join('\n\n');
}

async function run(conv) {
  const out = await runLoop(conv);
  if (out.refused) {
    // Drop the declined message (and its context note) so the next one starts clean. Nothing was
    // produced after it. A refusal after a tool round leaves the history as it is.
    let i = conv.turns.length - 1;
    if (i >= 0 && conv.turns[i].m.role === 'system') i--;
    if (i >= 0 && conv.turns[i].m.role === 'user' && typeof conv.turns[i].m.content === 'string') conv.turns.splice(i);
    saveConv();
    jstate.error = { message: 'Jarvis declined that request. Try rephrasing it.', refusal: true };
    return;
  }
  if (out.cut) jstate.error = { message: 'The answer hit its length limit and was cut short.', soft: true };
  if (voiceOn()) speak(replyAfter(conv));
}

function lastTurnIsUnanswered(conv) {
  const t = conv && conv.turns[conv.turns.length - 1];
  return !!t && t.m.role !== 'assistant';
}

export async function send(message, { hidden = false, kind } = {}) {
  const body = (message || '').trim();
  if (!body || jstate.busy) return false;
  jstate.busy = true;
  jstate.error = null;
  emit();
  try {
    const state = getState();
    let conv = jstate.conv && jstate.conv.day === convDay() ? jstate.conv : null;
    if (!conv) {
      conv = await startConversation(state);
      jstate.conv = conv;
    } else {
      // A context note left unanswered by an error would sit before the new message: drop it.
      while (conv.turns.length && conv.turns[conv.turns.length - 1].m.role === 'system') conv.turns.pop();
    }
    const fresh = conv.turns.length === 0;
    pushTurn(conv, { role: 'user', content: body }, { hidden, kind });
    if (!fresh) await addContext(conv, state);
    await run(conv);
    return true;
  } catch (err) {
    if (!(sdk && err instanceof sdk.APIUserAbortError)) {
      console.error(err);
      jstate.error = { message: describeError(err), retry: lastTurnIsUnanswered(jstate.conv) };
    }
    return false;
  } finally {
    jstate.busy = false;
    jstate.controller = null;
    jstate.live = null;
    saveConv();
    emit();
  }
}

// Re-run the last unanswered message after an error.
export async function retry() {
  const conv = jstate.conv;
  if (!conv || jstate.busy || !lastTurnIsUnanswered(conv)) return;
  jstate.busy = true;
  jstate.error = null;
  emit();
  try {
    await run(conv);
  } catch (err) {
    if (!(sdk && err instanceof sdk.APIUserAbortError)) jstate.error = { message: describeError(err), retry: lastTurnIsUnanswered(conv) };
  } finally {
    jstate.busy = false;
    jstate.controller = null;
    jstate.live = null;
    saveConv();
    emit();
  }
}

export function stop() {
  if (jstate.controller) jstate.controller.abort();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function newConversation() {
  stop();
  jstate.conv = null;
  jstate.error = null;
  jstate.live = null;
  saveConv();
  emit();
}

export function todaysConversation() {
  const c = jstate.conv;
  return c && c.day === convDay() ? c : null;
}

// ---------------------------------------------------------------------------
// The daily briefing on Today. Saved to meta/briefing so your other devices show it too.

let briefingTried = '';
export function briefingText(state) {
  const conv = todaysConversation();
  const local = replyAfter(conv, 'briefing');
  if (local) return { text: local, at: conv.turns.find((t) => t.kind === 'briefing')?.at };
  const remote = state.data.briefing;
  if (remote && remote.day === convDay() && remote.text) return { text: remote.text, at: remote.at, remote: true };
  return null;
}

export async function briefing(state, { force = false } = {}) {
  if (!hasApiKey() || jstate.busy) return;
  const today = convDay();
  if (!force) {
    if (briefingTried === today || todaysConversation()) return;
    briefingTried = today;
    const remote = state.data.briefing;
    if (remote && remote.day === today && remote.text) {
      // Another device already wrote today's briefing: start the conversation from it.
      const conv = await startConversation(state);
      conv.turns.push({ m: { role: 'user', content: BRIEFING_PROMPT }, hidden: true, kind: 'briefing', at: remote.at });
      conv.turns.push({ m: { role: 'assistant', content: [{ type: 'text', text: remote.text }] }, at: remote.at });
      if (!todaysConversation()) { jstate.conv = conv; saveConv(); emit(); }
      return;
    }
  }
  const ok = await send(BRIEFING_PROMPT, { hidden: true, kind: 'briefing' });
  const text = ok && replyAfter(todaysConversation(), 'briefing');
  if (text) actions.saveMeta('briefing', { day: today, text, at: Date.now() });
}

// ---------------------------------------------------------------------------
// Voice: replies read aloud with the browser's own speech, a British voice when there is one.

export function speak(textToSay) {
  if (!('speechSynthesis' in window) || !textToSay) return;
  const plain = textToSay.replace(/\*\*|__|`/g, '').replace(/^\s*[-•]\s+/gm, '');
  const french = /[àâçéèêëîïôûùœ]/i.test(plain) || /\b(je|tu|vous|est|pas|les|des|une|avec|pour)\b/i.test(plain);
  const voices = speechSynthesis.getVoices();
  const voice = french
    ? voices.find((v) => /^fr/i.test(v.lang))
    : voices.find((v) => /en-GB/i.test(v.lang) && /daniel|arthur|george|ryan|thomas|oliver|male/i.test(v.name))
      || voices.find((v) => /en-GB/i.test(v.lang))
      || voices.find((v) => /^en/i.test(v.lang));
  const u = new SpeechSynthesisUtterance(plain);
  if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = french ? 'fr-FR' : 'en-GB';
  u.rate = 1.04;
  u.pitch = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
