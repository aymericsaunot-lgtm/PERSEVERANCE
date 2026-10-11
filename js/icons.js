// App icons. Each design is one square SVG here, plus three PNGs in icons/ for phones
// (<id>-180.png for iPhone, <id>-192.png and <id>-512.png for Android). To change a design,
// edit its SVG and replace its three PNGs; to add one, add an entry and its PNGs.
import { config } from '../config.js';

export const APP_ICONS = [
  {
    id: 'sunset',
    label: 'Sunset',
    svg: `<rect width="64" height="64" fill="#DD4F1C"/>
      <circle cx="32" cy="33" r="12" fill="#F8F6F0"/>
      <path d="M0 39c7-3.5 12 3 20 0s12-4 20-1 13 3.5 24-.5V64H0z" fill="#1C1A16"/>
      <path d="M10 48.5c5-2 9 1.6 14 0M34 52.5c5-2 9 1.6 14 0" stroke="#F8F6F0" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.55"/>`,
  },
  {
    id: 'tide',
    label: 'Tide',
    svg: `<rect width="64" height="64" fill="#1C1A16"/>
      <circle cx="46" cy="18" r="5.5" fill="#DD4F1C"/>
      <path d="M7 37c5.5 0 7.5-11 13-11s7.5 11 13 11 7.5-11 13-11 7 11 11 11" stroke="#EEEAE0" stroke-width="3.2" stroke-linecap="round" fill="none"/>
      <path d="M8 47h48" stroke="#EEEAE0" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/>`,
  },
  {
    id: 'bold',
    label: 'P.',
    svg: `<rect width="64" height="64" fill="#FFB3FD"/>
      <path d="M18 14h16a13 13 0 0 1 0 26h-5v10H18z" fill="#121212"/>
      <path d="M29 23h4.5a4 4 0 0 1 0 8H29z" fill="#FFB3FD"/>
      <circle cx="44.5" cy="45" r="5" fill="#121212"/>`,
  },
  {
    id: 'blocks',
    label: 'Blocks',
    svg: `<rect width="64" height="64" fill="#F8F8F4"/>
      <rect x="12" y="12" width="19" height="19" rx="5" fill="#FFB3FD"/>
      <rect x="33" y="12" width="19" height="19" rx="9.5" fill="#BAFFD0"/>
      <rect x="12" y="33" width="19" height="19" rx="9.5" fill="#C9FFFB"/>
      <rect x="33" y="33" width="19" height="19" rx="5" fill="#121212"/>`,
  },
];

export const defaultIcon = (edition) => (edition === 'studio' ? 'bold' : 'sunset');
export const iconById = (id) => APP_ICONS.find((i) => i.id === id) || APP_ICONS[0];
// round: corners cut like a phone icon, for the browser tab.
export const iconSvg = (id, round = false) => round
  ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><clipPath id="r"><rect width="64" height="64" rx="14"/></clipPath><g clip-path="url(#r)">${iconById(id).svg}</g></svg>`
  : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${iconById(id).svg}</svg>`;

const KEY = 'dash.icon';
let current = (() => { try { return localStorage.getItem(KEY) || 'sunset'; } catch (e) { return 'sunset'; } })();
export const currentIcon = () => current;
// For the in-app marks during a render; applyAppIcon does the rest after it.
export const setCurrentIcon = (id) => { current = iconById(id).id; };

let manifestUrl = '';
function setLink(rel, href, type) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  if (type) el.type = type;
  if (el.getAttribute('href') !== href) el.setAttribute('href', href);
}

// Uses an icon everywhere it can change from inside the page: the in-app mark, the browser tab,
// and what a phone takes when the app is added to the home screen. An app that is already on a
// home screen keeps its old icon until it is removed and added again.
export function applyAppIcon(id, edition) {
  const icon = iconById(id);
  current = icon.id;
  try { localStorage.setItem(KEY, icon.id); } catch (e) { /* ignore */ }
  setLink('icon', `data:image/svg+xml,${encodeURIComponent(iconSvg(icon.id, true))}`, 'image/svg+xml');
  setLink('apple-touch-icon', `icons/${icon.id}-180.png`);
  const studio = edition === 'studio';
  // iPhones take the icon from apple-touch-icon and need the real manifest file for notifications.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if ((icon.id === 'sunset' && !studio) || ios) { setLink('manifest', 'manifest.webmanifest'); return; }
  const abs = (p) => new URL(p, location.href).href;
  const colour = studio ? '#F8F8F4' : '#EEEAE0';
  const manifest = {
    id: abs('./'), name: config.appName, short_name: config.appName, start_url: abs('./'), scope: abs('./'), display: 'standalone',
    background_color: colour, theme_color: colour,
    icons: [
      { src: abs(`icons/${icon.id}-192.png`), sizes: '192x192', type: 'image/png' },
      { src: abs(`icons/${icon.id}-512.png`), sizes: '512x512', type: 'image/png' },
      { src: abs(`icons/${icon.id}-512.png`), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  if (manifestUrl) URL.revokeObjectURL(manifestUrl);
  manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  setLink('manifest', manifestUrl);
}
