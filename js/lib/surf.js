// Surf forecast from Open-Meteo (free, no key): swell, wind, tide and water temperature.
import { fmtTime } from './dates.js';

const CACHE_KEY = 'dash.surf.v2';
const MAX_AGE = 60 * 60 * 1000;
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const compass = (deg) => (deg == null ? '' : COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]);
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
}
function writeCache(v) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
}

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('http-' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.reason || 'forecast error');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadForecast(spot, { force = false } = {}) {
  const key = `${Number(spot.lat).toFixed(3)},${Number(spot.lon).toFixed(3)}`;
  const cached = readCache();
  if (!force && cached && cached.key === key && Date.now() - cached.at < MAX_AGE) return { ...cached.data, cachedAt: cached.at };
  const q = `latitude=${spot.lat}&longitude=${spot.lon}&timezone=auto&timeformat=unixtime&forecast_days=6`;
  try {
    const [marine, wind] = await Promise.all([
      fetchJSON(`https://marine-api.open-meteo.com/v1/marine?${q}&cell_selection=sea&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_level_height_msl,sea_surface_temperature`),
      fetchJSON(`https://api.open-meteo.com/v1/forecast?${q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset`),
    ]);
    const data = { marine, wind };
    writeCache({ key, at: Date.now(), data });
    return { ...data, cachedAt: Date.now() };
  } catch (e) {
    if (cached && cached.key === key) return { ...cached.data, cachedAt: cached.at, stale: true };
    throw e;
  }
}

function windRelation(windFrom, facing) {
  if (windFrom == null || facing == null || facing === '') return '';
  const f = Number(facing);
  if (angleDiff(windFrom, (f + 180) % 360) <= 45) return 'offshore';
  if (angleDiff(windFrom, f) <= 45) return 'onshore';
  return 'cross-shore';
}

// 0 to 4. A rough guide for a beach break; tune in settings via the beach direction.
export function scoreHour({ height, period, wind, rel }) {
  if (height == null) return 0;
  let s = height < 0.3 ? 0 : height < 0.6 ? 1 : height < 0.9 ? 2 : height <= 2.5 ? 3 : height <= 3.5 ? 2 : 1;
  if (period != null) s += period >= 12 ? 1 : period >= 9 ? 0.5 : period < 7 ? -1 : 0;
  if (wind != null) {
    if (rel === 'offshore') s += wind <= 30 ? 0.5 : -0.5;
    else if (rel === 'onshore') s -= wind < 8 ? 0 : wind < 15 ? 1 : 2;
    else s -= wind > 20 ? 1 : wind > 12 ? 0.5 : 0;
  }
  return Math.max(0, Math.min(4, Math.round(s)));
}

export const SCORE_LABEL = ['Flat or blown out', 'Poor', 'Fair', 'Good', 'Great'];

export function summarize(fc, spot, nowMs = Date.now()) {
  const m = fc.marine;
  const w = fc.wind;
  const H = m.hourly;
  const tz = m.timezone || w.timezone;
  const off = m.utc_offset_seconds || 0;
  const times = H.time;
  const nowS = nowMs / 1000;
  const localDate = (s) => new Date((s + off) * 1000).toISOString().slice(0, 10);

  const windIdx = new Map((w.hourly.time || []).map((t, i) => [t, i]));
  const at = (i) => {
    const j = windIdx.get(times[i]);
    const height = H.swell_wave_height?.[i] ?? H.wave_height?.[i] ?? null;
    const period = H.swell_wave_period?.[i] ?? H.wave_period?.[i] ?? null;
    const dir = H.swell_wave_direction?.[i] ?? H.wave_direction?.[i] ?? null;
    const wind = j != null ? w.hourly.wind_speed_10m[j] : null;
    const windDir = j != null ? w.hourly.wind_direction_10m[j] : null;
    const gust = j != null ? w.hourly.wind_gusts_10m?.[j] : null;
    const rel = windRelation(windDir, spot.facing);
    return { t: times[i], height, wave: H.wave_height?.[i] ?? null, period, dir, wind, windDir, gust, rel, sst: H.sea_surface_temperature?.[i] ?? null };
  };

  let iNow = 0;
  for (let i = 0; i < times.length; i++) if (times[i] <= nowS) iNow = i;
  const now = { ...at(iNow) };
  now.score = scoreHour(now);

  // Tide: extremes refined with a parabola through neighbouring hours.
  const sl = H.sea_level_height_msl || [];
  const today = localDate(nowS);
  const tidePoints = [];
  const extremes = [];
  if (sl.some((v) => v != null)) {
    for (let i = 0; i < times.length; i++) {
      if (localDate(times[i]) === today && sl[i] != null) tidePoints.push({ t: times[i], v: sl[i] });
      if (i === 0 || i === times.length - 1) continue;
      const a = sl[i - 1], b = sl[i], c = sl[i + 1];
      if (a == null || b == null || c == null) continue;
      const isHigh = b > a && b >= c;
      const isLow = b < a && b <= c;
      if (!isHigh && !isLow) continue;
      const denom = a - 2 * b + c;
      const dx = denom !== 0 ? (a - c) / (2 * denom) : 0;
      const t = times[i] + dx * 3600;
      if (localDate(t) !== today) continue;
      extremes.push({ type: isHigh ? 'High' : 'Low', t, v: b - ((a - c) * dx) / 4, label: fmtTime(t * 1000, tz) });
    }
  }

  // Days: best daylight hour per day.
  const sunrise = new Map();
  const sunset = new Map();
  (w.daily?.time || []).forEach((d, k) => {
    const key = localDate(d);
    sunrise.set(key, w.daily.sunrise[k]);
    sunset.set(key, w.daily.sunset[k]);
  });
  const byDay = new Map();
  for (let i = 0; i < times.length; i++) {
    const d = localDate(times[i]);
    if (d < today) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  }
  const days = [];
  for (const [d, idxs] of byDay) {
    const rise = sunrise.get(d) ?? (Date.parse(d + 'T07:00:00Z') / 1000 - off);
    const set = sunset.get(d) ?? (Date.parse(d + 'T19:00:00Z') / 1000 - off);
    let best = null;
    let maxH = 0;
    for (const i of idxs) {
      const h = at(i);
      if (h.height != null) maxH = Math.max(maxH, h.height);
      if (times[i] < rise || times[i] > set - 1800) continue;
      if (d === today && times[i] < nowS - 3600) continue;
      const score = scoreHour(h);
      if (!best || score > best.score || (score === best.score && (h.wind ?? 99) < (best.wind ?? 99))) best = { ...h, score };
    }
    days.push({
      date: d,
      name: d === today ? 'Today' : new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      maxHeight: maxH,
      best,
      bestLabel: best ? fmtTime(best.t * 1000, tz) : '',
    });
    if (days.length >= 6) break;
  }

  // Today's swell hour by hour, for the day chart.
  const hours = [];
  for (let i = 0; i < times.length; i++) {
    if (localDate(times[i]) !== today) continue;
    const h = at(i);
    hours.push({ t: times[i], height: h.height, score: scoreHour(h) });
  }

  const dayStart = tidePoints.length ? tidePoints[0].t : hours.length ? hours[0].t : nowS;
  const rise = sunrise.get(today);
  const set = sunset.get(today);
  return {
    tz,
    now,
    tide: { points: tidePoints, extremes, nowFrac: tidePoints.length ? (nowS - dayStart) / (24 * 3600) : 0 },
    days,
    hours,
    dayStart,
    nowFrac: (nowS - dayStart) / (24 * 3600),
    sun: { rise: rise ? fmtTime(rise * 1000, tz) : '', set: set ? fmtTime(set * 1000, tz) : '' },
  };
}

