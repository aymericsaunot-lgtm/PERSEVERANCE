// Notifications on this device: ask permission, subscribe to the browser's push service, and
// save the subscription under the account (devices). scripts/notify.py, run by GitHub every
// ten minutes, sends to every saved device.
import { config } from '../config.js';
import { actions, getState } from './store.js';
import { iconById, currentIcon } from './icons.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deviceId(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Device';
  const app = isStandalone() ? 'app' : /edg\//i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'browser';
  return `${os}, ${app}`;
}

// The subscription this device holds right now, if any.
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser cannot receive notifications.');
  if (!config.push || !config.push.publicKey) throw new Error('The notification key is missing from config.js.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for this app. Allow them in the system settings, then try again.' : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(config.push.publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key would be refused by the push service: start again.
  const held = sub && sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
  if (held && (held.length !== key.length || held.some((b, i) => b !== key[i]))) { await sub.unsubscribe().catch(() => {}); sub = null; }
  // A subscription this account does not own (another account used this browser): start
  // again, so two accounts never share one.
  if (sub && !getState().data.devices.some((d) => d.endpoint === sub.endpoint)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  const id = await deviceId(json.endpoint);
  actions.put('devices', id, { endpoint: json.endpoint, keys: json.keys, label: deviceLabel(), createdAt: Date.now() });
  // The sender works in this time zone.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const notify = getState().data.settings.notify || {};
  if (tz && notify.tz !== tz) actions.saveSettings({ notify: { ...notify, tz } });
  return id;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  const id = await deviceId(sub.endpoint);
  await sub.unsubscribe().catch(() => {});
  // Only this account's record; if it never had one, there is nothing to remove.
  if (getState().data.devices.some((d) => d.id === id)) actions.remove('devices', id);
}

export async function thisDeviceId() {
  const sub = await currentSubscription();
  return sub ? deviceId(sub.endpoint) : '';
}

// Shown by this device alone, to check that notifications display here.
export async function testHere() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(config.appName, {
    body: 'Notifications work on this device.',
    icon: `icons/${iconById(currentIcon()).id}-192.png`,
    tag: 'test',
  });
}
