// Entry point: picks the backend, handles sign-in, renders the app shell.
import { html, render, useState, useEffect } from '../vendor/preact.js';
import { config } from '../config.js';
import { attachBackend, getBackend, setStatus, useStore, getState, dataReady, actions } from './store.js';
import { Icon, Mark, Orb, Toasts, toast } from './ui.js';
import { TodayView } from './views/today.js';
import { TasksView, todayTasks } from './views/tasks.js';
import { PapersView } from './views/papers.js';
import { PhdView } from './views/phd.js';
import { LifeView } from './views/life.js';
import { SettingsView, applyTheme, getTheme } from './views/settings.js';
import { LoginView, SetupView } from './views/login.js';
import { JarvisView } from './views/jarvis.js';
import { ProgressView, SideLevel, LevelUp } from './views/progress.js';
import { progressOf, archivePatch } from './lib/xp.js';
import { useJarvis } from './lib/jarvis.js';
import { todayISO } from './lib/dates.js';
import { createDemoBackend } from './backend-demo.js';

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
  if (status.mode === 'demo') return html`<span class="sync"><span class="sync__dot"></span>Demo</span>`;
  const label = { synced: 'Synced', syncing: 'Saving', offline: 'Offline', connecting: 'Connecting' }[status.sync] || 'Synced';
  return html`<span class=${'sync sync--' + status.sync} title="Sync status"><span class="sync__dot"></span>${label}</span>`;
}

// Phones: the sections in a floating glass dock, Jarvis as the orb beside it.
function Dock({ active, counts, jarvisLive }) {
  return html`<div class="dock-wrap">
    <nav class="dock" aria-label="Sections">
      ${NAV.map((n) => html`<button key=${n.id} class="dock__item" aria-current=${active === n.id ? 'page' : undefined} aria-label=${n.label} onClick=${() => go(n.id)}>
        <${Icon} name=${n.icon} /><span class="dock__label">${n.label}</span>
        ${counts[n.id] > 0 && n.id !== 'tasks' && html`<span class="dock__badge"></span>`}
      </button>`)}
    </nav>
    <button class="dock-orb" aria-label="Jarvis" aria-current=${active === 'jarvis' ? 'page' : undefined} onClick=${() => go('jarvis')}>
      <${Orb} size=${30} live=${jarvisLive} />
    </button>
  </div>`;
}

// Level-ups seen on this device, and freezing finished days into meta/progress.
function useProgressKeeping(state, p) {
  const [levelUp, setLevelUp] = useState(0);
  const ready = dataReady(state) && state.status.sync === 'synced';
  const today = todayISO();
  useEffect(() => {
    if (!ready) return;
    const key = `dash.level.best.${state.status.mode || 'app'}`;
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
  const j = useJarvis();
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
  else if (main === 'jarvis') view = html`<${JarvisView} state=${state} go=${go} />`;
  else if (main === 'progress') view = html`<${ProgressView} state=${state} p=${p} go=${go} />`;
  else if (main === 'settings') view = html`<${SettingsView} state=${state} sub=${sub} go=${go} install=${install} onSignOut=${onSignOut} />`;
  else view = html`<${TodayView} state=${state} go=${go} />`;
  const active = NAV.some((n) => n.id === main) || ['settings', 'jarvis', 'progress'].includes(main) ? main : 'today';
  const chat = main === 'jarvis';

  return html`<div class="shell">
    <nav class="sidebar" aria-label="Sections">
      <div class="sidebar__brand"><${Mark} size=${30} />${config.appName || 'Dashboard'}</div>
      ${NAV.map((n) => html`<button key=${n.id} class="sidebar__item" aria-current=${active === n.id ? 'page' : undefined} onClick=${() => go(n.id)}>
        <${Icon} name=${n.icon} />${n.label}
        ${counts[n.id] > 0 && html`<span class="sidebar__count num">${counts[n.id]}</span>`}
      </button>`)}
      <button class="side-jarvis aura" aria-current=${active === 'jarvis' ? 'page' : undefined} onClick=${() => go('jarvis')}>
        <${Orb} size=${30} live=${j.busy} />
        <div><div class="side-jarvis__name">Jarvis</div><div class="side-jarvis__sub">${j.busy ? 'Thinking' : 'Ask anything'}</div></div>
      </button>
      <div class="sidebar__foot">
        <${SideLevel} p=${p} go=${go} active=${active === 'progress'} />
        <div style="padding:0 4px 2px"><${SyncBadge} status=${state.status} /></div>
        <button class="sidebar__item" aria-current=${active === 'settings' ? 'page' : undefined} onClick=${() => go('settings')}><${Icon} name="settings" />Settings</button>
      </div>
    </nav>
    <main class=${'main' + (chat ? ' main--chat' : '')} id="main">
      ${state.status.mode === 'demo' && !chat && html`<div class="demo-banner">${window.__DASH_PREVIEW__
        ? 'Sample data. Paper lookup, live surf and downloads work in your own copy.'
        : 'Demo with sample data. Nothing is saved.'}</div>`}
      ${!chat && html`<div class="topbar topbar--mobile-only">
        <div class="topbar__tools">
          <${SyncBadge} status=${state.status} />
          <button class="icon-btn" aria-label="Settings" onClick=${() => go('settings')}><${Icon} name="settings" /></button>
        </div>
      </div>`}
      ${view}
    </main>
    ${!chat && html`<${Dock} active=${active} counts=${counts} jarvisLive=${j.busy} />`}
    ${levelUp > 0 && html`<${LevelUp} level=${levelUp} onClose=${closeLevelUp} />`}
  </div>`;
}

let describeErrorFn = (e) => (e && e.message) || 'Something went wrong.';

function startDemo() {
  const b = createDemoBackend();
  attachBackend(b);
  setStatus({ mode: 'demo', phase: 'ready', user: { email: 'demo' }, sync: 'synced' });
  b.start();
}

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
  const params = new URLSearchParams(location.search);
  if (window.__DASH_PREVIEW__ || params.has('demo')) return startDemo();
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
    const b = getBackend();
    if (state.status.mode === 'demo') {
      if (window.__DASH_PREVIEW__) { toast('This preview always runs the demo'); return; }
      location.href = location.pathname;
      return;
    }
    await b.signOut();
    go('today');
  };
  let body;
  if (phase === 'ready') body = html`<${Shell} state=${state} onSignOut=${onSignOut} />`;
  else if (phase === 'login') body = html`<${LoginView} backend=${getBackend()} describeError=${describeErrorFn} onDemo=${() => { location.href = location.pathname + '?demo'; }} />`;
  else if (phase === 'setup') body = html`<${SetupView} onDemo=${startDemo} />`;
  else if (phase === 'error') body = html`<div class="splash"><p>Could not start: ${state.status.error}</p></div>`;
  else body = html`<div class="splash" aria-busy="true"><${Mark} size=${44} /></div>`;
  return html`${body}<${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('app'));
boot();

// Offline support and updates. The preview build skips this.
if ('serviceWorker' in navigator && !window.__DASH_PREVIEW__ && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    toast('A new version is ready', { action: 'Reload', onAction: () => location.reload(), ms: 15000 });
  });
}

export { getState };
