// Entry point: Firebase sign-in, then the app shell. There is no way in without your password.
import { html, render, useState, useEffect } from '../vendor/preact.js';
import { config } from '../config.js';
import { attachBackend, getBackend, setStatus, useStore, getState, dataReady, actions } from './store.js';
import { Icon, Mark, Toasts, toast } from './ui.js';
import { TodayView } from './views/today.js';
import { TasksView, todayTasks } from './views/tasks.js';
import { PapersView } from './views/papers.js';
import { PhdView } from './views/phd.js';
import { LifeView } from './views/life.js';
import { SettingsView, applyTheme, getTheme } from './views/settings.js';
import { LoginView, SetupView } from './views/login.js';
import { ProgressView, SideLevel, LevelUp } from './views/progress.js';
import { progressOf, archivePatch } from './lib/xp.js';
import { todayISO } from './lib/dates.js';

applyTheme(getTheme());

const NAV = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'papers', label: 'Papers', icon: 'papers' },
  { id: 'phd', label: 'PhD', icon: 'phd' },
  { id: 'life', label: 'Life', icon: 'life' },
];

function currentRoute() {
  return location.hash.replace(/^#\/?/, '') || 'today';
}

// The route lives in memory and is mirrored to the URL hash when the browser allows it.
let route = currentRoute();
const routeSubs = new Set();
const go = (r) => {
  if (r === route) return;
  route = r;
  try {
    if (location.hash !== '#/' + r) location.hash = '#/' + r;
  } catch (e) { /* hash not writable here; the in-memory route still works */ }
  routeSubs.forEach((f) => f());
  window.scrollTo(0, 0);
};

function useRoute() {
  const [current, setCurrent] = useState(route);
  useEffect(() => {
    const sync = () => setCurrent(route);
    const onHash = () => {
      const next = currentRoute();
      if (next === route) return;
      route = next;
      sync();
      window.scrollTo(0, 0);
    };
    routeSubs.add(sync);
    window.addEventListener('hashchange', onHash);
    return () => {
      routeSubs.delete(sync);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
  return current;
}

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  setStatus({ canInstall: true });
});

function SyncBadge({ status }) {
  const label = { synced: 'Synced', syncing: 'Saving', offline: 'Offline', connecting: 'Connecting' }[status.sync] || 'Synced';
  return html`<span class=${'sync sync--' + status.sync} title="Sync status"><span class="sync__dot"></span>${label}</span>`;
}

// Level-ups seen on this device, and freezing finished days into meta/progress.
function useProgressKeeping(state, p) {
  const [levelUp, setLevelUp] = useState(0);
  const ready = dataReady(state) && state.status.sync === 'synced';
  const today = todayISO();
  useEffect(() => {
    if (!ready) return;
    const key = 'dash.level.best';
    let best = 0;
    try { best = Number(localStorage.getItem(key)) || 0; } catch (e) { /* storage unavailable */ }
    if (p.level <= best) return;
    if (best) setLevelUp(p.level);
    try { localStorage.setItem(key, String(p.level)); } catch (e) { /* storage unavailable */ }
  }, [ready, p.level]);
  useEffect(() => {
    if (!ready) return;
    const patch = archivePatch(state.data, today);
    if (patch) actions.saveMeta('progress', patch);
  }, [ready, state.data.progress, today]);
  return [levelUp, () => setLevelUp(0)];
}

function Shell({ state, onSignOut }) {
  const route = useRoute();
  const [main, sub] = route.split('/');
  const p = progressOf(state.data);
  const [levelUp, closeLevelUp] = useProgressKeeping(state, p);
  const counts = {
    tasks: todayTasks(state.data.tasks).length,
    papers: state.data.arxiv.filter((x) => x.status === 'new').length,
  };
  const install = state.status.canInstall && installEvent
    ? async () => { installEvent.prompt(); await installEvent.userChoice; installEvent = null; setStatus({ canInstall: false }); }
    : null;

  let view;
  if (main === 'tasks') view = html`<${TasksView} state=${state} go=${go} />`;
  else if (main === 'papers') view = html`<${PapersView} state=${state} sub=${sub} go=${go} />`;
  else if (main === 'phd') view = html`<${PhdView} state=${state} go=${go} />`;
  else if (main === 'life') view = html`<${LifeView} state=${state} go=${go} />`;
  else if (main === 'progress') view = html`<${ProgressView} state=${state} p=${p} go=${go} />`;
  else if (main === 'settings') view = html`<${SettingsView} state=${state} sub=${sub} go=${go} install=${install} onSignOut=${onSignOut} />`;
  else view = html`<${TodayView} state=${state} p=${p} go=${go} />`;
  const active = NAV.some((n) => n.id === main) || ['settings', 'progress'].includes(main) ? main : 'today';

  return html`<div class="shell">
    <nav class="sidebar" aria-label="Sections">
      <div class="sidebar__brand"><${Mark} size=${30} />${config.appName || 'Dashboard'}</div>
      ${NAV.map((n) => html`<button key=${n.id} class="sidebar__item" aria-current=${active === n.id ? 'page' : undefined} onClick=${() => go(n.id)}>
        <${Icon} name=${n.icon} size="sm" />${n.label}
        ${counts[n.id] > 0 && html`<span class="sidebar__count">${counts[n.id]}</span>`}
      </button>`)}
      <div class="sidebar__foot">
        <${SideLevel} p=${p} go=${go} active=${active === 'progress'} />
        <div><${SyncBadge} status=${state.status} /></div>
        <button class="sidebar__item" aria-current=${active === 'settings' ? 'page' : undefined} onClick=${() => go('settings')}><${Icon} name="settings" size="sm" />Settings</button>
      </div>
    </nav>
    <main class="main" id="main">
      <div class="topbar topbar--mobile-only">
        <div class="topbar__tools">
          <${SyncBadge} status=${state.status} />
          <button class="icon-btn" aria-label="Settings" onClick=${() => go('settings')}><${Icon} name="settings" /></button>
        </div>
      </div>
      ${view}
    </main>
    <nav class="tabbar" aria-label="Sections">
      ${NAV.map((n) => html`<button key=${n.id} class="tabbar__item" aria-current=${active === n.id ? 'page' : undefined} onClick=${() => go(n.id)}>
        <span class="tabbar__icon"><${Icon} name=${n.icon} />${counts[n.id] > 0 && n.id !== 'tasks' && html`<span class="tabbar__badge">${counts[n.id]}</span>`}</span>
        ${n.label}
      </button>`)}
    </nav>
    ${levelUp > 0 && html`<${LevelUp} level=${levelUp} onClose=${closeLevelUp} />`}
  </div>`;
}

let describeErrorFn = (e) => (e && e.message) || 'Something went wrong.';

async function startFirebase() {
  setStatus({ phase: 'loading' });
  const mod = await import('./backend-firebase.js');
  describeErrorFn = mod.describeError;
  const backend = mod.createFirebaseBackend(config.firebase, { onError: (e) => toast(mod.describeError(e)) });
  attachBackend(backend);
  setStatus({ mode: 'firebase' });
  backend.onAuth((user) => {
    if (user) {
      setStatus({ user: { uid: user.uid, email: user.email }, phase: 'ready' });
      backend.start(user.uid);
    } else {
      setStatus({ user: null, phase: 'login' });
    }
  });
}

function boot() {
  if (!config.firebase || !config.firebase.apiKey) return setStatus({ phase: 'setup' });
  startFirebase().catch((e) => {
    console.error(e);
    setStatus({ phase: 'error', error: e.message });
  });
}

function App() {
  const state = useStore();
  const phase = state.status.phase;
  const onSignOut = async () => {
    await getBackend().signOut();
    go('today');
  };
  let body;
  if (phase === 'ready') body = html`<${Shell} state=${state} onSignOut=${onSignOut} />`;
  else if (phase === 'login') body = html`<${LoginView} backend=${getBackend()} describeError=${describeErrorFn} />`;
  else if (phase === 'setup') body = html`<${SetupView} />`;
  else if (phase === 'error') body = html`<div class="splash"><p>Could not start: ${state.status.error}</p></div>`;
  else body = html`<div class="splash" aria-busy="true"><${Mark} size=${40} /></div>`;
  return html`${body}<${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('app'));
boot();

// Offline support and updates.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    toast('A new version is ready', { action: 'Reload', onAction: () => location.reload(), ms: 15000 });
  });
}

export { getState };
