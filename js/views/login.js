import { html, useState } from '../../vendor/preact.js';
import { Mark } from '../ui.js';

function rememberedEmail() {
  try { return localStorage.getItem('dash.email') || ''; } catch (e) { return ''; }
}

export function LoginView({ backend, describeError }) {
  const [email, setEmail] = useState(rememberedEmail());
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await backend.signIn(email.trim(), password);
      try { localStorage.setItem('dash.email', email.trim()); } catch (err) { /* ignore */ }
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };
  const reset = async () => {
    setError('');
    if (!email.trim()) { setError('Type your email first, then tap the link again.'); return; }
    try {
      await backend.resetPassword(email.trim());
      setInfo('Check your inbox for a link to choose a new password.');
    } catch (err) {
      setError(describeError(err));
    }
  };

  // The space last used on this device sets the words; the look follows from the stylesheet.
  const studio = document.documentElement.dataset.edition === 'studio';
  return html`<div class="login">
    <form class="login__card" onSubmit=${submit}>
      <${Mark} size=${56} cls="login__mark" />
      ${studio
        ? html`<h1 class="login__title">Sign in <em>to the studio.</em></h1>
          <p class="login__sub">Projects, clients, invoices and habits, in sync between your phone and your computer.</p>`
        : html`<h1 class="login__title">Sign in <em>to your almanac.</em></h1>
          <p class="login__sub">Tasks, papers, beamtimes, surf and habits, in sync between your phone and your computer.</p>`}
      <label class="field">
        <span class="field__label">Email</span>
        <input class="input" type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.currentTarget.value)} required />
      </label>
      <label class="field">
        <span class="field__label">Password</span>
        <input class="input" type="password" autocomplete="current-password" value=${password} onInput=${(e) => setPassword(e.currentTarget.value)} required />
      </label>
      <button class="btn btn--primary btn--block" style="margin-top:20px;min-height:46px" disabled=${busy}>${busy ? 'Signing in' : 'Sign in'}</button>
      ${error && html`<p class="login__error" role="alert">${error}</p>`}
      ${info && html`<p class="muted" style="margin-top:12px;font-size:14px">${info}</p>`}
      <div class="login__alt">
        <button type="button" class="link-btn" onClick=${reset}>Forgot your password?</button>
      </div>
    </form>
  </div>`;
}

export function SetupView() {
  return html`<div class="login">
    <div class="login__card">
      <${Mark} size=${56} cls="login__mark" />
      <h1 class="login__title">One step left: <em>connect your database.</em></h1>
      <p class="login__sub">Add your Firebase keys to config.js so your phone and computer share the same data. The README walks through it in about ten minutes, free and without a card.</p>
    </div>
  </div>`;
}
