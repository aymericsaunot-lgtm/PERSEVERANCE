// App state. The Firebase backend pushes documents in; views read and call actions.
import { useEffect, useState, useRef } from '../vendor/preact.js';
import { uid } from './lib/text.js';

// The last four belong to the Studio space; a Research account simply has none.
export const COLLECTIONS = ['tasks', 'papers', 'arxiv', 'beamtimes', 'deadlines', 'chapters', 'sessions', 'habits', 'projects', 'clients', 'invoices', 'timelogs'];

export const DEFAULT_SETTINGS = {
  taskAreas: ['PhD', 'EigenMode', 'Freelance', 'Games', 'Life'],
  tags: ['SnSe2', 'ReO3', 'BiTeX', 'TMDs', 'MnBi2Te4', 'MnBr2'],
  arxivKeywords: ['MnBi2Te4', 'Rashba crystal', 'moiré'],
  arxivCategories: ['cond-mat'],
  sportTypes: ['Surf', 'Table tennis', 'Run', 'Gym'],
  facilities: ['BESSY II', 'MAX IV', 'Diamond', 'Elettra', 'SOLEIL', 'ALBA', 'SLS', 'PETRA III', 'ESRF'],
  surf: { name: 'Hendaye', lat: 43.375, lon: -1.772, facing: 340 },
  thesis: { title: 'PhD thesis', target: '' },
  xpGoal: 100,
  // Studio. `edition` itself has no default: an account without one is decided on first sign-in.
  currency: 'EUR',
  paymentDays: 30,
  projectTypes: ['Branding', 'Logo', 'UI/UX', 'Web', 'Social media', 'Print', 'Packaging', 'Illustration'],
};

const state = {
  data: {
    tasks: [], papers: [], arxiv: [], beamtimes: [], deadlines: [], chapters: [], sessions: [], habits: [],
    projects: [], clients: [], invoices: [], timelogs: [],
    settings: DEFAULT_SETTINGS,
    arxivStatus: null,
    progress: null,
  },
  loaded: new Set(),
  status: { mode: null, sync: 'synced', error: null, user: null },
};

let backend = null;
const subs = new Set();
let queued = false;
let version = 0;

function notify() {
  version++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    subs.forEach((f) => f());
  });
}

export function getState() { return state; }

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function useStore() {
  const [, force] = useState(0);
  const seen = useRef(version);
  seen.current = version;
  useEffect(() => {
    const unsub = subscribe(() => force((x) => x + 1));
    // Changes that landed between render and subscription would otherwise be missed.
    if (seen.current !== version) force((x) => x + 1);
    return unsub;
  }, []);
  return state;
}

export function attachBackend(b) { backend = b; }
export function getBackend() { return backend; }

export function setDocs(name, docs) {
  state.data = { ...state.data, [name]: docs };
  state.loaded.add(name);
  notify();
}

export function setSettingsDoc(doc) {
  const d = doc || {};
  state.data = {
    ...state.data,
    settings: {
      ...DEFAULT_SETTINGS,
      ...d,
      surf: { ...DEFAULT_SETTINGS.surf, ...(d.surf || {}) },
      thesis: { ...DEFAULT_SETTINGS.thesis, ...(d.thesis || {}) },
    },
  };
  state.loaded.add('settings');
  notify();
}

export function setArxivStatus(doc) {
  state.data = { ...state.data, arxivStatus: doc || null };
  notify();
}

// meta/progress: XP of finished days, frozen (see lib/xp.js).
export function setMetaDocs({ progress }) {
  state.data = { ...state.data, progress: progress || null };
  notify();
}

// True once every collection has arrived, so derived numbers (XP, levels) are complete.
export function dataReady(s = state) {
  return s.loaded.has('settings') && COLLECTIONS.every((c) => s.loaded.has(c));
}

export function setStatus(patch) {
  state.status = { ...state.status, ...patch };
  notify();
}

export function resetData() {
  state.data = { ...state.data, tasks: [], papers: [], arxiv: [], beamtimes: [], deadlines: [], chapters: [], sessions: [], habits: [], projects: [], clients: [], invoices: [], timelogs: [], settings: DEFAULT_SETTINGS, arxivStatus: null, progress: null };
  state.loaded = new Set();
  notify();
}

// Firestore rejects undefined values; strip them (null is kept).
export function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean);
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && k !== 'id') out[k] = clean(v);
    return out;
  }
  return obj;
}

export const actions = {
  add(col, obj) {
    const id = uid();
    backend.set(col, id, clean({ ...obj, createdAt: obj.createdAt ?? Date.now() }));
    return id;
  },
  put(col, id, obj) {
    backend.set(col, id, clean(obj));
  },
  update(col, id, patch) {
    backend.update(col, id, clean({ ...patch, updatedAt: Date.now() }));
  },
  remove(col, id) {
    backend.remove(col, id);
  },
  saveSettings(patch) {
    backend.saveSettings(clean(patch));
  },
  // Merge into meta/{id}, e.g. 'progress'.
  saveMeta(id, patch) {
    backend.saveMeta(id, clean(patch));
  },
  toggleHabitDay(habit, date) {
    const on = !(habit.days || []).includes(date);
    backend.toggleInArray('habits', habit.id, 'days', date, on);
  },
  exportAll() {
    return backend.exportAll();
  },
  importAll(json) {
    return backend.importAll(json);
  },
};
