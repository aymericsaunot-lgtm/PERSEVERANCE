import { html, useState, useRef, useEffect } from '../../vendor/preact.js';
import { actions, getBackend } from '../store.js';
import { Icon, Orb, Section, Field, Segmented, TagEditor, DangerButton, PageHead, toast, downloadFile } from '../ui.js';
import { compass } from '../lib/surf.js';
import { todayISO, fmtDate, isoOf } from '../lib/dates.js';
import { APP_VERSION } from '../version.js';
import { getApiKey, setApiKey, testApiKey, describeError, voiceOn, setVoice, useJarvis, DEPTHS, MODEL_LABEL } from '../lib/jarvis.js';

const CATEGORY_SUGGESTIONS = ['cond-mat', 'cond-mat.str-el', 'cond-mat.mtrl-sci', 'cond-mat.mes-hall', 'cond-mat.supr-con', 'quant-ph', 'physics.app-ph', 'physics.optics'];

// Dark is the default look; Match system follows the device.
export function getTheme() {
  try { return localStorage.getItem('dash.theme') || 'dark'; } catch (e) { return 'dark'; }
}

const THEME_COLORS = { dark: '#070708', light: '#ECECE9' };

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const systemDark = (m.getAttribute('media') || '').includes('dark');
    m.setAttribute('content', THEME_COLORS[theme === 'light' || theme === 'dark' ? theme : systemDark ? 'dark' : 'light']);
  });
  try { localStorage.setItem('dash.theme', theme); } catch (e) { /* ignore */ }
}

function JarvisSettings({ settings }) {
  useJarvis();
  const saved = getApiKey();
  const [key, setKey] = useState('');
  const [check, setCheck] = useState(saved ? { state: 'saved' } : { state: 'none' });
  const jarvis = settings.jarvis || {};

  const saveKey = async (e) => {
    e.preventDefault();
    const k = key.trim();
    if (!k) return;
    if (!/^sk-ant-/.test(k)) { setCheck({ state: 'bad', message: 'Anthropic API keys start with sk-ant-.' }); return; }
    setCheck({ state: 'testing' });
    try {
      await testApiKey(k);
      setApiKey(k);
      setKey('');
      setCheck({ state: 'ok', message: `Key works. ${MODEL_LABEL} is available.` });
      toast('Jarvis is online');
    } catch (err) {
      setCheck({ state: 'bad', message: describeError(err) });
    }
  };
  const remove = () => { setApiKey(''); setCheck({ state: 'none' }); toast('API key removed from this device'); };
  const recheck = async () => {
    setCheck({ state: 'testing' });
    try { await testApiKey(getApiKey()); setCheck({ state: 'ok', message: `Key works. ${MODEL_LABEL} is available.` }); } catch (err) { setCheck({ state: 'bad', message: describeError(err) }); }
  };

  const statusText = {
    none: 'No key on this device.',
    saved: `Key saved on this device (ends in ${saved.slice(-4)}).`,
    testing: 'Checking the key with Anthropic…',
    ok: check.message,
    bad: check.message,
  }[check.state];

  return html`<div class="group group--pad aura aura--jarvis" style="--ax: 0%; --ay: 0%">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <${Orb} size=${34} live=${check.state === 'testing'} />
      <div>
        <div style="font-weight:700">${saved ? 'Online' : 'Offline'}</div>
        <div class="faint" style="font-size:13px">${MODEL_LABEL}, with your own API key</div>
      </div>
    </div>
    <form onSubmit=${saveKey}>
      <${Field} label="Anthropic API key" hint="Create one in the Claude Console (console.anthropic.com), API keys. Set a monthly spend limit there too: a day of normal use costs a few cents.">
        <div style="display:flex;gap:8px">
          <input class="input" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder=${saved ? 'Paste a new key to replace it' : 'sk-ant-…'} value=${key} onInput=${(e) => setKey(e.currentTarget.value)} />
          <button class="btn btn--primary" type="submit" disabled=${!key.trim() || check.state === 'testing'}>Save</button>
        </div>
      </${Field}>
    </form>
    <div class=${'key-status' + (check.state === 'bad' ? ' key-status--bad' : saved ? '' : ' key-status--off')} role="status">
      <span class="dot"></span><span style="flex:1">${statusText}</span>
      ${saved && check.state !== 'testing' && html`<button class="link-btn" style="font-size:13px" onClick=${recheck}>Test</button><button class="link-btn" style="font-size:13px;color:var(--danger)" onClick=${remove}>Remove</button>`}
    </div>
    <p class="field__hint" style="margin-top:12px">The key is stored only in this browser. It is never synced, exported or sent anywhere except Anthropic. Add it once on each device you use.</p>

    <div class="field" style="margin-top:20px">
      <span class="field__label">Thinking</span>
      <${Segmented} label="How much Jarvis thinks before answering" value=${jarvis.depth || 'low'} onChange=${(d) => actions.saveSettings({ jarvis: { ...jarvis, depth: d } })} items=${DEPTHS} />
      <span class="field__hint">Quick answers fast and costs least. Deep thinks longer for planning and tricky questions.</span>
    </div>
    <div class="field" style="margin-top:16px">
      <span class="field__label">Daily briefing</span>
      <${Segmented} label="Daily briefing" value=${jarvis.briefing === false ? 'off' : 'on'} onChange=${(v) => actions.saveSettings({ jarvis: { ...jarvis, briefing: v === 'on' } })} items=${[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]} />
      <span class="field__hint">Written once a day when you open Today, and shared with your other devices.</span>
    </div>
    <div class="field" style="margin-top:16px">
      <span class="field__label">Voice on this device</span>
      <${Segmented} label="Read replies aloud" value=${voiceOn() ? 'on' : 'off'} onChange=${(v) => setVoice(v === 'on')} items=${[{ id: 'off', label: 'Silent' }, { id: 'on', label: 'Read replies aloud' }]} />
    </div>
  </div>`;
}

function Profile({ profile }) {
  const [f, setF] = useState({ name: profile.name || '', about: profile.about || '' });
  return html`<div class="group group--pad">
    <${Field} label="What should Jarvis call you?" hint="Your first name, a nickname, or sir. Leave it empty for no name.">
      <input class="input" value=${f.name} maxlength="40" onInput=${(e) => setF({ ...f, name: e.currentTarget.value })} />
    </${Field}>
    <${Field} label="About you" hint="What you work on, what you are aiming for, what to push you on. Jarvis reads this before every conversation.">
      <textarea class="textarea" value=${f.about} maxlength="1500" placeholder="PhD in ARPES on 2D materials, defending in 2027. I surf most days. Push me on writing: I avoid it." onInput=${(e) => setF({ ...f, about: e.currentTarget.value })}></textarea>
    </${Field}>
    <div style="display:flex;margin-top:16px"><button class="btn btn--primary" style="margin-left:auto" onClick=${() => { actions.saveSettings({ profile: { name: f.name.trim(), about: f.about.trim() } }); toast('Saved. Jarvis uses it from the next conversation.'); }}>Save</button></div>
  </div>`;
}

function Memories({ memories }) {
  const list = memories.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const forgetAll = () => { for (const m of memories) actions.remove('memories', m.id); toast('Jarvis forgot everything'); };
  return html`<div class="group">
    ${list.length ? list.map((m) => html`<div key=${m.id} class="memory-row">
      <p>${m.text}<span class="faint" style="display:block;font-size:12px;margin-top:2px">${m.at ? `Saved ${fmtDate(isoOf(new Date(m.at)))}` : ''}</span></p>
      <button class="icon-btn icon-btn--sm" aria-label=${'Forget: ' + m.text} onClick=${() => actions.remove('memories', m.id)}><${Icon} name="x" size="xs" /></button>
    </div>`) : html`<p class="muted" style="padding:16px 18px">Nothing yet. Tell Jarvis something worth keeping, such as a goal or a routine, and it lands here.</p>`}
    ${list.length > 1 && html`<div style="padding:4px 10px 12px"><${DangerButton} label="Forget everything" armedLabel="Tap again to forget all" onConfirm=${forgetAll} /></div>`}
  </div>`;
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
        <${Section} title="Jarvis" id="jarvis"><${JarvisSettings} settings=${s} /></${Section}>
        <${Section} title="About you" id="profile"><${Profile} key=${JSON.stringify(s.profile)} profile=${s.profile || {}} /></${Section}>
        <${Section} title="What Jarvis remembers" meta=${String(state.data.memories.length)}><${Memories} memories=${state.data.memories} /></${Section}>
        <${Section} title="Account">
          <div class="group">
            <div class="row">
              <div class="row__main">
                <div class="row__title">${st.mode === 'demo' ? 'Demo mode' : (st.user && st.user.email) || 'Signed in'}</div>
                <div class="row__sub">${st.mode === 'demo' ? 'Nothing you change here is saved.' : `Sync ${st.sync === 'synced' ? 'is up to date' : st.sync === 'syncing' ? 'is sending changes' : st.sync === 'offline' ? 'resumes when you are back online' : 'is connecting'}`}</div>
              </div>
              <button class="btn btn--ghost btn--sm" onClick=${onSignOut}><${Icon} name="logout" size="xs" />${st.mode === 'demo' ? 'Leave demo' : 'Sign out'}</button>
            </div>
          </div>
        </${Section}>
        <${Section} title="Task areas">
          <div class="group group--pad"><${TagEditor} plain=${true} value=${s.taskAreas || []} onChange=${save('taskAreas')} placeholder="Add an area" /></div>
        </${Section}>
        <${Section} title="Paper tags">
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
        </${Section}>
        <${Section} title="Sport types">
          <div class="group group--pad"><${TagEditor} plain=${true} value=${s.sportTypes || []} onChange=${save('sportTypes')} placeholder="Add a sport" /></div>
        </${Section}>
        <${Section} title="Facilities">
          <div class="group group--pad"><${TagEditor} plain=${true} value=${s.facilities || []} onChange=${save('facilities')} placeholder="Add a facility" /></div>
        </${Section}>
      </div>
      <div class="stack">
        <${Section} title="Surf spot"><${SurfSpot} key=${JSON.stringify(s.surf)} surf=${s.surf} /></${Section}>
        <${Section} title="Thesis"><${Thesis} key=${JSON.stringify(s.thesis)} thesis=${s.thesis} /></${Section}>
        <${Section} title="Appearance">
          <div class="group group--pad">
            <${Segmented} label="Theme" value=${theme} onChange=${(t) => { setTheme(t); applyTheme(t); }} items=${[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'auto', label: 'Match system' }]} />
            <p class="field__hint" style="margin-top:10px">Saved on this device only.</p>
          </div>
        </${Section}>
        <${Section} title="Level system">
          <div class="group group--pad">
            <div class="field">
              <span class="field__label">Daily goal</span>
              <div class="chips">${[60, 100, 150, 200].map((n) => html`<button key=${n} class="chip" aria-pressed=${(s.xpGoal || 100) === n ? 'true' : 'false'} onClick=${() => actions.saveSettings({ xpGoal: n })}>${n} XP</button>`)}</div>
              <span class="field__hint">XP comes from tasks, papers, habits, sport and thesis progress. A full day lands around 100.</span>
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
