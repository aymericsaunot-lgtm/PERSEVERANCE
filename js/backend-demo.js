// In-memory backend used by the preview and by "Try the demo". Nothing is saved.
import { COLLECTIONS, setDocs, setSettingsDoc, setArxivStatus, setMetaDocs, resetData } from './store.js';
import { seedData } from './demo-data.js';

export function createDemoBackend() {
  const db = seedData();
  const emit = (col) => setDocs(col, [...db[col].values()]);
  const emitMeta = () => setMetaDocs({ progress: db.meta.progress, briefing: db.meta.briefing });
  const start = () => {
    COLLECTIONS.forEach(emit);
    emitMeta();
    setArxivStatus(db.arxivStatus);
    setSettingsDoc(db.settings);
  };
  return {
    mode: 'demo',
    start,
    stop() {},
    async signOut() { resetData(); },
    set(col, id, data) { db[col].set(id, { id, ...data }); emit(col); },
    update(col, id, patch) {
      const cur = db[col].get(id);
      if (!cur) return;
      db[col].set(id, { ...cur, ...patch });
      emit(col);
    },
    remove(col, id) { db[col].delete(id); emit(col); },
    toggleInArray(col, id, field, value, on) {
      const cur = db[col].get(id);
      if (!cur) return;
      const arr = new Set(cur[field] || []);
      if (on) arr.add(value); else arr.delete(value);
      db[col].set(id, { ...cur, [field]: [...arr] });
      emit(col);
    },
    saveSettings(patch) {
      db.settings = {
        ...db.settings,
        ...patch,
        surf: { ...(db.settings.surf || {}), ...(patch.surf || {}) },
        thesis: { ...(db.settings.thesis || {}), ...(patch.thesis || {}) },
        profile: { ...(db.settings.profile || {}), ...(patch.profile || {}) },
        jarvis: { ...(db.settings.jarvis || {}), ...(patch.jarvis || {}) },
      };
      setSettingsDoc(db.settings);
    },
    saveMeta(id, patch) {
      const cur = db.meta[id] || {};
      db.meta[id] = { ...cur, ...patch, ...(patch.days ? { days: { ...(cur.days || {}), ...patch.days } } : {}) };
      emitMeta();
    },
    async exportAll() {
      const collections = {};
      for (const c of COLLECTIONS) collections[c] = [...db[c].values()];
      collections.meta = [{ id: 'settings', ...db.settings }, ...Object.entries(db.meta).filter(([, v]) => v).map(([id, v]) => ({ id, ...v }))];
      return { format: 'dashboard-backup', version: 1, exportedAt: new Date().toISOString(), collections };
    },
    async importAll(json) {
      const cols = json && json.collections;
      if (!cols) throw new Error('This file is not a dashboard backup.');
      let n = 0;
      for (const c of COLLECTIONS) {
        for (const d of cols[c] || []) { if (d && d.id) { db[c].set(String(d.id), d); n++; } }
        emit(c);
      }
      const s = (cols.meta || []).find((d) => d.id === 'settings');
      if (s) { db.settings = s; setSettingsDoc(s); }
      return n;
    },
  };
}
