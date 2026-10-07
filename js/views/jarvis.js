// Jarvis: the chat screen and the briefing tile on Today.
import { html, useState, useEffect, useRef, useLayoutEffect } from '../../vendor/preact.js';
import { dataReady } from '../store.js';
import { Icon, Orb, toast } from '../ui.js';
import { greeting } from '../lib/dates.js';
import {
  useJarvis, hasApiKey, send, retry, stop, newConversation, todaysConversation, undoAction,
  briefing, briefingText, voiceOn, setVoice, afterFallback, assistantText, MODEL_LABEL,
} from '../lib/jarvis.js';

// A small, safe Markdown subset: paragraphs, line breaks, lists, **bold**, *italic*, `code`.
function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) out.push(html`<strong>${m[1]}</strong>`);
    else if (m[2] != null) out.push(html`<code>${m[2]}</code>`);
    else out.push(html`<em>${m[3]}</em>`);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function blocksOf(text) {
  const blocks = [];
  let para = null;
  let list = null;
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) { para = null; list = null; continue; }
    if (ul || ol) {
      para = null;
      const t = ul ? 'ul' : 'ol';
      if (!list || list.t !== t) { list = { t, items: [] }; blocks.push(list); }
      list.items.push((ul || ol)[1]);
      continue;
    }
    list = null;
    const clean = line.replace(/^#{1,6}\s+/, '');
    if (!para) { para = { t: 'p', lines: [] }; blocks.push(para); }
    para.lines.push(clean);
  }
  return blocks;
}

export function Prose({ text, caret = false }) {
  const blocks = blocksOf(text);
  const tail = caret ? html`<span class="caret" aria-hidden="true"></span>` : null;
  if (!blocks.length) return html`<div class="prose"><p>${tail}</p></div>`;
  return html`<div class="prose">${blocks.map((b, i) => {
    const end = i === blocks.length - 1 ? tail : null;
    if (b.t === 'p') return html`<p key=${i}>${b.lines.map((l, k) => html`${k > 0 && html`<br />`}${inline(l)}`)}${end}</p>`;
    const items = b.items.map((it, k) => html`<li key=${k}>${inline(it)}${k === b.items.length - 1 ? end : null}</li>`);
    return b.t === 'ul' ? html`<ul key=${i}>${items}</ul>` : html`<ol key=${i}>${items}</ol>`;
  })}</div>`;
}

function Act({ id, a, pending }) {
  if (!a) {
    return pending ? html`<span class="act act--pending"><${Icon} name="more" size="xs" /><span class="act__label">Working</span></span>` : null;
  }
  const cls = 'act' + (a.undone ? ' act--undone' : '') + (a.failed ? ' act--failed' : '');
  return html`<span class=${cls}>
    <${Icon} name=${a.failed ? 'alert' : a.undone ? 'undo' : 'check'} size="xs" />
    <span class="act__label">${a.undone ? 'Undone' : a.label}</span>
    <span class="act__detail">${a.detail}</span>
    ${a.xp > 0 && !a.undone && html`<span class="act__xp">+${a.xp} XP</span>`}
    ${a.undo && !a.undone && html`<button class="act__undo" title="Undo" aria-label=${`Undo: ${a.label}, ${a.detail}`} onClick=${() => undoAction(id)}><${Icon} name="undo" size="xs" /></button>`}
  </span>`;
}

// Turns the stored API conversation into what the screen shows: your messages, and Jarvis's
// replies with the actions taken along the way. Context notes and tool results stay hidden.
function toMessages(conv) {
  const out = [];
  let group = null;
  for (const t of conv ? conv.turns : []) {
    const { role, content } = t.m;
    if (role === 'user' && typeof content === 'string') {
      group = null;
      if (!t.hidden) out.push({ who: 'user', text: content, key: `u${t.at}${out.length}` });
      continue;
    }
    if (role !== 'assistant') continue;
    if (!group) { group = { who: 'jarvis', items: [], key: `j${t.at}${out.length}` }; out.push(group); }
    for (const b of afterFallback(content)) {
      if (b.type === 'text' && b.text.trim()) group.items.push({ t: 'text', text: b.text });
      else if (b.type === 'tool_use') group.items.push({ t: 'act', id: b.id });
    }
  }
  return out.filter((m) => m.who === 'user' || m.items.length);
}

function JarvisMessage({ items, actions, live, thinking }) {
  const parts = [];
  let acts = [];
  const flush = (k) => { if (acts.length) { parts.push(html`<div key=${'a' + k} class="acts">${acts}</div>`); acts = []; } };
  items.forEach((it, i) => {
    if (it.t === 'act') { acts.push(html`<${Act} key=${it.id} id=${it.id} a=${actions[it.id]} pending=${live} />`); return; }
    flush(i);
    parts.push(html`<${Prose} key=${'t' + i} text=${it.text} caret=${live && i === items.length - 1} />`);
  });
  flush('end');
  return html`<div class="msg msg--jarvis">
    <div class="msg__who"><${Orb} size=${14} live=${live} /><span class="overline">Jarvis</span></div>
    ${parts}
    ${thinking && html`<p class="faint">Thinking<span class="caret" aria-hidden="true"></span></p>`}
  </div>`;
}

function useVoiceInput(onText) {
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [on, setOn] = useState(false);
  const ref = useRef(null);
  useEffect(() => () => { if (ref.current) ref.current.abort(); }, []);
  const toggle = () => {
    if (on) { if (ref.current) ref.current.stop(); setOn(false); return; }
    const r = new SR();
    r.lang = navigator.language || 'en-GB';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      onText(s);
    };
    r.onend = () => setOn(false);
    r.onerror = (e) => {
      setOn(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Microphone access was refused');
    };
    ref.current = r;
    try { r.start(); setOn(true); } catch (err) { setOn(false); }
  };
  return { supported: !!SR, on, toggle };
}

const SUGGESTIONS = [
  { icon: 'today', label: 'Plan my day', text: 'Plan my day: what should I focus on, and in what order?' },
  { icon: 'book', label: 'What should I read next?', text: 'What should I read next, and why that one?' },
  { icon: 'peak', label: 'How is my week going?', text: 'How is my week going? Be honest.' },
  { icon: 'life', label: 'Worth surfing today?', text: 'Is it worth surfing today? When exactly?' },
];

export function JarvisView({ state, go }) {
  const j = useJarvis();
  const conv = todaysConversation();
  const keyed = hasApiKey();
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const nearBottom = useRef(true);
  const voice = useVoiceInput(setText);
  const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

  const messages = toMessages(conv);
  const liveItems = [];
  if (j.busy && j.live) {
    for (const b of afterFallback(j.live.content)) {
      if (b.type === 'text' && b.text) liveItems.push({ t: 'text', text: b.text });
      else if (b.type === 'tool_use') liveItems.push({ t: 'act', id: b.id });
    }
  }
  const lastTurn = conv && conv.turns[conv.turns.length - 1];
  const continuing = lastTurn && !(lastTurn.m.role === 'user' && typeof lastTurn.m.content === 'string') && messages.length && messages[messages.length - 1].who === 'jarvis';

  useEffect(() => {
    const onScroll = () => { nearBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160; };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.scrollTo(0, document.documentElement.scrollHeight);
    if (fine && inputRef.current) inputRef.current.focus();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const liveLen = liveItems.reduce((n, it) => n + (it.text ? it.text.length : 1), 0);
  useLayoutEffect(() => {
    if (nearBottom.current) window.scrollTo(0, document.documentElement.scrollHeight);
  }, [messages.length, liveLen, j.busy, !!j.error]);

  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 168) + 'px'; };
  useEffect(() => grow(inputRef.current), [text]);

  const submit = (e) => {
    if (e) e.preventDefault();
    const t = text.trim();
    if (!t || j.busy) return;
    if (!keyed) { go('settings/jarvis'); return; }
    if (voice.on) voice.toggle();
    setText('');
    nearBottom.current = true;
    send(t);
  };
  const ask = (s) => { nearBottom.current = true; send(s.text); };

  const status = !keyed ? 'Offline, add your API key' : j.busy ? 'Thinking' : `Online, ${MODEL_LABEL}`;
  const voiceIsOn = voiceOn();
  const empty = !messages.length && !j.busy;

  return html`<div class="jarvis">
    <header class="jarvis__head">
      <button class="icon-btn" aria-label="Back to Today" onClick=${() => go('today')}><${Icon} name="chevronLeft" /></button>
      <div class="jarvis__id">
        <${Orb} size=${30} live=${j.busy} />
        <div style="min-width:0"><div class="jarvis__name">Jarvis</div><div class="jarvis__status">${status}</div></div>
      </div>
      ${'speechSynthesis' in window && html`<button class="icon-btn" aria-pressed=${voiceIsOn ? 'true' : 'false'} aria-label=${voiceIsOn ? 'Stop reading replies aloud' : 'Read replies aloud'} title=${voiceIsOn ? 'Replies read aloud' : 'Replies silent'} onClick=${() => setVoice(!voiceIsOn)}>
        <${Icon} name=${voiceIsOn ? 'speaker' : 'speakerOff'} />
      </button>`}
      <button class="icon-btn" aria-label="New conversation" title="New conversation" disabled=${!conv || j.busy} onClick=${newConversation}><${Icon} name="plusCircle" /></button>
    </header>

    <div class="thread" aria-live="polite">
      ${empty && html`<div class="jarvis-empty">
        <div class="horizon-orb"><${Orb} size=${132} /></div>
        ${keyed ? html`
          <h1 class="jarvis-empty__title">${greeting()}.<strong>What can I take off your plate?</strong></h1>
          <div class="suggests">${SUGGESTIONS.map((s) => html`<button key=${s.label} class="suggest" onClick=${() => ask(s)}><${Icon} name=${s.icon} />${s.label}</button>`)}</div>
          <p class="faint" style="font-size:13px">Jarvis sees your dashboard and can add or update tasks, tick habits, log sport, add deadlines and remember things about you. Every change shows here with an undo button.</p>`
        : html`
          <h1 class="jarvis-empty__title">Jarvis is offline.<strong>Add your API key to begin.</strong></h1>
          <p class="muted">Jarvis runs on ${MODEL_LABEL} with your own Anthropic API key. The key stays on this device.</p>
          <div><button class="btn btn--primary" onClick=${() => go('settings/jarvis')}><${Icon} name="key" size="sm" />Add API key</button></div>`}
      </div>`}

      ${messages.map((m, i) => (m.who === 'user'
        ? html`<div key=${m.key} class="msg msg--user">${m.text}</div>`
        : html`<${JarvisMessage} key=${m.key} items=${i === messages.length - 1 && j.busy && continuing ? [...m.items, ...liveItems] : m.items}
            actions=${conv.actions} live=${i === messages.length - 1 && j.busy && continuing}
            thinking=${i === messages.length - 1 && j.busy && continuing && !liveItems.some((it) => it.t === 'text')} />`))}
      ${j.busy && !continuing && html`<${JarvisMessage} items=${liveItems} actions=${(conv && conv.actions) || {}} live=${true} thinking=${!liveItems.some((it) => it.t === 'text')} />`}

      ${j.error && !j.busy && html`<div class=${'jarvis-note' + (j.error.soft ? ' jarvis-note--soft' : '')} role="alert">
        <${Icon} name="alert" size="sm" />
        <div style="flex:1">
          <p>${j.error.message}</p>
          ${(j.error.retry || /key/i.test(j.error.message)) && html`<div style="display:flex;gap:8px;margin-top:10px">
            ${j.error.retry && html`<button class="btn btn--sm btn--primary" onClick=${retry}>Try again</button>`}
            ${/key/i.test(j.error.message) && html`<button class="btn btn--sm" onClick=${() => go('settings/jarvis')}>Settings</button>`}
          </div>`}
        </div>
      </div>`}
    </div>

    <form class="composer" onSubmit=${submit}>
      <div class="composer__box">
        <textarea ref=${inputRef} class="composer__input" rows="1" value=${text} placeholder=${keyed ? 'Ask Jarvis, or say what you did' : 'Add your API key first'}
          aria-label="Message Jarvis" enterkeyhint="send"
          onInput=${(e) => setText(e.currentTarget.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && fine) { e.preventDefault(); submit(); } }}></textarea>
        ${voice.supported && html`<button type="button" class="icon-btn mic-btn" aria-pressed=${voice.on ? 'true' : 'false'} aria-label=${voice.on ? 'Stop dictation' : 'Dictate'} onClick=${voice.toggle}><${Icon} name="mic" /></button>`}
        ${j.busy
          ? html`<button type="button" class="send-btn" aria-label="Stop" onClick=${stop}><${Icon} name="stop" size="sm" /></button>`
          : html`<button type="submit" class="send-btn" aria-label="Send" disabled=${!text.trim()}><${Icon} name="arrow" size="sm" /></button>`}
      </div>
    </form>
  </div>`;
}

const timeOf = (ms) => (ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

// Today's briefing, written once a day by Jarvis, with a box to ask a follow-up.
export function BriefingCard({ state, go }) {
  const j = useJarvis();
  const keyed = hasApiKey();
  const enabled = (state.data.settings.jarvis || {}).briefing !== false;
  const ready = dataReady(state) && state.status.sync !== 'connecting';
  const [ask, setAsk] = useState('');

  useEffect(() => {
    if (keyed && enabled && ready) briefing(state);
  }, [keyed, enabled, ready]);

  const conv = todaysConversation();
  let lastUser = null;
  for (let i = conv ? conv.turns.length - 1 : -1; i >= 0; i--) {
    const t = conv.turns[i];
    if (t.m.role === 'user' && typeof t.m.content === 'string') { lastUser = t; break; }
  }
  const writing = j.busy && lastUser && lastUser.kind === 'briefing';
  const live = writing && j.live ? assistantText(j.live.content) : '';
  const b = briefingText(state);

  const submit = (e) => {
    e.preventDefault();
    const t = ask.trim();
    if (!t) return;
    if (!keyed) { go('settings/jarvis'); return; }
    if (j.busy) { toast('Jarvis is still answering'); return; }
    setAsk('');
    send(t);
    go('jarvis');
  };

  let body;
  if (!keyed) {
    body = html`<div class="brief__text is-empty">Jarvis is offline. Add your Anthropic API key to get a briefing every day, and an assistant that adds tasks, ticks habits and logs sessions when you ask.</div>
      <div style="margin-top:14px"><button class="btn btn--primary btn--sm" onClick=${() => go('settings/jarvis')}><${Icon} name="key" size="xs" />Connect Jarvis</button></div>`;
  } else if (writing) {
    body = html`<div class="brief__text">${live ? html`<${Prose} text=${live} caret=${true} />` : html`<span class="faint">Reading your dashboard<span class="caret" aria-hidden="true"></span></span>`}</div>`;
  } else if (b) {
    body = html`<div class="brief__text"><${Prose} text=${b.text} /></div>`;
  } else if (j.error && !j.busy) {
    body = html`<div class="brief__text is-empty">${j.error.message}</div>
      <div style="margin-top:12px"><button class="btn btn--sm" onClick=${() => briefing(state, { force: true })}>Try again</button></div>`;
  } else if (!enabled) {
    body = html`<div class="brief__text is-empty">Daily briefings are off. Ask anything below, or turn them on in Settings.</div>`;
  } else {
    body = html`<div class="brief__text is-empty">${ready ? 'Ask for today\'s briefing, or ask anything below.' : html`Reading your dashboard<span class="caret" aria-hidden="true"></span>`}</div>
      ${ready && !j.busy && html`<div style="margin-top:12px"><button class="btn btn--sm" onClick=${() => briefing(state, { force: true })}>Brief me</button></div>`}`;
  }

  return html`<section class="group aura brief" aria-label="Jarvis">
    <div class="brief__head">
      <${Orb} size=${26} live=${writing} />
      <span class="brief__name">Jarvis</span>
      ${b && !writing && html`<span class="brief__time">${timeOf(b.at)}</span>`}
      ${keyed && html`<button class="icon-btn icon-btn--sm" aria-label="Write a new briefing" title="New briefing" disabled=${j.busy} onClick=${() => briefing(state, { force: true })}><${Icon} name="refresh" size="xs" /></button>`}
    </div>
    ${body}
    <form class="brief__ask" onSubmit=${submit}>
      <input value=${ask} placeholder=${conv && conv.turns.length > 2 ? 'Continue with Jarvis' : 'Ask Jarvis anything'} aria-label="Ask Jarvis" enterkeyhint="send" onInput=${(e) => setAsk(e.currentTarget.value)} />
      ${ask.trim()
        ? html`<button class="send-btn" style="width:38px;height:38px" aria-label="Send to Jarvis"><${Icon} name="arrow" size="sm" /></button>`
        : html`<button type="button" class="icon-btn icon-btn--sm" aria-label="Open Jarvis" onClick=${() => go('jarvis')}><${Icon} name="arrowRight" size="sm" /></button>`}
    </form>
  </section>`;
}
