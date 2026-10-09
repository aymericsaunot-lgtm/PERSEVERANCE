import { html, useState, useRef, useEffect } from '../../vendor/preact.js';
import { actions, getBackend } from '../store.js';
import { Icon, Section, Field, Segmented, TagEditor, PageHead, toast, downloadFile } from '../ui.js';
import { compass } from '../lib/surf.js';
import { todayISO } from '../lib/dates.js';
import { APP_VERSION } from '../version.js';

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
      downloadFile(`dashboard-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
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
