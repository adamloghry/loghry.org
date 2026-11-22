// @ts-nocheck — ported from the design canvas
// The section below the photo: today's light, the year in daylight, and a typical month.
import template from './almanac.html?raw';
import { sky, NORMALS, NORMALS_PERIOD } from './model';
import { View } from './view';

export { template };

export class Almanac extends View {
  constructor(props) { super(props); this.state = { now: Date.now() }; }
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
    const bars = lens.map((d) => {
      const h = 18 + (d.len - mn) / (mx - mn) * 150;
      return { style: 'flex:1 1 0;height:' + h.toFixed(1) + 'px;border-radius:2px 2px 0 0;background:' + (d === today ? '#e8b48a' : 'rgba(239,233,222,.26)') };
    });

    const { SUN, RAIN, HI, LO } = NORMALS;
    const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const inTen = Math.round(RAIN[mo] / dim * 10);
    const typicalLine = 'Highs near ' + HI[mo] + '°F and lows near ' + LO[mo] + '°F. Measurable rain on about ' + inTen + ' days in 10, and sun for ' + SUN[mo] + '% of daylight hours. The sky over the photo follows these odds, hour by hour.';
    const months = SUN.map((s, i) => {
      const on = i === mo;
      return {
        label: MN[i].slice(0, 3), l1: MN[i].slice(0, 1),
        sunStyle: 'flex:1 1 0;border-radius:2px 2px 0 0;height:' + (s / 70 * 110).toFixed(1) + 'px;background:' + (on ? '#e8b48a' : 'rgba(232,180,138,.38)'),
        rainStyle: 'flex:1 1 0;border-radius:2px 2px 0 0;height:' + (RAIN[i] / 31 * 110 * 1.4).toFixed(1) + 'px;background:' + (on ? '#7f97b2' : 'rgba(127,151,178,.38)'),
        labelStyle: 'font-family:JetBrains Mono, ui-monospace, monospace;font-size:11px;text-align:center;color:' + (on ? '#efe9de' : '#a39d93')
      };
    });
    return {
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
