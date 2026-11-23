// Sun, moon, Seattle clock, typical weather and the event calendar. Pure logic: no DOM, no network.
// Everything is computed for Seattle (America/Los_Angeles), never for the visitor's own time zone.

// CLIMATE NORMALS — Sea-Tac 1991–2020. The one table to refresh when NOAA publishes new normals (about 2031).
// % possible sunshine, days with measurable rain, heavy-fog days, mean high / low (°F), days with new snow (scaled to about 5 a year).
export const NORMALS = {
  SUN: [25, 38, 48, 51, 54, 56, 65, 64, 59, 42, 26, 20],
  RAIN: [18, 15, 17, 14, 11, 9, 5, 5, 8, 14, 18, 18],
  FOG: [4.8, 3.2, 2.3, 1.1, 0.7, 0.7, 1.5, 2.5, 4.9, 6.0, 5.5, 5.0],
  HI: [48, 50, 54, 59, 66, 71, 77, 77, 71, 60, 52, 47],
  LO: [38, 38, 40, 44, 49, 54, 57, 58, 54, 47, 41, 37],
  SNOW: [1.5, 1.5, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.2, 1.5],
};
export const NORMALS_PERIOD = '1991–2020';
// The year in which calendar() below was last checked against real schedules.
export const CALENDAR_REVIEWED = 2026;

// TRAFFIC — share of peak I-5 traffic by Seattle hour (0..23, interpolated), for a typical urban freeway north of a
// downtown: weekday commuters drive south (into downtown) in the morning and north in the evening; weekends are flatter
// with a late-morning-to-afternoon hump; the small hours are nearly empty. Shapes, not counts: the page draws at most a
// handful of cars, scaled by these.
const TRAFFIC = {
  weekdaySB: [0.24, 0.16, 0.12, 0.11, 0.16, 0.42, 0.80, 1.00, 0.95, 0.78, 0.68, 0.70, 0.72, 0.72, 0.74, 0.78, 0.80, 0.78, 0.66, 0.56, 0.50, 0.44, 0.38, 0.30],
  weekdayNB: [0.24, 0.16, 0.12, 0.11, 0.14, 0.32, 0.58, 0.72, 0.74, 0.68, 0.66, 0.70, 0.72, 0.74, 0.80, 0.92, 1.00, 1.00, 0.82, 0.64, 0.54, 0.46, 0.38, 0.30],
  weekend:   [0.32, 0.24, 0.17, 0.13, 0.12, 0.16, 0.24, 0.34, 0.46, 0.58, 0.68, 0.74, 0.78, 0.80, 0.80, 0.78, 0.74, 0.68, 0.60, 0.54, 0.50, 0.46, 0.42, 0.36],
};
/** Share of peak traffic (0..1) each way on I-5 at Seattle hour `hour` (fractional) on day of week `dow` (0 = Sunday). */
export function trafficLevel(hour: number, dow: number): { nb: number; sb: number } {
  const h = ((hour % 24) + 24) % 24, i = Math.floor(h), f = h - i, j = (i + 1) % 24;
  const at = (t: number[]) => t[i] + (t[j] - t[i]) * f;
  if (dow === 0 || dow === 6) { const w = at(TRAFFIC.weekend); return { nb: w, sb: w }; }
  return { nb: at(TRAFFIC.weekdayNB), sb: at(TRAFFIC.weekdaySB) };
}

// LIGHT — estimated outdoor illuminance (lux, on the ground, clear sky) from the sun's elevation. Above the horizon:
// direct sun through the Kasten-Young air mass plus a skylight term; below it, log-linear through the standard
// twilight values (≈400 lux at sunset, 3.4 at the end of civil twilight, 0.008 nautical, 0.0008 night). Moonlight is
// ignored. An estimate for the almanac's readout, not a measurement.
const TWILIGHT: [number, number][] = [[0, 400], [-6, 3.4], [-12, 0.008], [-18, 0.0008]];
export function illuminance(el: number): number {
  if (el > 0) {
    const s = Math.sin(el * Math.PI / 180);
    const m = 1 / (s + 0.50572 * Math.pow(el + 6.07995, -1.6364));
    return 128000 * Math.exp(-0.21 * m) * s + 400 + 15000 * Math.sqrt(s);
  }
  for (let i = 0; i + 1 < TWILIGHT.length; i++) {
    const [e0, l0] = TWILIGHT[i], [e1, l1] = TWILIGHT[i + 1];
    if (el >= e1) { const t = (el - e0) / (e1 - e0); return Math.pow(10, Math.log10(l0) + t * (Math.log10(l1) - Math.log10(l0))); }
  }
  return TWILIGHT[TWILIGHT.length - 1][1];
}
/** What the sky is doing at a solar elevation (degrees). */
export function lightPhase(el: number): string {
  return el >= 6 ? 'daylight' : el >= -0.833 ? 'golden hour' : el >= -6 ? 'civil twilight' : el >= -12 ? 'nautical twilight' : el >= -18 ? 'astronomical twilight' : 'night';
}

// TIME-LAPSE and DRAG (owner, 2026-11-22). A day lapse runs 24 h in 30 s; a year lapse steps one day per 100 ms at the
// same Seattle clock time, so the seasons change while the hour stays put (36.5 s for the year).
export const LAPSE_MS = { day: 30000, year: 36500 };
export function lapseMoment(kind: 'day' | 'year', base: number, elapsed: number): number {
  if (kind === 'day') return base + elapsed * (86400000 / LAPSE_MS.day);
  const p = sky.parts(base), d = new Date(Date.UTC(p.y, p.mo - 1, p.d + Math.floor(elapsed / 100)));
  return sky.toUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), p.h, p.mi);
}
/** Dragging the photo: one full width moves twelve hours; right is later. */
export const dragMinutes = (dx: number, width: number): number => Math.round(dx / width * 720);

export const sky: any = {
  _ev: null,
  cl(x) { return Math.max(0, Math.min(1, x)); },
  ss(e0, e1, x) { const t = this.cl((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); },
  // ---------- Seattle clock (never the visitor's) ----------
  parts(ms) {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
      const o: Record<string, string> = {}; f.formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
      const y = +o.year, mo = +o.month, d = +o.day, h = (+o.hour) % 24, mi = +o.minute;
      return { y, mo, d, h, mi, off: Math.round((Date.UTC(y, mo - 1, d, h, mi) - ms) / 60000) };
    } catch (e) {
      const off = this.seattleOffset(ms), t = new Date(ms + off * 60000);
      return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), off };
    }
  },
  seattleOffset(ms) {
    // US rule, used only if the browser has no time-zone data: PDT from 2nd Sunday of March 2:00 to 1st Sunday of November 2:00
    const y = new Date(ms).getUTCFullYear();
    const sun = (m, n) => { const dow = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + (7 - dow) % 7 + 7 * (n - 1); };
    return (ms >= Date.UTC(y, 2, sun(2, 2), 10) && ms < Date.UTC(y, 10, sun(10, 1), 9)) ? -420 : -480;
  },
  toUtc(y, mo, d, h, mi) {
    // Seattle wall-clock time -> absolute time (two passes settle the DST offset)
    let ms = Date.UTC(y, mo - 1, d, h, mi) + 480 * 60000;
    for (let i = 0; i < 2; i++) ms = Date.UTC(y, mo - 1, d, h, mi) - this.parts(ms).off * 60000;
    return ms;
  },
  // ---------- sun and moon ----------
  altaz(ra, dec, ms) {
    const r = Math.PI / 180, lat = 47.6456 * r, lon = -122.3344;
    const n = ms / 86400000 + 2440587.5 - 2451545.0;
    const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
    const H = (gmst * 15 + lon) * r - ra;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H));
    return { el: el / r, az: ((az / r) % 360 + 360) % 360 };
  },
  sun(ms) {
    const r = Math.PI / 180, n = ms / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * r;
    const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * r, eps = (23.439 - 0.0000004 * n) * r;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const o = this.altaz(ra, dec, ms); o.lam = lam; return o;
  },
  moon(ms, sunLam) {
    // low-precision lunar position (good to about a degree, plenty for light and phase)
    const r = Math.PI / 180, d = ms / 86400000 + 2440587.5 - 2451545.0;
    const L = (218.316 + 13.176396 * d) * r, M = (134.963 + 13.064993 * d) * r, F = (93.272 + 13.229350 * d) * r;
    const l = L + 6.289 * r * Math.sin(M), b = 5.128 * r * Math.sin(F), e = 23.4397 * r;
    const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    const o = this.altaz(ra, dec, ms);
    o.illum = (1 - Math.cos(b) * Math.cos(l - sunLam)) / 2;
    o.waxing = Math.sin(l - sunLam) > 0;
    return o;
  },
  moonName(m) {
    const k = m.illum;
    if (k < 0.03) return 'New moon';
    if (k > 0.97) return 'Full moon';
    if (k > 0.45 && k < 0.55) return m.waxing ? 'First quarter' : 'Last quarter';
    return (m.waxing ? 'Waxing ' : 'Waning ') + (k < 0.5 ? 'crescent' : 'gibbous');
  },
  dayEvents(y, mo, d) {
    const key = y + '-' + mo + '-' + d;
    if (this._ev && this._ev.key === key) return this._ev;
    const base = this.toUtc(y, mo, d, 0, 0), els: number[] = [];
    for (let m = 0; m <= 1440; m += 10) els.push(this.sun(base + m * 60000).el);
    const find = (th, up) => {
      for (let i = 0; i < els.length - 1; i++) {
        const a = els[i], b = els[i + 1];
        if (up ? (a < th && b >= th) : (a >= th && b < th)) {
          let lo = i * 10, hi = lo + 10;
          for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2, e = this.sun(base + mid * 60000).el; if (up ? e < th : e >= th) lo = mid; else hi = mid; }
          return (lo + hi) / 2;
        }
      }
      return null;
    };
    let pk = 0; els.forEach((e, i) => { if (e > els[pk]) pk = i; });
    this._ev = { key, find, rise: find(-0.833, true), set: find(-0.833, false), cRise: find(-6, true), cSet: find(-6, false), noon: pk * 10 };
    return this._ev;
  },
  // ---------- calendar ----------
  // EVENT TIMES — the one table to check each year. Minutes are Seattle clock time, counted from midnight.
  calendar() {
    return {
      july4: { mo: 7, d: 4, from: 1340, to: 1362 },        // Seafair fireworks over Lake Union, about 10:20 PM
      newyear: { mo: 1, d: 1, from: 0, to: 10 },           // Space Needle fireworks at midnight
      duckdodge: { dow: 2, doyFrom: 121, doyTo: 258, from: 1140, to: 1260 }   // Tuesdays 7 PM, May to mid-September
    };
  },
  parseMoment(s) {
    const k = /(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || '');
    if (!k) return null;
    const o = { y: +k[1], mo: +k[2], d: +k[3], min: +k[4] * 60 + +k[5] };
    return (o.mo >= 1 && o.mo <= 12 && o.d >= 1 && o.d <= 31 && o.min < 1440) ? o : null;
  },
  // ---------- typical weather ----------
  clim(doy) {
    const { SUN, RAIN, FOG, HI, LO, SNOW } = NORMALS;
    const f = (doy - 15.2) / 30.44, i0 = ((Math.floor(f) % 12) + 12) % 12, i1 = (i0 + 1) % 12, t = f - Math.floor(f);
    const lp = (A) => A[i0] * (1 - t) + A[i1] * t;
    return { sun: lp(SUN), rainDays: lp(RAIN), fogDays: lp(FOG), hi: lp(HI), lo: lp(LO), snowDays: lp(SNOW) };
  },
  hash(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  },
  vnoise(t, seed) { const i = Math.floor(t), f = t - i, u = (1 - Math.cos(f * Math.PI)) / 2; return this.hash(i, seed) * (1 - u) + this.hash(i + 1, seed) * u; },
  weather(ms, p, doy, ev) {
    const c = this.clim(doy), key = p.y * 400 + doy, T = ms / 3600000, hr = p.h + p.mi / 60;
    const snowDay = this.hash(key, 8) < c.snowDays / 30.4;
    const rainy = !snowDay && this.hash(key, 1) < c.rainDays / 30.4;
    const wet = this.ss(0.40, 0.72, this.vnoise(T / 3, 2));
    const rain = rainy ? wet : 0, snowing = snowDay ? wet : 0;
    let cloud = 1 - c.sun / 100 + 0.45 * (this.vnoise(T / 6, 3) - 0.5) + 0.5 * (this.hash(key, 4) - 0.5);
    if (rainy) cloud = Math.max(cloud, 0.85);
    if (snowDay) cloud = Math.max(cloud, 0.9);
    if (rain > 0.05 || snowing > 0.05) cloud = 1;
    if (p.mo >= 5 && p.mo <= 8 && this.hash(key, 7) < 0.5) cloud = Math.max(cloud, 0.9 * this.ss(11.5, 9.5, hr));   // marine stratus mornings
    cloud = this.cl(cloud);
    let fog = 0;
    if (!snowDay && ev.rise != null && this.hash(key, 5) < c.fogDays * 1.8 / 30.4) {
      const sr = ev.rise / 60, burn = 2.5 + 2 * (1 - c.sun / 65);
      fog = this.ss(sr - 6, sr - 3, hr) * this.ss(sr + burn + 1.5, sr + burn, hr) * (0.65 + 0.35 * this.hash(key, 6)) * (1 - rain);
    }
    // late-summer wildfire smoke: some hazy days in August and September
    const haze = (doy > 205 && doy < 275 && !rainy && this.hash(key, 9) < 0.11) ? 0.7 : 0;   // about 8 heavy-smoke days a year
    const sr = ev.rise != null ? ev.rise / 60 : 7.5, peak = 15;
    let shape;
    if (hr >= sr && hr <= peak) shape = (1 - Math.cos(Math.PI * (hr - sr) / (peak - sr))) / 2;
    else { const span = 24 - peak + sr, x = ((hr - peak + 24) % 24) / span; shape = (1 + Math.cos(Math.PI * x)) / 2; }
    let temp = c.lo + (c.hi - c.lo) * shape;
    if (snowDay) temp = 28 + 5 * shape;
    // wind: storms blow from the south; fair summer days from the north. Cloud speed only changes every six hours.
    const summerFair = p.mo >= 5 && p.mo <= 9 && !rainy;
    const speed = this.cl(0.15 + (rainy ? 0.3 : 0) + 0.4 * this.vnoise(T / 5, 11) + ((p.mo >= 11 || p.mo <= 2) ? 0.1 : 0));
    const speedQ = this.cl(0.2 + 0.55 * this.hash(key * 4 + Math.floor(hr / 6), 12) + (rainy ? 0.2 : 0));
    return { cloud, rain, fog, temp, snowCover: snowDay ? 1 : 0, snowing, haze, wind: { speed, speedQ, dir: summerFair ? -1 : 1 } };
  },
  windowsAt(hr) {
    // share of windows lit: offices + homes in the evening, most homes dark after midnight, early risers before dawn
    const x = hr < 12 ? hr + 24 : hr;
    if (x < 17) return 0.85;
    if (x < 23) return 1;
    if (x < 25) return 1 - 0.68 * this.ss(23, 25, x);
    if (x < 29) return 0.32;
    return 0.32 + 0.4 * this.ss(29, 30.5, x);
  },
  fmt(m) {
    m = Math.round(m); m = ((m % 1440) + 1440) % 1440;
    let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + String(mm).padStart(2, '0') + ' ' + ap;
  },
};
