// @ts-nocheck — ported from the design canvas
// The section below the photo: today's light, the year in daylight, and a typical month. Each chart can be inspected
// (owner, 2026-11-22): pointer, touch drag, or keyboard (arrows, Home/End) moves state.hover, and a readout line under
// the chart says what that point is. Without a hover the readouts describe now / today / this month.
import template from './almanac.html?raw';
import { sky, NORMALS, NORMALS_PERIOD, illuminance, lightPhase } from './model';
import { View } from './view';

export { template };

export class Almanac extends View {
  constructor(props) { super(props); this.state = { now: Date.now(), hover: null }; }
  componentDidMount() { this._t = setInterval(() => this.setState({ now: Date.now() }), 60000); }
  componentWillUnmount() { clearInterval(this._t); }
  renderVals() {
    const LAT = 47.6456, LON = -122.3344, rad = Math.PI / 180;
    const sp = sky.parts(this.state.now), sea = { y: sp.y, mo: sp.mo - 1, d: sp.d, h: sp.h, mi: sp.mi, off: sp.off }, off = sea.off;
    const y = sea.y, mo = sea.mo;
    const N = Math.floor((Date.UTC(y, mo, sea.d) - Date.UTC(y, 0, 0)) / 86400000);
    const sol = (n) => {
      const g = 2 * Math.PI / 365 * (n - 1);
      const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      const ha = (z) => Math.acos(Math.cos(z * rad) / (Math.cos(LAT * rad) * Math.cos(dec)) - Math.tan(LAT * rad) * Math.tan(dec)) / rad;
      const h = ha(90.833), hc = ha(96);
      return { dec, rise: 720 - 4 * (LON + h) - eq, set: 720 - 4 * (LON - h) - eq, cRise: 720 - 4 * (LON + hc) - eq, cSet: 720 - 4 * (LON - hc) - eq, len: 8 * h };
    };
    const t = sol(N), yd = sol(N - 1);
    const L = (m) => ((m + off) % 1440 + 1440) % 1440;
    const fmt = (m) => { m = Math.round(m); let hh = Math.floor(m / 60), mm = m % 60; const ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12; return hh + ':' + String(mm).padStart(2, '0') + ' ' + ap; };
    const dur = (m) => { m = Math.round(m); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
    const dsec = Math.round((t.len - yd.len) * 60);
    const delta = (dsec < 0 ? '−' : '+') + Math.floor(Math.abs(dsec) / 60) + 'm ' + String(Math.abs(dsec) % 60).padStart(2, '0') + 's';
    const pct = (m) => (L(m) / 1440 * 100).toFixed(2) + '%';
    const night = '#10141f', twi = '#5a4f6a', warm = '#c88a68', day = '#9fb0bd';
    const noon = (L(t.rise) + L(t.set)) / 2 / 1440 * 100;
    const dayGradient = 'linear-gradient(90deg, ' + night + ' 0%, ' + night + ' ' + pct(t.cRise) + ', ' + twi + ' ' + pct((t.cRise + t.rise) / 2) + ', ' + warm + ' ' + pct(t.rise) + ', ' + day + ' ' + noon.toFixed(2) + '%, ' + warm + ' ' + pct(t.set) + ', ' + twi + ' ' + pct((t.set + t.cSet) / 2) + ', ' + night + ' ' + pct(t.cSet) + ', ' + night + ' 100%)';
    const nowMin = sea.h * 60 + sea.mi;
    const nowStyle = 'position:absolute;top:-6px;bottom:-6px;width:2px;background:#f4efe6;box-shadow:0 0 0 3px rgba(11,13,16,.6);left:' + (nowMin / 1440 * 100).toFixed(2) + '%';
    const lens = [];
    for (let n = 1; n <= 365; n += 5) lens.push({ n, len: sol(n).len });
    const mn = Math.min(...lens.map((d) => d.len)), mx = Math.max(...lens.map((d) => d.len));
    const today = lens.reduce((a, d) => Math.abs(d.n - N) < Math.abs(a.n - N) ? d : a, lens[0]);
    const hv = this.state.hover;
    const bars = lens.map((d, i) => {
      const h = 18 + (d.len - mn) / (mx - mn) * 150;
      const lit = hv && hv.chart === 'year' && hv.i === i;
      return { style: 'flex:1 1 0;height:' + h.toFixed(1) + 'px;border-radius:2px 2px 0 0;transition:background-color .12s;background:' + (lit ? '#f4efe6' : d === today ? '#e8b48a' : 'rgba(239,233,222,.26)') };
    });

    const { SUN, RAIN, HI, LO, FOG } = NORMALS;
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const inTen = Math.round(RAIN[mo] / dim * 10);
    const typicalLine = 'Highs near ' + HI[mo] + '°F and lows near ' + LO[mo] + '°F. Measurable rain on about ' + inTen + ' days in 10, and sun for ' + SUN[mo] + '% of daylight hours. The sky over the photo follows these odds, hour by hour.';
    const months = SUN.map((s, i) => {
      const on = i === mo || (hv && hv.chart === 'month' && hv.i === i);
      return {
        label: MN[i].slice(0, 3), l1: MN[i].slice(0, 1),
        sunStyle: 'flex:1 1 0;border-radius:2px 2px 0 0;height:' + (s / 70 * 110).toFixed(1) + 'px;background:' + (on ? '#e8b48a' : 'rgba(232,180,138,.38)'),
        rainStyle: 'flex:1 1 0;border-radius:2px 2px 0 0;height:' + (RAIN[i] / 31 * 110 * 1.4).toFixed(1) + 'px;background:' + (on ? '#7f97b2' : 'rgba(127,151,178,.38)'),
        labelStyle: 'font-family:JetBrains Mono, ui-monospace, monospace;font-size:11px;text-align:center;color:' + (on ? '#efe9de' : '#a39d93')
      };
    });
    // ----- readouts -----
    const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sig = (x) => x >= 100 ? (Math.round(x / Math.pow(10, Math.floor(Math.log10(x)) - 1)) * Math.pow(10, Math.floor(Math.log10(x)) - 1)).toLocaleString('en-US') : x >= 10 ? String(Math.round(x)) : x >= 1 ? x.toFixed(1) : x.toPrecision(1);
    const feel = (lx) => lx >= 20000 ? 'full daylight' : lx >= 1000 ? 'an overcast day' : lx >= 100 ? 'sunrise or sunset light' : lx >= 10 ? 'deep dusk' : lx >= 1 ? 'street lights on' : lx >= 0.05 ? 'moonlight at best' : 'starlight';
    const dayAt = (m) => {
      const ms = sky.toUtc(y, mo + 1, sea.d, Math.floor(m / 60), m % 60), el = sky.sun(ms).el, tz = sky.parts(ms).off === -420 ? 'PDT' : 'PST';
      const clear = illuminance(el), share = SUN[mo] / 100, typical = clear * (share + (1 - share) * 0.25);
      const lux = el > -6 ? '≈ ' + sig(clear) + ' lux under a clear sky, ≈ ' + sig(typical) + ' lux on a typical ' + MN[mo] + ' sky' : '≈ ' + sig(clear) + ' lux';
      return fmt(m) + ' ' + tz + ' · ' + lightPhase(el) + ', sun ' + (el >= 0 ? Math.round(el) + '° up' : Math.round(-el) + '° below the horizon') + ' · ' + lux + ' · ' + feel(clear);
    };
    const yearAt = (i, isToday) => {
      const n = lens[i].n, dt = new Date(Date.UTC(y, 0, n)), m1 = dt.getUTCMonth(), d1 = dt.getUTCDate();
      const end = new Date(Date.UTC(y, 0, Math.min(n + 4, 365))), span = MS[m1] + ' ' + d1 + (isToday ? '' : '–' + (end.getUTCMonth() === m1 ? '' : MS[end.getUTCMonth()] + ' ') + end.getUTCDate());
      const so = isToday ? t : sol(n), offn = isToday ? off : sky.parts(sky.toUtc(y, m1 + 1, d1, 12, 0)).off;
      const Ln = (m) => ((m + offn) % 1440 + 1440) % 1440, diff = Math.round(so.len - t.len);
      return (isToday ? 'Today, ' + MS[mo] + ' ' + sea.d : span) + ' · ' + dur(so.len) + ' of daylight · sunrise ' + fmt(Ln(so.rise)) + ' · sunset ' + fmt(Ln(so.set)) + ' ' + (offn === -420 ? 'PDT' : 'PST') + (isToday ? '' : ' · ' + (diff < 0 ? '−' : '+') + (Math.abs(diff) < 60 ? Math.abs(diff) + 'm' : dur(Math.abs(diff))) + ' vs today');
    };
    const monthAt = (i) => MN[i] + ' · highs near ' + HI[i] + '°F, lows near ' + LO[i] + '°F · sun ' + SUN[i] + '% of daylight hours · rain on ' + RAIN[i] + ' days · fog on about ' + Math.round(FOG[i]) + ' day' + (Math.round(FOG[i]) === 1 ? '' : 's');
    const dayRead = hv && hv.chart === 'day' ? dayAt(hv.i) : 'Now, ' + dayAt(nowMin);
    const yearRead = hv && hv.chart === 'year' ? yearAt(hv.i, false) : yearAt(lens.indexOf(today), true);
    const monthRead = monthAt(hv && hv.chart === 'month' ? hv.i : mo);
    const dayCursorStyle = hv && hv.chart === 'day' ? 'position:absolute;top:-4px;bottom:-4px;width:1px;background:rgba(244,239,230,.85);pointer-events:none;left:' + (hv.i / 1440 * 100).toFixed(2) + '%' : 'display:none';
    // ----- input: pointer (mouse, pen, touch drag), keyboard -----
    const SIZE = { day: 1440, year: lens.length, month: 12 }, HOME = { day: nowMin, year: lens.indexOf(today), month: mo };
    const at = (chart) => (e) => {
      const r = e.currentTarget.getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
      this.setState({ hover: { chart, i: Math.max(0, Math.min(SIZE[chart] - 1, Math.floor(f * SIZE[chart]))) } });
    };
    const key = (chart) => (e) => {
      const cur = this.state.hover && this.state.hover.chart === chart ? this.state.hover.i : HOME[chart];
      const step = chart === 'day' ? (e.shiftKey ? 60 : 15) : 1;
      const next = { ArrowRight: cur + step, ArrowLeft: cur - step, Home: 0, End: SIZE[chart] - 1 }[e.key];
      if (next === undefined) { if (e.key === 'Escape') this.setState({ hover: null }); return; }
      e.preventDefault();
      this.setState({ hover: { chart, i: Math.max(0, Math.min(SIZE[chart] - 1, next)) } });
    };
    return {
      dayRead, yearRead, monthRead, dayCursorStyle,
      onDayMove: at('day'), onYearMove: at('year'), onMonthMove: at('month'),
      onDayKey: key('day'), onYearKey: key('year'), onMonthKey: key('month'),
      onLeave: () => this.setState({ hover: null }),
      dateLabel: (() => { const dt = new Date(Date.UTC(y, mo, sea.d, 12)); return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getUTCDay()] + ', ' + MN[mo] + ' ' + sea.d + ', ' + y; })() + ' · ' + (off === -420 ? 'PDT' : 'PST'),
      sunrise: fmt(L(t.rise)), sunset: fmt(L(t.set)), dayLen: dur(t.len), delta,
      civilDawn: fmt(L(t.cRise)), civilDusk: fmt(L(t.cSet)), maxElev: (90 - LAT + t.dec / rad).toFixed(0) + '°',
      dayGradient, nowStyle, bars,
      yearRange: y + ' · shortest ' + dur(mn) + ' · longest ' + dur(mx),
      monthName: MN[mo], typicalLine, months,
      photoCredit: this.props.photoCredit, photoUrl: this.props.photoUrl, normalsPeriod: NORMALS_PERIOD
    };
  }
}
