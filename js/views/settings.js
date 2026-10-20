import { html, useState, useRef, useEffect } from '../../vendor/preact.js';
import { actions, getBackend } from '../store.js';
import { Icon, Mark, Section, Field, Segmented, TagEditor, PageHead, toast, downloadFile } from '../ui.js';
import { compass } from '../lib/surf.js';
import { todayISO, fmtDate, isoOf } from '../lib/dates.js';
import { APP_VERSION } from '../version.js';
import { APP_ICONS, defaultIcon } from '../icons.js';
import { pushSupported, isIOS, isStandalone, enablePush, disablePush, thisDeviceId, testHere } from '../push.js';

const NOTIFY_RESEARCH = [
  ['morning', 'Morning brief', 'Today’s tasks, the next deadline and the surf', 'morningAt'],
  ['deadlines', 'Deadlines and beamtimes', 'A week and a day before a deadline, three days before a beamtime'],
  ['arxiv', 'New arXiv matches', 'After the weekday check, when something matched'],
  ['surf', 'Surf alert', 'Around 19:00, when tomorrow looks good or great'],
  ['shared', 'Shared tasks', 'When a friend shares a new task with you'],
  ['evening', 'Habits in the evening', 'What is left to tick, only if something is', 'eveningAt'],
];
const NOTIFY_STUDIO = [
  ['morning', 'Morning brief', 'Today’s tasks, what is due, money to chase', 'morningAt'],
  ['projects', 'Project deadlines', 'The day before and the day a project is due'],
  ['invoices', 'Invoices and quotes', 'An invoice turns overdue; a quote waits a week without an answer'],
  ['fasting', 'Fasting', 'When your fasting hours are done'],
  ['shared', 'Shared tasks', 'When a friend shares a new task with you'],
  ['evening', 'Habits in the evening', 'What is left to tick, only if something is', 'eveningAt'],
];

function Switch({ on, onChange, label }) {
  return html`<button type="button" class="switch" role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${label} onClick=${() => onChange(!on)}><i></i></button>`;
}

function Notifications({ settings, devices }) {
  const n = settings.notify || {};
  const [here, setHere] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { thisDeviceId().then(setHere).catch(() => setHere('')); }, [devices.length]);
  const set = (patch) => actions.saveSettings({ notify: { ...n, ...patch } });
  const on = !!here && devices.some((d) => d.id === here);
  const iosNeedsHome = isIOS() && !isStandalone();
  const rows = settings.edition === 'studio' ? NOTIFY_STUDIO : NOTIFY_RESEARCH;
  const others = devices.filter((d) => d.id !== here);

  const enable = async () => {
    setBusy(true);
    try { setHere(await enablePush()); toast('Notifications on for this device'); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const disable = async () => {
    setBusy(true);
    try { await disablePush(); setHere(''); toast('Notifications off for this device'); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const test = async () => {
    try { await testHere(); set({ testAt: Date.now() }); toast('One test here now; one from the server within about 10 minutes.', { ms: 6000 }); } catch (e) { toast(e.message); }
  };

  return html`<div class="group">
    <div class="row">
      <div class="row__main">
        <div class="row__title">This device</div>
        <div class="row__sub">${!pushSupported() ? (iosNeedsHome ? 'Open the app from your Home Screen to turn them on' : 'This browser cannot show notifications') : on ? 'Notifications are on' : 'Notifications are off'}</div>
      </div>
      ${pushSupported() && (on
        ? html`<button class="btn btn--ghost btn--sm" disabled=${busy} onClick=${disable}>Turn off</button>`
        : html`<button class="btn btn--primary btn--sm" disabled=${busy || here === null} onClick=${enable}><${Icon} name="bell" size="xs" />Turn on</button>`)}
    </div>
    ${iosNeedsHome && html`<div class="notice" style="margin:0 16px 14px"><${Icon} name="info" size="sm" />
      <p>On iPhone, notifications only work in the app on your Home Screen. In Safari, tap Share, then Add to Home Screen. Open the app from there, come back to Settings and tap Turn on.</p></div>`}
    ${rows.map(([key, title, sub, timeKey]) => html`<div key=${key} class="row">
      <div class="row__main"><div class="row__title">${title}</div><div class="row__sub">${key === 'fasting' ? `When your ${Number(settings.fastHours) || 14} hours are done` : sub}</div></div>
      ${timeKey && n[key] !== false && html`<input class="input input--time" type="time" aria-label=${`${title} time`} value=${n[timeKey]} onChange=${(e) => e.currentTarget.value && set({ [timeKey]: e.currentTarget.value })} />`}
      <${Switch} on=${n[key] !== false} label=${title} onChange=${(v) => set({ [key]: v })} />
    </div>`)}
    ${others.length > 0 && html`<div class="row">
      <div class="row__main"><div class="row__title">Also on</div>
        ${others.map((d) => html`<div key=${d.id} class="row__sub" style="display:flex;align-items:center;gap:8px">${d.label || 'Device'}, added ${d.createdAt ? fmtDate(isoOf(new Date(d.createdAt))) : ''}
          <button class="link-btn" style="font-size:12.5px" onClick=${() => actions.remove('devices', d.id)}>Remove</button></div>`)}
      </div>
    </div>`}
    ${on && html`<div class="row"><div class="row__main row__sub" style="margin:0">Times follow ${n.tz || 'this device’s time zone'}. GitHub sends them every 10 minutes or so, so allow a few minutes either side.</div>
      <button class="btn btn--sm" onClick=${test}>Send a test</button></div>`}
  </div>`;
}

// Handles are lowercase: letters, digits, dots, dashes and underscores.
const normHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();
const validHandle = (h) => /^[a-z0-9_.-]{2,24}$/.test(h);

function Friends({ settings, profile }) {
  const friends = settings.friends || [];
  const mine = (profile && profile.handle) || '';
  const [handle, setHandle] = useState(mine);
  const [add, setAdd] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setHandle(mine), [mine]);

  const saveMine = async () => {
    const h = normHandle(handle);
    if (!validHandle(h)) return toast('Use 2 to 24 letters, digits, dots, dashes or underscores.');
    if (h === mine) return;
    setBusy(true);
    try { await actions.saveProfile(h); toast(`Friends can now add you as @${h}`); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const addFriend = async (e) => {
    e.preventDefault();
    const h = normHandle(add);
    if (!validHandle(h)) return;
    if (h === mine) return toast('That is you.');
    if (friends.some((f) => f.handle === h)) return toast(`@${h} is already a friend.`);
    setBusy(true);
    try {
      const [found] = await actions.findProfile(h);
      if (!found) toast(`Nobody is @${h} yet. They choose their name here, in Settings, Friends.`, { ms: 6000 });
      else {
        actions.saveSettings({ friends: [...friends, { uid: found.uid, handle: h }] });
        setAdd('');
        toast(`@${h} added. Type @${h} in a task to share it.`);
      }
    } catch (err) { toast(err.message); }
    setBusy(false);
  };

  return html`<div class="group group--pad">
    <${Field} label="Your name" hint="Friends add you with it, and see it on the tasks you share.">
      <div style="display:flex;gap:8px">
        <input class="input" value=${handle} placeholder="@yourname" autocapitalize="off" autocomplete="off" spellcheck=${false}
          onInput=${(e) => setHandle(e.currentTarget.value)} onKeyDown=${(e) => e.key === 'Enter' && saveMine()} />
        <button class="btn btn--primary btn--sm" disabled=${busy || normHandle(handle) === mine} onClick=${saveMine}>Save</button>
      </div>
    </${Field}>
    ${mine ? html`<form onSubmit=${addFriend} style="margin-top:16px">
      <${Field} label="Add a friend">
        <div style="display:flex;gap:8px">
          <input class="input" value=${add} placeholder="@friend" autocapitalize="off" autocomplete="off" spellcheck=${false} onInput=${(e) => setAdd(e.currentTarget.value)} />
          <button class="btn btn--sm" type="submit" disabled=${busy || !validHandle(normHandle(add))}>Add</button>
        </div>
      </${Field}>
    </form>` : html`<p class="field__hint" style="margin-top:12px">Choose your name first, then add friends by theirs.</p>`}
    ${friends.length > 0 && html`<div class="chips" style="margin-top:14px">
      ${friends.map((f) => html`<span key=${f.uid} class="chip chip--on">@${f.handle}
        <button type="button" class="link-btn" style="color:inherit;margin-left:4px" aria-label=${`Remove @${f.handle}`}
          onClick=${() => actions.saveSettings({ friends: friends.filter((x) => x.uid !== f.uid) })}><${Icon} name="x" size="xs" /></button></span>`)}
    </div>`}
    <p class="field__hint" style="margin-top:12px">Type @name in a new task, or tap their chip, to share it. You both see it, either of you can tick it off, and they get a notification. A friend needs an account in this app (README, step 10).</p>
  </div>`;
}

function AppIcon({ settings }) {
  const chosen = settings.appIcon || defaultIcon(settings.edition);
  return html`<div class="group group--pad">
    <div class="icon-grid">
      ${APP_ICONS.map((i) => html`<button key=${i.id} class="icon-choice" aria-pressed=${chosen === i.id ? 'true' : 'false'} onClick=${() => actions.saveSettings({ appIcon: i.id })}>
        <${Mark} icon=${i.id} size=${56} /><span>${i.label}</span>
      </button>`)}
    </div>
    <p class="field__hint" style="margin-top:12px">It changes at once in the app and the browser tab. A phone keeps the icon the app had when it was added: remove the app from the Home Screen, open the link in the browser, sign in, and add it again to get the new one.</p>
  </div>`;
}

const CATEGORY_SUGGESTIONS = ['cond-mat', 'cond-mat.str-el', 'cond-mat.mtrl-sci', 'cond-mat.mes-hall', 'cond-mat.supr-con', 'quant-ph', 'physics.app-ph', 'physics.optics'];

// Paper is the default; Night and Match system are a tap away in Settings.
// A new storage key, so the old automatic value does not carry over.
const THEME_KEY = 'dash.theme2';
export function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; }
}

const THEME_COLORS = { dark: '#171612', light: '#EEEAE0' };

export function applyTheme(theme) {
  const t = theme === 'dark' || theme === 'auto' ? theme : 'light';
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const systemDark = (m.getAttribute('media') || '').includes('dark');
    m.setAttribute('content', THEME_COLORS[t === 'auto' ? (systemDark ? 'dark' : 'light') : t]);
  });
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
}

function SurfSpot({ surf }) {
  const [f, setF] = useState({ name: surf.name || '', lat: surf.lat ?? '', lon: surf.lon ?? '', facing: surf.facing ?? '' });
  const [busy, setBusy] = useState(false);
  const save = () => {
    const lat = Number(f.lat);
    const lon = Number(f.lon);
    const facing = Number(f.facing);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast('Latitude and longitude look wrong'); return; }
    actions.saveSettings({ surf: { name: f.name.trim() || 'My spot', lat, lon, facing: Number.isFinite(facing) ? ((facing % 360) + 360) % 360 : 0 } });
    toast('Surf spot saved');
  };
  const locate = () => {
    if (!navigator.geolocation) { toast('Location is not available on this device'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setF({ ...f, lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4) }); setBusy(false); },
      () => { toast('Location permission was refused'); setBusy(false); },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };
  return html`<div class="group group--pad">
    <${Field} label="Spot name"><input class="input" value=${f.name} onInput=${(e) => setF({ ...f, name: e.currentTarget.value })} /></${Field}>
    <div class="fields-2" style="margin-top:14px">
      <${Field} label="Latitude"><input class="input" inputmode="decimal" value=${f.lat} onInput=${(e) => setF({ ...f, lat: e.currentTarget.value })} /></${Field}>
      <${Field} label="Longitude"><input class="input" inputmode="decimal" value=${f.lon} onInput=${(e) => setF({ ...f, lon: e.currentTarget.value })} /></${Field}>
    </div>
    <${Field} label=${`Beach faces ${f.facing !== '' ? compass(Number(f.facing)) : ''}`} hint="The direction you look at when you face the sea, in degrees (0 is north, 270 is west). It decides when the wind counts as offshore.">
      <input class="input" inputmode="numeric" value=${f.facing} onInput=${(e) => setF({ ...f, facing: e.currentTarget.value })} />
    </${Field}>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn--ghost" onClick=${locate} disabled=${busy}>${busy ? 'Locating' : 'Use my location'}</button>
      <button class="btn btn--primary" style="margin-left:auto" onClick=${save}>Save spot</button>
    </div>
  </div>`;
}

function Thesis({ thesis }) {
  const [f, setF] = useState({ title: thesis.title || '', target: thesis.target || '' });
  return html`<div class="group group--pad">
    <${Field} label="Working title"><input class="input" value=${f.title} onInput=${(e) => setF({ ...f, title: e.currentTarget.value })} /></${Field}>
    <${Field} label="Target submission date"><input class="input" type="date" value=${f.target} onInput=${(e) => setF({ ...f, target: e.currentTarget.value })} /></${Field}>
    <div style="display:flex;margin-top:16px"><button class="btn btn--primary" style="margin-left:auto" onClick=${() => { actions.saveSettings({ thesis: f }); toast('Thesis saved'); }}>Save</button></div>
  </div>`;
}

export function SettingsView({ state, sub, install, onSignOut }) {
  const s = state.data.settings;
  const st = state.status;
  const [theme, setTheme] = useState(getTheme());
  const fileRef = useRef(null);
  const save = (k) => (v) => actions.saveSettings({ [k]: v });
  const studio = s.edition === 'studio';
  useEffect(() => {
    const el = sub && document.getElementById(sub);
    if (el) el.scrollIntoView({ block: 'start' });
  }, [sub]);

  const exportData = async () => {
    try {
      const data = await actions.exportAll();
      downloadFile(`perceverance-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast('Backup downloaded');
    } catch (e) {
      toast('Export failed: ' + e.message);
    }
  };
  const [pending, setPending] = useState(null);
  const pickFile = async (e) => {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const cols = json && json.collections;
      if (!cols) throw new Error('this file is not a dashboard backup');
      const count = Object.values(cols).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
      setPending({ json, count, name: file.name });
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  };
  const runImport = async () => {
    try {
      const n = await actions.importAll(pending.json);
      toast(`Imported ${n} items`);
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
    setPending(null);
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  return html`<div>
    <${PageHead} over=${`Version ${APP_VERSION}`} title="Settings" />
    <div class="grid-2">
      <div class="stack">
        <${Section} title="Account">
          <div class="group">
            <div class="row">
              <div class="row__main">
                <div class="row__title">${(st.user && st.user.email) || 'Signed in'}</div>
                <div class="row__sub">Sync ${st.sync === 'synced' ? 'is up to date' : st.sync === 'syncing' ? 'is sending changes' : st.sync === 'offline' ? 'resumes when you are back online' : 'is connecting'}</div>
              </div>
              <button class="btn btn--ghost btn--sm" onClick=${onSignOut}><${Icon} name="logout" size="xs" />Sign out</button>
            </div>
          </div>
        </${Section}>
        <${Section} title="Space">
          <div class="group group--pad">
            <${Segmented} label="Space" value=${studio ? 'studio' : 'research'} onChange=${(e) => actions.saveSettings({ edition: e })} items=${[{ id: 'research', label: 'Research' }, { id: 'studio', label: 'Studio' }]} />
            <p class="field__hint" style="margin-top:10px">Research is for the PhD, papers and surf; Studio is for design work, clients and invoices. This changes only what this account shows; its data stays.</p>
          </div>
        </${Section}>
        <${Section} title="Notifications" id="notifications"><${Notifications} settings=${s} devices=${state.data.devices} /></${Section}>
        <${Section} title="Friends" id="friends"><${Friends} settings=${s} profile=${state.data.profile} /></${Section}>
        <${Section} title="App icon"><${AppIcon} settings=${s} /></${Section}>
        <${Section} title="Task areas">
          <div class="group group--pad"><${TagEditor} plain=${true} value=${s.taskAreas || []} onChange=${save('taskAreas')} placeholder="Add an area" /></div>
        </${Section}>
        ${studio && html`<${Section} title="Projects and invoices">
          <div class="group group--pad">
            <div class="fields-2">
              <${Field} label="Currency">
                <select class="select" value=${s.currency || 'EUR'} onChange=${(e) => actions.saveSettings({ currency: e.currentTarget.value })}>
                  ${['EUR', 'GBP', 'USD', 'CHF', 'CAD', 'AUD'].map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
                </select>
              </${Field}>
              <${Field} label="Payment terms (days)">
                <input class="input" inputmode="numeric" value=${s.paymentDays || 30} onChange=${(e) => { const n = Math.round(Number(e.currentTarget.value)); if (n > 0 && n < 366) actions.saveSettings({ paymentDays: n }); }} />
              </${Field}>
            </div>
            <div class="field" style="margin-top:15px"><span class="field__label">Project types</span><${TagEditor} plain=${true} value=${s.projectTypes || []} onChange=${save('projectTypes')} placeholder="Add a type" /></div>
          </div>
        </${Section}>
        <${Section} title="Fasting">
          <div class="group group--pad">
            <${Segmented} label="Hours between dinner and the next meal" value=${String(Number(s.fastHours) || 14)} onChange=${(h) => actions.saveSettings({ fastHours: Number(h) })} items=${[12, 13, 14, 16].map((h) => ({ id: String(h), label: `${h} h` }))} />
            <p class="field__hint" style="margin-top:10px">A fast already running keeps the length it started with.</p>
          </div>
        </${Section}>`}
        ${!studio && html`<${Section} title="Paper tags">
          <div class="group group--pad">
            <${TagEditor} value=${s.tags || []} onChange=${save('tags')} placeholder="Add a tag" />
            <p class="field__hint" style="margin-top:10px">Digits after letters show as subscripts, so MnBi2Te4 reads as a formula. arXiv matches on a tag keyword are tagged automatically.</p>
          </div>
        </${Section}>
        <${Section} title="arXiv watch">
          <div class="group group--pad">
            <div class="field"><span class="field__label">Keywords</span><${TagEditor} plain=${true} value=${s.arxivKeywords || []} onChange=${save('arxivKeywords')} placeholder="Add a keyword" /></div>
            <div class="field" style="margin-top:16px"><span class="field__label">Categories</span><${TagEditor} plain=${true} value=${s.arxivCategories || []} suggestions=${CATEGORY_SUGGESTIONS} onChange=${save('arxivCategories')} placeholder="cond-mat" /></div>
            <p class="field__hint" style="margin-top:10px">cond-mat already covers every condensed matter subcategory. The daily workflow reads these settings each morning.</p>
          </div>
        </${Section}>`}
        <${Section} title="Sport types">
          <div class="group group--pad"><${TagEditor} plain=${true} value=${s.sportTypes || []} onChange=${save('sportTypes')} placeholder="Add a sport" /></div>
        </${Section}>
        ${!studio && html`<${Section} title="Facilities">
          <div class="group group--pad"><${TagEditor} plain=${true} value=${s.facilities || []} onChange=${save('facilities')} placeholder="Add a facility" /></div>
        </${Section}>`}
      </div>
      <div class="stack">
        ${!studio && html`<${Section} title="Surf spot"><${SurfSpot} key=${JSON.stringify(s.surf)} surf=${s.surf} /></${Section}>
        <${Section} title="Thesis"><${Thesis} key=${JSON.stringify(s.thesis)} thesis=${s.thesis} /></${Section}>
        <${Section} title="Appearance">
          <div class="group group--pad">
            <${Segmented} label="Theme" value=${theme} onChange=${(t) => { setTheme(t); applyTheme(t); }} items=${[{ id: 'light', label: 'Paper' }, { id: 'dark', label: 'Night' }, { id: 'auto', label: 'Match system' }]} />
            <p class="field__hint" style="margin-top:10px">Saved on this device only.</p>
          </div>
        </${Section}>`}
        <${Section} title="Level system">
          <div class="group group--pad">
            <div class="field">
              <span class="field__label">Daily goal</span>
              <div class="chips">${[60, 100, 150, 200].map((n) => html`<button key=${n} class="chip" aria-pressed=${(s.xpGoal || 100) === n ? 'true' : 'false'} onClick=${() => actions.saveSettings({ xpGoal: n })}>${n} XP</button>`)}</div>
              <span class="field__hint">${studio ? 'XP comes from tasks, hours on projects, delivered projects, invoices, habits and sport.' : 'XP comes from tasks, papers, habits, sport and thesis progress.'} A full day lands around 100.</span>
            </div>
          </div>
        </${Section}>
        <${Section} title="Install">
          <div class="group group--pad">
            ${standalone ? html`<p class="muted">Installed. It opens like a normal app.</p>`
              : install ? html`<button class="btn btn--primary" onClick=${install}><${Icon} name="download" size="sm" />Install the app</button>`
              : isIOS ? html`<p class="muted">In Safari, tap Share, then Add to Home Screen.</p>`
              : html`<p class="muted">In Chrome or Edge, use the install icon in the address bar, or the menu, then Install app.</p>`}
          </div>
        </${Section}>
        <${Section} title="Your data">
          <div class="group group--pad">
            <p class="muted" style="margin-bottom:12px">Download everything as one JSON file. Keep a copy; it also lets you move to another backend later.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn--ghost" onClick=${exportData}><${Icon} name="download" size="sm" />Export backup</button>
              <button class="btn btn--ghost" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} name="upload" size="sm" />Import backup</button>
              <input ref=${fileRef} type="file" accept="application/json,.json" style="display:none" onChange=${pickFile} />
            </div>
            ${pending && html`<div class="notice" style="margin:14px 0 0">
              <${Icon} name="info" size="sm" />
              <div style="flex:1">
                <p>${pending.name} holds ${pending.count} items. Items with the same ID are replaced; nothing else is deleted.</p>
                <div style="display:flex;gap:8px;margin-top:10px">
                  <button class="btn btn--primary btn--sm" onClick=${runImport}>Import ${pending.count} items</button>
                  <button class="btn btn--quiet btn--sm" onClick=${() => setPending(null)}>Cancel</button>
                </div>
              </div>
            </div>`}
          </div>
        </${Section}>
        <p class="faint" style="font-size:12.5px;margin:0 2px">Version ${APP_VERSION}${getBackend() && getBackend().mode === 'firebase' ? ', synced with Firebase' : ''}.</p>
      </div>
    </div>
  </div>`;
}
