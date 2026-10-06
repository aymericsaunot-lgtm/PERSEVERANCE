// Firebase backend: email and password sign-in, Firestore with offline persistence.
// Data lives under users/{uid}/... so the security rules can lock it to one account.
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs,
  writeBatch, arrayUnion, arrayRemove,
} from '../vendor/firebase.js';
import { COLLECTIONS, setDocs, setSettingsDoc, setArxivStatus, setMetaDocs, setStatus, resetData, clean } from './store.js';
import { isoOf, DAY } from './lib/dates.js';

export function createFirebaseBackend(config, { onError }) {
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }

  let uid = null;
  let unsubs = [];
  const meta = new Map();
  const report = (err) => {
    console.error(err);
    if (onError) onError(err);
  };

  const updateSync = () => {
    let pending = false;
    let cache = false;
    for (const m of meta.values()) {
      pending = pending || m.pending;
      cache = cache || m.cache;
    }
    setStatus({ sync: !navigator.onLine ? 'offline' : pending ? 'syncing' : cache ? 'connecting' : 'synced' });
  };
  window.addEventListener('online', updateSync);
  window.addEventListener('offline', updateSync);

  const userCol = (name) => collection(db, 'users', uid, name);
  const userDoc = (name, id) => doc(db, 'users', uid, name, id);

  function listen(key, q, apply) {
    unsubs.push(onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      meta.set(key, { pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache });
      apply(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      updateSync();
    }, report));
  }

  function stop() {
    unsubs.forEach((u) => u());
    unsubs = [];
    meta.clear();
  }

  function start(userId) {
    stop();
    uid = userId;
    // Only recent history is synced live; everything stays in Firestore and in exports.
    const doneCutoff = Date.now() - 30 * DAY;
    const sessionCutoff = isoOf(new Date(Date.now() - 365 * DAY));
    let open = [];
    let done = [];
    const pushTasks = () => setDocs('tasks', [...open, ...done.filter((d) => !open.some((o) => o.id === d.id))]);
    listen('tasks-open', query(userCol('tasks'), where('done', '==', false)), (docs) => { open = docs; pushTasks(); });
    listen('tasks-done', query(userCol('tasks'), where('doneAt', '>=', doneCutoff)), (docs) => { done = docs; pushTasks(); });
    listen('sessions', query(userCol('sessions'), where('date', '>=', sessionCutoff)), (docs) => setDocs('sessions', docs));
    for (const name of ['papers', 'arxiv', 'beamtimes', 'deadlines', 'chapters', 'habits', 'memories']) {
      listen(name, userCol(name), (docs) => setDocs(name, docs));
    }
    listen('meta', userCol('meta'), (docs) => {
      setMetaDocs({ progress: docs.find((d) => d.id === 'progress'), briefing: docs.find((d) => d.id === 'briefing') });
      setArxivStatus(docs.find((d) => d.id === 'arxiv') || null);
      setSettingsDoc(docs.find((d) => d.id === 'settings'));
    });
  }

  return {
    mode: 'firebase',
    onAuth: (cb) => onAuthStateChanged(auth, cb),
    signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    async signOut() {
      stop();
      resetData();
      await signOut(auth);
    },
    start,
    stop,
    set(col, id, data) { setDoc(userDoc(col, id), data).catch(report); },
    update(col, id, patch) { updateDoc(userDoc(col, id), patch).catch(report); },
    remove(col, id) { deleteDoc(userDoc(col, id)).catch(report); },
    toggleInArray(col, id, field, value, on) {
      updateDoc(userDoc(col, id), { [field]: on ? arrayUnion(value) : arrayRemove(value) }).catch(report);
    },
    saveSettings(patch) { setDoc(userDoc('meta', 'settings'), patch, { merge: true }).catch(report); },
    saveMeta(id, patch) { setDoc(userDoc('meta', id), patch, { merge: true }).catch(report); },
    async exportAll() {
      const out = { format: 'dashboard-backup', version: 1, exportedAt: new Date().toISOString(), collections: {} };
      for (const name of [...COLLECTIONS, 'meta']) {
        const snap = await getDocs(userCol(name));
        out.collections[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      return out;
    },
    async importAll(json) {
      const cols = json && json.collections;
      if (!cols || typeof cols !== 'object') throw new Error('This file is not a dashboard backup.');
      let count = 0;
      let batch = writeBatch(db);
      let inBatch = 0;
      for (const [name, docs] of Object.entries(cols)) {
        if (![...COLLECTIONS, 'meta'].includes(name) || !Array.isArray(docs)) continue;
        for (const d of docs) {
          if (!d || !d.id) continue;
          batch.set(userDoc(name, String(d.id)), clean(d));
          count++;
          if (++inBatch >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            inBatch = 0;
          }
        }
      }
      if (inBatch) await batch.commit();
      return count;
    },
  };
}

export function describeError(err) {
  const code = (err && err.code) || '';
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with this email. Create it in the Firebase console first.',
    'auth/invalid-email': 'This email address looks incomplete.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or reset your password.',
    'auth/network-request-failed': 'No connection to Firebase. Check your internet and try again.',
    'auth/operation-not-allowed': 'Email and password sign-in is off. Turn it on in Firebase, Authentication, Sign-in method.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The API key in config.js is not valid. Copy it again from Firebase project settings.',
    'auth/invalid-api-key': 'The API key in config.js is not valid. Copy it again from Firebase project settings.',
    'auth/user-disabled': 'This account is disabled in Firebase.',
    'permission-denied': 'The database refused access. Check that your user ID is in the Firestore rules.',
    'resource-exhausted': 'Today’s free Firestore quota is used up. Sync resumes tomorrow; your changes stay on this device.',
    'unavailable': 'The database is unreachable. Changes are kept on this device and sync later.',
    'failed-precondition': 'The database is not ready for this query yet. Reload the page in a minute.',
  };
  return map[code] || (err && err.message) || 'Something went wrong.';
}
