// @ts-nocheck — ported from the design canvas; the model it calls is unit-tested
// The hero: turns the model's numbers into layer opacities, colours and moving things, and draws them through the template.
import template from './hero.html?raw';
import { sky, trafficLevel, lapseMoment, dragMinutes, LAPSE_MS, cloudVelocity, ferriesAt, seaplaneAt, aircraftAt, FERRY_VISIBLE_S, AIRCRAFT_VISIBLE_S, officeFloorsLit } from './model';
import { View } from './view';
import { assets } from './assets';
import i5Lanes from './i5_lanes.json';
import beaconList from './beacons.json';   // red obstruction lights on real structures (bake/osm/beacons.py)   // map data (c) OpenStreetMap contributors, ODbL

export { template };

export class Hero extends View {
  constructor(props) {
    super(props);
    this.state = { now: Date.now(), minute: null, moment: sky.parseMoment(props.moment), scrub: false, hide: false, gear: false, hidden: false, copied: null, lapse: null, lapseNow: 0 };
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.box = props.box();
  }
  componentDidMount() {
    this._t = setInterval(() => this.setState({ now: Date.now() }), 30000);
    this.driftClouds();
    // stop all motion while the tab is in the background
    document.addEventListener('visibilitychange', () => this.setState({ hidden: document.hidden, now: Date.now() }));
    addEventListener('resize', () => { this.box = this.props.box(); this.__draw(); });
  }

  // ----- clouds: moved here rather than by CSS so a change of wind eases instead of jumping (owner, 2026-11-22) -----
  driftClouds() {
    const host = this.props.host;
    if (!host || this.reduced || typeof requestAnimationFrame !== 'function') return;
    let last = performance.now(), v = this._cloudTarget || 0, x1 = sky.hash(1, 31), x2 = sky.hash(2, 31);
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!this.state.hidden) {
        v += ((this._cloudTarget || 0) - v) * Math.min(1, dt / 8);             // ease toward the wind over ~8 s
        x1 = (((x1 + v * dt) % 1) + 1) % 1; x2 = (((x2 + v * dt * 260 / 420) % 1) + 1) % 1;   // lower layer drifts slower
        for (const el of host.querySelectorAll('[data-cloud="1"]')) el.style.transform = 'translateX(' + (-50 * x1).toFixed(3) + '%)';
        for (const el of host.querySelectorAll('[data-cloud="2"]')) el.style.transform = 'translateX(' + (-50 * x2).toFixed(3) + '%)';
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // ----- time-lapse -----
  freezeAt(ms) { const q = sky.parts(ms); return { lapse: null, minute: null, moment: { y: q.y, mo: q.mo, d: q.d, min: q.h * 60 + q.mi } }; }
  toggleLapse(kind, ms) {
    if (this.state.lapse) { const was = this.state.lapse.kind; this.setState(this.freezeAt(ms)); if (was === kind) return; }
    const t0 = performance.now();
    this._coast = null;
    this.setState({ lapse: { kind, t0, base: ms }, lapseNow: t0, scrub: true });
    const tick = () => {
      const L = this.state.lapse; if (!L || L.t0 !== t0) return;
      const now = performance.now();
      if (now - t0 >= LAPSE_MS[kind]) { this.setState(this.freezeAt(lapseMoment(kind, L.base, LAPSE_MS[kind]))); return; }
      this.setState({ lapseNow: now }); requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // ----- drag to scrub, with a little momentum -----
  dragStart(e, nowMin) {
    this._coast = null;
    this._drag = { x0: e.clientX, y0: e.clientY, min0: nowMin, w: (e.currentTarget && e.currentTarget.getBoundingClientRect().width) || this.box.w, active: false, id: e.pointerId, target: e.currentTarget, lastX: e.clientX, lastT: performance.now(), v: 0 };
  }
  dragMove(e) {
    const D = this._drag; if (!D) return;
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
    if (!D.active) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      D.active = true; try { D.target.setPointerCapture(D.id); } catch (_) { /* synthetic events */ }
      if (this.state.lapse) this.setState({ lapse: null });
    }
    const t = performance.now(), dt = Math.max(1, t - D.lastT);
    D.v = 0.7 * D.v + 0.3 * (dragMinutes(e.clientX - D.lastX, D.w) / dt); D.lastX = e.clientX; D.lastT = t;
    this.setState({ minute: ((D.min0 + dragMinutes(dx, D.w)) % 1440 + 1440) % 1440, scrub: true });
  }
  dragEnd() {
    const D = this._drag; this._drag = null;
    if (!D || !D.active || this.reduced || Math.abs(D.v) < 0.01) return;
    let v = D.v, last = performance.now(); const token = {}; this._coast = token;   // minutes per ms, decaying
    const coast = () => {
      if (this._coast !== token) return;
      const now = performance.now(), dt = now - last; last = now;
      v *= Math.pow(0.9, dt / 16); if (Math.abs(v) < 0.002) return;
      this.setState({ minute: (((this.state.minute ?? 0) + v * dt) % 1440 + 1440) % 1440 }); requestAnimationFrame(coast);
    };
    requestAnimationFrame(coast);
  }

  P(pts) { return 'M' + pts.map(([x, y]) => (x * 1440).toFixed(1) + ' ' + (y * 1440).toFixed(1)).join(' L'); }
  buildMovers(still) {
    if (this._mv) return this._mv;
    const ps = still ? ';animation-play-state:paused' : '';
    // I-5 and Aurora: one path per direction, offset to the driver's right (US traffic keeps right), narrowing with
    // distance like the baked streaks in bake/scripts/lights.py. Seen from the north: northbound (toward the camera,
    // headlights) runs on the left/east, southbound (toward downtown, taillights) on the right/west.
    const AURORA = [[0.905, 0.3696], [0.95, 0.3806], [0.98, 0.3906], [1.02, 0.4006]];
    // off: a number (scaled by perspective) or a function of screen y giving the offset already in perspective
    const lane = (pts, off) => pts.map((q, i) => {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, s = Math.min(1, Math.max(0.035, (q[1] - 0.12) / 0.88));
      const o = typeof off === 'function' ? off(q[1]) : off * s;
      return [q[0] - dy / n * o, q[1] + dx / n * o];        // the driver's right, in screen coordinates
    });
    // I-5's two carriageways from OpenStreetMap, projected through the camera fitted to the photo and cut where the
    // freeway disappears behind downtown (bake/osm/lanes.py). Stage pixels; northbound runs toward the camera.
    const toPath = (pts) => 'M' + pts.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join(' L');
    const nb = toPath(i5Lanes.nb), sb = toPath(i5Lanes.sb);
    const an = this.P(lane(AURORA, 0.0018)), as = this.P(lane([...AURORA].reverse(), 0.0018));
    let sd = 9; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    // Owner, 2026-11-22: subtler traffic. Small, dim points (were 4/3 px with a 6 px glow at .65-.75), fewer and slower.
    const car = (path, kf, ease, dur, delay, head) => 'position:absolute;left:0;top:0;width:' + (head ? 3 : 2) + 'px;height:' + (head ? 3 : 2) + 'px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:' + (head ? '#e8ebf2' : '#e0402e') + ';box-shadow:0 0 3px 1px ' + (head ? 'rgba(240,244,255,.4)' : 'rgba(255,50,30,.38)') + ';offset-path:path(\'' + path + '\');offset-rotate:0deg;animation:' + kf + ' ' + dur + 's ' + ease + ' infinite;animation-delay:-' + delay.toFixed(2) + 's';
    // By day the same cars are car-coloured bodies (owner, 2026-11-22: a realistic city by day too): same path and timing
    // as their lights, so at dusk each car becomes its own headlights. Colours follow a typical US mix, muted for the
    // haze; their own stream (sd2) so the boats below keep their randomness.
    const BODY = [['#e9e9e6', 0.25], ['#1d1f22', 0.19], ['#6e7176', 0.18], ['#b9bcc0', 0.11], ['#3a5378', 0.10], ['#8e2a26', 0.09], ['#a59a85', 0.05], ['#44584a', 0.03]];
    let sd2 = 4242; const rnd2 = () => { sd2 = (sd2 * 16807) % 2147483647; return sd2 / 2147483647; };
    const body = () => { let u = rnd2(); for (const [c, w] of BODY) { if ((u -= w) < 0) return c; } return BODY[0][0]; };
    const dayCar = (path, kf, ease, dur, delay) => 'position:absolute;left:0;top:0;width:3px;height:2px;margin:-1px 0 0 -1.5px;border-radius:1px;background:' + body() + ';box-shadow:0 1px 1px rgba(0,0,0,.35);offset-path:path(\'' + path + '\');offset-rotate:auto;animation:' + kf + ' ' + dur + 's ' + ease + ' infinite;animation-delay:-' + delay.toFixed(2) + 's';
    // Every car that can ever be on the road at the busiest hour; renderVals() hides all but the hour's share.
    const cars = [], dayOnly = [];
    // extra: day-only cars, interleaved with the twins. By day muted bodies can be denser than lights at night (owner:
    // realistic by day, subtle lights by night); they fade with the day layer at dusk.
    const fleet = (road, dir, n, path, kf, ease, dur, head, extra = 0) => {
      for (let i = 0; i < n; i++) {
        const delay = (i + rnd() * 0.7) * dur / n;
        cars.push({ road, dir, i, n, style: car(path, kf, ease, dur, delay, head), dayStyle: dayCar(path, kf, ease, dur, delay) });
      }
      for (let i = 0; i < extra; i++) dayOnly.push({ road, dir, i, n: extra, dayStyle: dayCar(path, kf, ease, dur, (i + 0.15 + rnd2() * 0.7) * dur / extra) });
    };
    fleet('i5', 'nb', 16, nb, 'lk-in', 'cubic-bezier(.55,0,.9,.6)', 91, true, 24);     // 91/97 s a pass (owner: 30% slower than 64/68 s)
    fleet('i5', 'sb', 16, sb, 'lk-out', 'cubic-bezier(.1,.4,.45,1)', 97, false, 24);
    fleet('aurora', 'nb', 3, an, 'lk-in', 'linear', 14, true, 3);
    fleet('aurora', 'sb', 3, as, 'lk-out', 'linear', 14, false, 3);

    // boats on the lake and the Ship Canal: slow, with a wake by day and a single light by night
    const lanes = [
      [[0.42, 0.52], [0.45, 0.47], [0.50, 0.42], [0.54, 0.36], [0.53, 0.315]],
      [[1.01, 0.445], [0.90, 0.447], [0.80, 0.44], [0.70, 0.425], [0.62, 0.40], [0.56, 0.37]],
      [[0.495, 0.318], [0.47, 0.35], [0.455, 0.42], [0.43, 0.50], [0.40, 0.56]],
      [[0.60, 0.39], [0.70, 0.435], [0.82, 0.45], [0.93, 0.452], [1.01, 0.45]]
    ];
    const boats = [];
    [[0, 310, 40], [1, 380, 150], [2, 340, 95], [3, 420, 260], [1, 380, 330], [0, 310, 205], [3, 420, 60], [2, 340, 250]].forEach(([li, dur, delay]) => {
      boats.push({
        style: 'position:absolute;left:0;top:0;width:0;height:0;offset-path:path(\'' + this.P(lanes[li]) + '\');offset-rotate:auto;animation:lk-loop ' + dur + 's linear infinite;animation-delay:-' + delay + 's' + ps,
        wake: 'position:absolute;right:1px;top:-1px;width:26px;height:2px;border-radius:2px;background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75))',
        hull: 'position:absolute;left:-3px;top:-2px;width:6px;height:3px;border-radius:2px;background:#ffffff;box-shadow:0 0 4px 1px rgba(255,255,255,.5)'
      });
    });

    // Duck Dodge: a lap of Lake Union, counterclockwise, on summer Tuesday evenings
    const lap = [[0.455, 0.452], [0.50, 0.447], [0.555, 0.427], [0.583, 0.388], [0.563, 0.347], [0.515, 0.327], [0.468, 0.337], [0.442, 0.37], [0.437, 0.41], [0.455, 0.452]];
    const lapD = this.P(lap) + ' Z', sails = [];
    for (let i = 0; i < 34; i++) {
      const dur = 250 + Math.floor(rnd() * 130), delay = rnd() * dur, off = (rnd() - 0.5) * 22, off2 = (rnd() - 0.5) * 14, h = 5 + Math.floor(rnd() * 4);
      sails.push({
        style: 'position:absolute;left:0;top:0;width:0;height:0;offset-path:path(\'' + lapD + '\');offset-rotate:0deg;animation:lk-loop ' + dur + 's linear infinite;animation-delay:-' + delay.toFixed(1) + 's' + ps,
        sail: 'position:absolute;left:' + off.toFixed(0) + 'px;top:' + (off2 - h).toFixed(0) + 'px;width:0;height:0;border-left:' + (h * 0.32).toFixed(1) + 'px solid transparent;border-right:' + (h * 0.32).toFixed(1) + 'px solid transparent;border-bottom:' + h + 'px solid #fbfaf6;filter:drop-shadow(0 2px 1px rgba(0,0,0,.4))'
      });
    }

    // fireworks: bursts are dots on a ring, drawn with box-shadow and scaled up as they fade
    const burst = (x, y, R, col, delay, dur) => {
      const sh = [];
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; sh.push((Math.cos(a) * R).toFixed(1) + 'px ' + (Math.sin(a) * R).toFixed(1) + 'px 0 ' + (R > 40 ? 1.3 : 0.7) + 'px ' + col); }
      for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; sh.push((Math.cos(a) * R * 0.55).toFixed(1) + 'px ' + (Math.sin(a) * R * 0.55).toFixed(1) + 'px 0 ' + (R > 40 ? 1 : 0.5) + 'px ' + col); }
      sh.push('0 0 ' + (R * 0.7).toFixed(0) + 'px ' + (R * 0.18).toFixed(0) + 'px ' + col.replace('rgb', 'rgba').replace(')', ',.3)'));
      return { style: 'position:absolute;left:' + (x * 1440).toFixed(0) + 'px;top:' + (y * 1440).toFixed(0) + 'px;width:2px;height:2px;border-radius:50%;opacity:0;box-shadow:' + sh.join(',') + ';animation:lk-burst ' + dur + 's ease-out infinite;animation-delay:-' + delay.toFixed(2) + 's' + ps };
    };
    const FW = ['rgb(255,236,200)', 'rgb(255,120,110)', 'rgb(140,200,255)', 'rgb(255,200,90)', 'rgb(190,255,170)', 'rgb(255,150,230)'];
    const july4 = [], newyear = [];
    for (let i = 0; i < 6; i++) july4.push(burst(0.535 + (rnd() - 0.5) * 0.15, 0.33 + (rnd() - 0.5) * 0.09, 46 + rnd() * 40, FW[i % 6], 0.6 + i * 0.75, 4.5));
    for (let i = 0; i < 6; i++) newyear.push(burst(0.749 + (rnd() - 0.5) * 0.035, 0.168 + (rnd() - 0.5) * 0.03, 13 + rnd() * 15, FW[i % 6], 0.5 + i * 0.6, 3.6));

    const planeS = this.P([[0.560, 0.452], [0.545, 0.41], [0.530, 0.36], [0.522, 0.315], [0.520, 0.285], [0.528, 0.245], [0.545, 0.205]]);
    const planeN = this.P([[0.522, 0.300], [0.530, 0.36], [0.545, 0.41], [0.560, 0.452], [0.585, 0.50], [0.63, 0.57], [0.70, 0.66]]);
    this._mv = { cars, dayOnly, boats, sails, july4, newyear, planeS, planeN };
    return this._mv;
  }

  renderVals() {
    const st = this.state, P = this.props, still = this.reduced;
    const skyMode = P.sky || 'auto', lightStyle = P.lightStyle || 'photo', moonMode = P.moon || 'auto', eventMode = P.event || 'auto';
    const hideText = !!st.hide, gearOpen = !!st.gear;

    // ----- fit: the 1440 × 1440 photo stage covers the hero box, keeping the lake and downtown in view -----
    const W = this.box.w, H = this.box.h, portrait = H > W;
    const fitS = Math.max(W, H) / 1440, size = 1440 * fitS;
    const ox = Math.min(0, Math.max(W - size, W / 2 - 0.58 * size)), oy = Math.min(0, Math.max(H - size, H / 2 - 0.37 * size));
    const stageStyle = 'position:absolute;left:0;top:0;width:1440px;height:1440px;transform-origin:0 0;transform:translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px) scale(' + fitS.toFixed(4) + ')';

    // ----- which moment are we drawing? always in Seattle time -----
    let p = sky.parts(st.now);
    let y = p.y, mo = p.mo, d = p.d, h = p.h, mi = p.mi;
    const moment = st.moment;
    if (moment) { y = moment.y; mo = moment.mo; d = moment.d; }
    let fixedMin = moment ? moment.min : null;
    if (st.minute != null) fixedMin = st.minute;
    if (fixedMin != null) { h = Math.floor(fixedMin / 60) % 24; mi = Math.round(fixedMin % 60); }
    let ms = (fixedMin != null || moment) ? sky.toUtc(y, mo, d, h, mi) : st.now;
    if (st.lapse) ms = lapseMoment(st.lapse.kind, st.lapse.base, st.lapseNow - st.lapse.t0);
    p = sky.parts(ms);
    // Tell the page which moment is on show (null when live), so the almanac can follow it. Only on change.
    const shown = (fixedMin != null || moment || st.lapse) ? ms : null;
    if (P.onMoment && shown !== this._shown) { this._shown = shown; queueMicrotask(() => P.onMoment(shown)); }
    const doy = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 0)) / 86400000);
    const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
    const ev = sky.dayEvents(p.y, p.mo, p.d);
    const traffic = trafficLevel(p.h + p.mi / 60, dow);
    const s = sky.sun(ms), el = s.el, pm = s.az > 180, hr = p.h + p.mi / 60, nowMin = p.h * 60 + p.mi;
    let mn = sky.moon(ms, s.lam);
    if (moonMode === 'full') mn = { el: 42, az: 186, illum: 1, waxing: true };
    if (moonMode === 'new') mn = { el: -20, az: 200, illum: 0, waxing: true };

    // ----- sky -----
    let wx = sky.weather(ms, p, doy, ev);
    const O = { clear: { cloud: 0.06 }, partly: { cloud: 0.45 }, cloudy: { cloud: 0.95 }, rain: { cloud: 1, rain: 0.85 }, shower: { cloud: 0.6, rain: 0.3 }, fog: { cloud: 0.7, fog: 0.9 }, snow: { cloud: 1, snowCover: 1, snowing: 0.8, temp: 31 }, haze: { cloud: 0.12, haze: 0.8 } }[skyMode];
    if (O) wx = Object.assign({}, wx, { rain: 0, fog: 0, snowCover: 0, snowing: 0, haze: 0 }, O);
    const cloud = wx.cloud, rain = wx.rain, fog = wx.fog, snowing = wx.snowing, snowCover = wx.snowCover, haze = wx.haze, wind = wx.wind;
    // clouds drift with the wind (driftClouds() eases toward this); a time-lapse speeds them up, capped so they streak, not flicker
    this._cloudTarget = cloudVelocity(wind) * (st.lapse ? Math.min(25, 86400000 / LAPSE_MS[st.lapse.kind]) : 1);

    // ----- light: five graded plates, crossfaded by the sun's elevation -----
    const w = [0, 0, 0, 0, 0], G = pm ? 2 : 1;
    if (el >= 10) w[0] = 1;
    else if (el >= 2) { w[0] = 1; w[G] = sky.ss(10, 2, el) * (1 - 0.55 * cloud); }
    else if (el >= -2) { w[0] = 1; w[G] = 1 - 0.55 * cloud; w[3] = sky.ss(2, -2, el); }
    else if (el >= -4) w[3] = 1;
    else { w[3] = 1; w[4] = sky.ss(-4, -10, el); }
    // moonlight: a bright moon lets some of the blue-hour plate show through the night plate
    const moonLight = mn.illum * sky.ss(-1, 14, mn.el) * (1 - 0.8 * cloud) * (1 - fog) * w[4];
    w[4] *= 1 - 0.38 * moonLight;
    let eff = [0, 0, 0, 0, 0];
    w.forEach((wi, i) => { eff = eff.map((v, j) => v * (1 - wi) + (j === i ? wi : 0)); });
    const mix = (cols) => { const o = [0, 0, 0]; cols.forEach((c, i) => { const k = eff[i]; o[0] += c[0] * k; o[1] += c[1] * k; o[2] += c[2] * k; }); return o; };
    const rgb = (c) => 'rgb(' + c.map((v) => Math.round(v)).join(',') + ')';
    const dayish = eff[0] + eff[1] + eff[2], nightish = eff[4];
    const vis = w.map((wi, i) => wi > 0.002 && !w.slice(i + 1).some((wj) => wj >= 0.999));
    const nightSolid = w[4] >= 0.999;

    const on = sky.ss(4 + 3 * cloud, -5, el);
    const win = sky.windowsAt(hr);
    const drawn = lightStyle === 'drawn';
    const lightK = drawn ? 0.72 : 1;
    const cloudCol = mix([[236, 238, 241], [246, 214, 186], [246, 214, 186], [122, 126, 150], [52 + 26 * cloud * on, 50 + 18 * cloud * on, 58 + 8 * cloud * on]]);
    const fogCol = mix([[226, 230, 234], [240, 216, 194], [240, 216, 194], [132, 138, 160], [70, 64, 62]]);
    const sunAmp = Math.exp(-Math.pow(el / 5, 2)) * (1 - 0.7 * cloud) * (1 + 0.5 * haze);
    const azX = (az) => Math.max(-0.4, Math.min(1.4, 0.5 + (((az - 180 + 540) % 360) - 180) / 48));   // frame is about 48° wide, centred on due south
    const sc = haze > 0.3 ? '255,120,70' : el > 0 ? '255,168,92' : (el > -4 ? '255,132,118' : '150,112,176');
    const sunGlow = 'radial-gradient(55% 30% at ' + (azX(s.az) * 100).toFixed(1) + '% 12%, rgba(' + sc + ',.42), rgba(' + sc + ',0))';
    const moonGlow = 'radial-gradient(40% 22% at ' + (azX(mn.az) * 100).toFixed(1) + '% 10%, rgba(190,205,240,.3), rgba(190,205,240,0))';

    // glitter path on the water, under the sun by day or the moon by night
    const inView = (az) => sky.ss(150, 160, az) * sky.ss(210, 200, az);
    const sunGl = sky.ss(3, 9, el) * sky.ss(42, 26, el) * Math.pow(1 - cloud, 1.5) * (1 - fog) * inView(s.az) * (1 - 0.6 * haze);
    // a glint needs a clear line to the moon, as the sun's does (moonLight keeps 20% under cloud for the diffuse glow)
    const moonGl = mn.illum * sky.ss(-1, 14, mn.el) * Math.pow(1 - cloud, 1.5) * (1 - fog) * w[4] * inView(mn.az) * sky.ss(3, 12, mn.el);
    const glit = Math.max(sunGl, moonGl), glX = (azX(sunGl >= moonGl ? s.az : mn.az) * 100).toFixed(1);
    const glC = sunGl >= moonGl ? (el < 12 ? '255,214,160' : '255,250,236') : '206,220,255';
    const glitterGradient = 'linear-gradient(90deg, rgba(0,0,0,0) calc(' + glX + '% - 80px), rgba(0,0,0,.9) ' + glX + '%, rgba(0,0,0,0) calc(' + glX + '% + 80px))', glitterColor = 'rgb(' + glC + ')';

    // rainbow: a ring 42° around the point opposite the sun. Looking south, only one leg can enter the frame,
    // and only when the sun is low in the north-east or north-west: summer, near sunrise or sunset, during a sunlit shower.
    let rainbowOpacity = 0, rainbowStyle = '';
    if (el > 0.3 && el < 38 && rain > 0.04 && rain < 0.6) {
      const wHalf = Math.acos(Math.min(1, Math.cos(42 * Math.PI / 180) / Math.cos(el * Math.PI / 180))) * 180 / Math.PI;
      const anti = (s.az + 180) % 360, legIn = Math.max(inView((anti - wHalf + 360) % 360), inView((anti + wHalf) % 360));
      const showery = O ? 1 : (sky.hash(p.y * 400 + doy, 13) < 0.5 ? 1 : 0);
      rainbowOpacity = 0.5 * legIn * showery * sky.ss(0.3, 3, el) * (1 - fog);
      const ppd = 30, cx = 720 + ((((anti - 180 + 540) % 360) - 180)) * ppd, cy = 187 + el * ppd, Rr = 52 * ppd;   // box reaches the 51° secondary bow
      rainbowStyle = 'position:absolute;left:' + (cx - Rr).toFixed(0) + 'px;top:' + (cy - Rr).toFixed(0) + 'px;width:' + (2 * Rr) + 'px;height:' + (2 * Rr) + 'px;border-radius:50%;background:radial-gradient(closest-side, rgba(255,255,255,0) 60%, rgba(255,255,255,.10) 78.6%, rgba(160,120,255,.5) 79.4%, rgba(100,160,255,.6) 80%, rgba(110,225,170,.62) 80.6%, rgba(240,235,120,.66) 81.2%, rgba(255,170,90,.66) 81.8%, rgba(255,95,95,.55) 82.4%, rgba(255,95,95,0) 83.2%, rgba(0,0,0,0) 95.6%, rgba(255,110,110,.16) 96.6%, rgba(240,230,130,.16) 97.5%, rgba(120,170,255,.15) 98.4%, rgba(120,170,255,0) 99.4%);filter:blur(5px)';
    }

    // seasons: foliage tint on the leafy (non-conifer) canopy
    const autumn = Math.exp(-Math.pow((doy - 297) / 20, 2));
    const bare = Math.max(sky.ss(320, 345, doy), sky.ss(88, 58, doy));
    const spring = Math.exp(-Math.pow((doy - 125) / 26, 2));
    const fw = [autumn, 0.8 * bare, 0.5 * spring], ft = fw[0] + fw[1] + fw[2] + 1e-6;
    const FC = [[214, 132, 44], [112, 100, 90], [128, 178, 72]];
    const foliageColor = rgb([0, 1, 2].map((i) => (FC[0][i] * fw[0] + FC[1][i] * fw[1] + FC[2][i] * fw[2]) / ft));
    const foliageOpacity = Math.min(0.6, 0.58 * autumn + 0.42 * bare + 0.24 * spring) * (dayish + 0.5 * eff[3]) * (1 - snowCover);

    // ----- calendar moments -----
    const inRange = (a, b) => nowMin >= a && nowMin < b;
    let event = 'none';
    if (eventMode === 'auto') {
      const C = sky.calendar();
      if (p.mo === C.july4.mo && p.d === C.july4.d && inRange(C.july4.from, C.july4.to)) event = 'july4';
      else if (p.mo === C.newyear.mo && p.d === C.newyear.d && inRange(C.newyear.from, C.newyear.to)) event = 'newyear';
      else if (dow === C.duckdodge.dow && doy >= C.duckdodge.doyFrom && doy <= C.duckdodge.doyTo && inRange(C.duckdodge.from, C.duckdodge.to) && rain < 0.5) event = 'duckdodge';
    } else event = eventMode;
    const holiday = p.mo === 12 || (p.mo === 1 && p.d === 1);
    const mv = this.buildMovers(still);

    // seaplanes: daylight only; one movement per 10-minute slot, fewer in winter. Heading into the wind.
    // On a typical Kenmore Air-style pattern (owner, 2026-11-22); the event hook still forces one for previews.
    const sp = seaplaneAt(ms), slot = Math.floor(st.now / 600000), summer = p.mo >= 5 && p.mo <= 9;
    const planeOn = event === 'seaplane' || (!!sp && el > 3 && fog < 0.3 && snowing < 0.3);
    const south = wind.dir > 0, takeoff = sp ? sp.kind === 'takeoff' : sky.hash(slot, 22) < 0.5;
    const pDelay = still ? 24 + (takeoff ? 0 : 8) : sp ? sp.elapsedS : (st.now / 1000) % 600;
    const planeStyle = 'position:absolute;left:0;top:0;width:0;height:0;offset-path:path(\'' + (south ? mv.planeS : mv.planeN) + '\');offset-rotate:auto;animation:' + (takeoff ? 'lk-takeoff' : 'lk-landing') + ' 600s linear infinite;animation-delay:-' + pDelay.toFixed(1) + 's' + (still ? ';animation-play-state:paused' : '');
    const planeWake = 'position:absolute;right:4px;top:-1px;width:54px;height:2px;border-radius:2px;background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.85));animation:' + (takeoff ? 'lk-wake-to' : 'lk-wake-ld') + ' 600s linear infinite;animation-delay:-' + pDelay.toFixed(1) + 's' + (still ? ';animation-play-state:paused' : '');
    const nBoats = el > 0 ? (summer ? 6 : 3) : 1;

    const fs = Math.round(Math.max(11, Math.min(18, 10.5 / fitS)));
    if (!this._labels || this._labelsFor !== fs) {
      const L = [['Lake Union', 0.555, 0.375, 0], ['Gas Works Park', 0.565, 0.442, 0], ['Elliott Bay', 0.80, 0.176, 1], ['I-5', 0.262, 0.372, 0], ['Downtown', 0.47, 0.152, 0], ['Space Needle', 0.749, 0.213, 0], ['Capitol Hill', 0.17, 0.235, 0], ['Queen Anne', 0.87, 0.265, 0], ['Eastlake', 0.315, 0.455, 0], ['Fremont', 0.95, 0.515, 0], ['Wallingford', 0.70, 0.60, 0], ['N 45th St', 0.86, 0.738, 0], ['Ship Canal', 0.86, 0.43, 1]];
      this._labels = L.map(([t, x, y2, cool]) => ({ text: t, cls: cool ? 'lk-label lk-label-cool' : 'lk-label', style: 'left:' + (x * 1440).toFixed(0) + 'px;top:' + (y2 * 1440).toFixed(0) + 'px;font-size:' + fs + 'px' }));
      this._labelsFor = fs;
    }

    // ----- words -----
    const tz = p.off === -420 ? 'PDT' : 'PST';
    let sunLine;
    if (ev.rise == null) sunLine = 'Sun below the horizon all day';
    else if (nowMin < ev.cRise) sunLine = 'First light ' + sky.fmt(ev.cRise) + ' · sunrise ' + sky.fmt(ev.rise);
    else if (nowMin < ev.rise) sunLine = 'Sunrise ' + sky.fmt(ev.rise);
    else if (nowMin < ev.set) sunLine = 'Sunset ' + sky.fmt(ev.set) + ' · sun ' + Math.round(el) + '°';
    else if (nowMin < ev.cSet) sunLine = 'Sunset ' + sky.fmt(ev.set) + ' · dusk ends ' + sky.fmt(ev.cSet);
    else sunLine = 'Sun ' + Math.round(el) + '° · sunrise ' + sky.fmt(ev.rise + 1);
    const label = snowing > 0.1 ? 'Snow' : fog > 0.5 ? 'Fog' : rain > 0.55 ? 'Rain' : rain > 0.1 ? 'Light rain' : haze > 0.4 ? 'Hazy' : cloud > 0.85 ? 'Overcast' : cloud > 0.6 ? 'Mostly cloudy' : cloud > 0.3 ? 'Partly cloudy' : 'Mostly clear';
    const skyLine = (O ? 'Sky: ' : 'Typical sky: ') + label + (snowCover && snowing <= 0.1 ? ', snow on the ground' : '') + ' · ' + Math.round(wx.temp) + '°F';
    const moonLine = sky.moonName(mn) + ' ' + Math.round(mn.illum * 100) + '%' + (mn.el > 0 ? ' · up' : ' · down');
    const note = { july4: 'Fireworks over the lake', newyear: 'Happy New Year', duckdodge: 'Duck Dodge on the lake', seaplane: '', none: '' }[event];

    // ----- what is unusual right now (shown quietly beside the build info) -----
    const rare = [];
    if (note) rare.push(note.toLowerCase());
    if (rainbowOpacity > 0.05) rare.push('rainbow');
    if (snowCover) rare.push('snow day');
    if (haze > 0.4) rare.push('smoke haze');
    if (fog > 0.5) rare.push('fog on the lake');
    if (el < -6 && mn.illum > 0.97 && mn.el > 0 && cloud < 0.7) rare.push('full moon');
    if (el < -12 && (mn.illum < 0.04 || mn.el < 0) && cloud < 0.3) rare.push('dark sky, stars out');
    if (el > 5 && cloud < 0.3 && haze < 0.2 && fog < 0.1) rare.push('the mountain is out');
    if (holiday && on > 0.3) rare.push('holiday lights');
    if (planeOn && !still) rare.push('seaplane on the lake');
    if (doy === 172) rare.push('longest day'); if (doy === 355) rare.push('shortest day');
    const rareLine = rare.slice(0, 3).join(' · ');
    const pad = (n) => String(n).padStart(2, '0');
    const shareUrl = P.siteUrl + '#t=' + p.y + '-' + pad(p.mo) + '-' + pad(p.d) + 'T' + pad(p.h) + ':' + pad(p.mi);
    const copyLink = () => {
      const done = (ok) => { this.setState({ copied: ok ? 'copied' : shareUrl }); clearTimeout(this._ct); this._ct = setTimeout(() => this.setState({ copied: null }), ok ? 1800 : 9000); };
      try { navigator.clipboard.writeText(shareUrl).then(() => done(true), () => done(false)); } catch (e) { done(false); }
    };

    const tilt = wind.dir * (3 + 15 * wind.speed);
    const tiltBox = (deg) => 'position:absolute;inset:-' + (portrait ? 30 : 22) + '%;transform:rotate(' + deg.toFixed(1) + 'deg)';
    const fwOn = (event === 'july4' || event === 'newyear') && on > 0.3;
    const precipDim = 0.35 + 0.55 * dayish;

    const showP = { p0: vis[0] && !(w[3] >= 0.999 && on >= 0.999), p3: vis[3] && on < 0.999, p3L: w[3] > 0.002 && on > 0.002 && !nightSolid, p4L: w[4] > 0.002 && win < 0.999, p4E: w[4] > 0.002 && win > 0.33 };
    const kE = sky.cl((win - 0.32) / 0.68);
    // plates: a newly needed photo starts transparent and fades in; a photo that has just been covered stays for
    // a few seconds, so there is never a gap while the next one loads
    const tNow = Date.now(); this._pl = this._pl || {}; let again = 0;
    const pl = (key, need, op) => {
      if (still) return { show: need, op: op.toFixed(3) };
      const s = this._pl[key] || (this._pl[key] = { last: -1e12, op: 0, on: false, born: 0 });
      if (need) { s.last = tNow; s.op = op; }
      const show = need || tNow - s.last < 5000;
      if (show && !need) again = Math.max(again, 5200 - (tNow - s.last));
      if (show && !s.on) { s.on = true; s.born = tNow; }
      if (!show) s.on = false;
      const fresh = show && tNow - s.born < 120;
      if (fresh) again = again ? Math.min(again, 140) : 140;
      return { show, op: (fresh ? 0 : s.op).toFixed(3) };
    };
    const PL = { p0: pl('p0', showP.p0, w[0]), p1: pl('p1', vis[1], w[1]), p2: pl('p2', vis[2], w[2]), p3: pl('p3', showP.p3, w[3]), p3L: pl('p3L', showP.p3L, w[3] * on), p4L: pl('p4L', showP.p4L, w[4]), p4E: pl('p4E', showP.p4E, w[4] * kE) };
    if (again && !this._again) this._again = setTimeout(() => { this._again = null; this.setState({ now: this.state.now }); }, again);

    const offAt = (c) => { const k = Math.round(c.n * traffic[c.dir]); return Math.floor((c.i + 1) * k / c.n) === Math.floor(c.i * k / c.n); };
    const carOff = mv.cars.map(offAt);
    return {
      a: assets, rootClass: 'lk-root ' + (still ? 'lk-still' : (st.hidden ? 'lk-anim lk-paused' : 'lk-anim')) + (st.lapse ? ' lk-lapse' : ''), stageStyle,
      show: {
        p0: PL.p0.show, p1: PL.p1.show, p2: PL.p2.show, p3: PL.p3.show, p3L: PL.p3L.show, p4L: PL.p4L.show, p4E: PL.p4E.show,
        foliage: foliageOpacity > 0.02, snow: snowCover > 0, haze: haze > 0.02 && dayish + eff[3] > 0.05,
        sun: sunAmp > 0.01, moonGlow: moonLight > 0.03,
        rainbow: rainbowOpacity > 0.02, ripples: fog < 0.6 && rain < 0.08, glitter: glit > 0.03, rings: rain > 0.08,
        lights: on > 0.01, bloom: on > 0.05 && (rain > 0.2 || fog > 0.2 || snowCover > 0), holiday: holiday && on > 0.05, drawn: drawn && on > 0.05,
        boats: fog < 0.7, ferries: fog < 0.8, sails: event === 'duckdodge', plane: planeOn,
        cars: !still && on > 0.05, dayCars: !still && on < 0.95, beacons: on > 0.1,
        fireworks: fwOn, fwLake: event === 'july4',
        stars: nightish > 0.3 && cloud < 0.7 && fog < 0.3,
        litRain: rain > 0.05 && on > 0.05, fog: fog > 0.01,
        cloud1: cloud > 0.26, cloud2: cloud > 0.5 || fog > 0.01, rain: rain > 0.06, flakes: snowing > 0.06
      },
      rainbowOpacity: rainbowOpacity.toFixed(3), rainbowStyle,
      op0: PL.p0.op, op1: PL.p1.op, op2: PL.p2.op, op3: PL.p3.op, op4: PL.p4L.op, op3L: PL.p3L.op, op4E: PL.p4E.op,
      foliageColor, foliageOpacity: foliageOpacity.toFixed(3),
      snowColor: rgb(mix([[244, 247, 251], [250, 234, 218], [250, 234, 218], [140, 150, 184], [44 + 22 * on, 47 + 18 * on, 62 + 10 * on]])), snowOpacity: (0.9 * snowCover).toFixed(3),
      flatColor: rgb(cloudCol), flatOpacity: (0.20 * cloud * (0.4 + 0.6 * dayish) * (1 - 0.6 * snowCover) + 0.25 * Math.max(rain, snowing * 0.35) * dayish).toFixed(3),
      hazeColor: rgb(mix([[214, 170, 128], [226, 150, 96], [226, 150, 96], [120, 96, 110], [40, 34, 36]])), hazeOpacity: (0.42 * haze).toFixed(3),
      sunGlow, sunGlowOpacity: Math.min(1, sunAmp).toFixed(3),
      moonGlow, moonGlowOpacity: (0.5 * moonLight).toFixed(3),
      rippleColor: rgb(mix([[255, 255, 255], [255, 236, 214], [255, 236, 214], [196, 206, 236], [120, 130, 160]])),
      rippleOpacity: ((0.05 + 0.2 * wind.speed) * (0.45 + 0.55 * dayish) * (1 - fog)).toFixed(3),
      ripplePlay: dayish > 0.6 ? 'running' : 'paused', glitterGradient, glitterColor, glitterOpacity: Math.min(0.75, glit * 0.7).toFixed(3),
      ringsOpacity: (rain * (0.25 + 0.4 * dayish + 0.2 * on) * 0.35).toFixed(3),   // owner, 2026-11-22: really subtle at most
      streetsOpacity: (on * lightK).toFixed(3),
      windowsOpacity: (on * win * lightK).toFixed(3),
      shimmerOpacity: (on * 0.45).toFixed(3),
      holidayOpacity: (on * (0.4 + 0.4 * win) * 0.3).toFixed(3),   // owner, 2026-11-22: a faint December easter egg (was 1x)
      bloomOpacity: (on * (0.32 * rain + 0.45 * fog + 0.2 * snowCover) * (0.6 + 0.4 * win)).toFixed(3),
      skyGlowOpacity: (on * (0.15 + 0.6 * cloud + 0.3 * fog)).toFixed(3),
      drawnOpacity: sky.ss(0.05, 0.7, on).toFixed(3),
      labels: this._labels,
      boats: mv.boats.slice(0, nBoats), boatsOpacity: (el > 0 ? 0.9 * (1 - fog) : 0.55).toFixed(2),
      sails: mv.sails, sailsOpacity: (0.95 * (0.45 + 0.55 * (dayish + eff[3]))).toFixed(2),
      planeStyle, planeWake,
      // The hour's share of the fleet, spread evenly along each road (Bresenham), so changing the count never bunches
      // the cars that stay; the hidden ones keep animating (visibility only), so nothing restarts.
      cars: mv.cars.map((c, j) => ({ style: c.style, road: c.road, dir: c.dir, off: carOff[j] })),
      dayCars: [...mv.cars.map((c, j) => ({ style: c.dayStyle, road: c.road, dir: c.dir, off: carOff[j] })), ...mv.dayOnly.map((c) => ({ style: c.dayStyle, road: c.road, dir: c.dir, off: offAt(c) }))],
      // fog swallows traffic (owner, 2026-11-23: cars must not show through it)
      dayCarsOpacity: ((1 - sky.ss(0.05, 0.6, on)) * (1 - sky.ss(0.1, 0.6, fog))).toFixed(3),
      carsOpacity: (sky.ss(0.05, 0.6, on) * (1 - 0.85 * sky.ss(0.1, 0.6, fog))).toFixed(3),
      beacons: beaconList.map((b, k) => ({ name: b.name, x: b.x, y: b.y, style: 'position:absolute;left:' + (b.x - b.size / 2) + 'px;top:' + (b.y - b.size / 2) + 'px;width:' + b.size + 'px;height:' + b.size + 'px;border-radius:50%;background:#ff3b2f;box-shadow:0 0 ' + (2 * b.size) + 'px ' + (b.size - 1) + 'px rgba(255,59,47,.65);animation-delay:-' + (k * 0.55).toFixed(2) + 's' })),
      beaconOpacity: (0.9 * sky.ss(0.1, 0.7, on)).toFixed(3),
      veilDir: wind.flow >= 0 ? 'normal' : 'reverse',   // the rain veil drifts with the wind
      // downtown office floors in eight groups on their own clock (owner, 2026-11-22); lit only when the city lights are on
      towers: officeFloorsLit(p.h + p.mi / 60, dow).map((lit, k) => ({ src: assets['towers_g' + k], opacity: (on * lit).toFixed(3) })),
      // Washington State Ferries in Elliott Bay on a typical sailing pattern (owner, 2026-11-22): hulls by day, lights by night.
      ferries: fog < 0.8 ? ferriesAt(ms).map((f) => {
        const path = { bainbridge: 'M813.6 250.6 L960 248 L1110 244 L1260 240 L1440 236', bremerton: 'M813.6 250.6 L960 240 L1110 228 L1260 215 L1440 200' }[f.route];
        const body = on > 0.4
          ? 'width:4px;height:3px;margin:-1.5px 0 0 -2px;border-radius:2px;background:#fffaf0;box-shadow:0 0 5px 2px rgba(255,248,230,' + (0.25 + 0.6 * on).toFixed(2) + ')'
          : 'width:7px;height:3px;margin:-1.5px 0 0 -3.5px;border-radius:2px;background:#f3f1ea;box-shadow:0 1px 1px rgba(0,0,0,.35),-6px 0 5px -1px rgba(255,255,255,.35)';
        return { style: 'position:absolute;left:0;top:0;' + body + ';offset-path:path(\'' + path + '\');offset-rotate:auto;animation:' + (f.dir === 'out' ? 'lk-ferry-run' : 'lk-ferry-in') + ' ' + FERRY_VISIBLE_S + 's linear forwards;animation-delay:-' + f.elapsedS.toFixed(0) + 's' + (still ? ';animation-play-state:paused' : '') };
      }) : [],
      // airliners on the approach south over the city: lights at night, high and slow, blinking (never display flying)
      aircraft: on > 0.3 && cloud < 0.85 && !still ? aircraftAt(ms).map((a) => ({
        style: 'position:absolute;left:0;top:0;width:0;height:0;offset-path:path(\'' + ['M1010 470 L930 260 L860 110', 'M1120 500 L1010 280 L930 120', 'M1230 520 L1100 300 L1000 130'][a.lane] + '\');animation:lk-air ' + AIRCRAFT_VISIBLE_S + 's linear forwards;animation-delay:-' + a.elapsedS.toFixed(0) + 's',
      })) : [],
      bursts: event === 'newyear' ? mv.newyear : mv.july4, fireworksOpacity: (1 - 0.75 * fog).toFixed(2),
      starsOpacity: (nightish * Math.pow(1 - cloud, 2) * (1 - 0.6 * moonLight)).toFixed(3),
      litRainOpacity: (rain * on * 0.95).toFixed(3), litRainTilt: tiltBox(tilt) + ';overflow:hidden',
      fogOpacity: sky.cl(fog * 0.95).toFixed(3), fogColor: rgb(fogCol),
      cloudColor: rgb(cloudCol),
      cloud1Opacity: (0.85 * sky.ss(0.25, 0.95, cloud) * (1 - 0.5 * fog)).toFixed(3),
      cloud2Opacity: (0.6 * sky.ss(0.5, 1, cloud) + 0.5 * fog).toFixed(3),
      veilOpacity: (rain * (0.22 + 0.25 * dayish)).toFixed(3),
      veilColor: rgb(mix([[150, 158, 168], [170, 150, 140], [170, 150, 140], [70, 74, 92], [40, 38, 44]])),
      rainOpacity: (rain * (0.3 + 0.5 * dayish + 0.12 * eff[3] + 0.1 * on * nightish)).toFixed(3), rainTilt: tiltBox(tilt),
      rainColor: rgb(mix([[226, 232, 238], [240, 222, 204], [240, 222, 204], [150, 156, 178], [176, 150, 128]])),
      flakesOpacity: (snowing * (0.5 + 0.5 * dayish)).toFixed(3), snowTilt: tiltBox(tilt * 0.6),
      flakeColor: rgb(mix([[255, 255, 255], [255, 244, 232], [255, 244, 232], [188, 196, 222], [150, 150, 164]])),
      scrimOpacity: hideText ? 0.3 : 1, textOpacity: hideText ? 0 : 1, textVisibility: hideText ? 'hidden' : 'visible',
      toggleText: () => this.setState({ hide: !hideText }), hidePressed: String(hideText), hideHint: hideText ? 'Show the text' : 'Hide the text and watch the lake',
      toggleGear: () => this.setState({ gear: !gearOpen }), gearOpen, gearExpanded: String(gearOpen), gearLabel: gearOpen ? 'Hide build info' : 'Show build info',
      rareLine, hasRare: rare.length > 0, rareDot: rare.length > 0 && !gearOpen, copyLink, copyLabel: st.copied || 'link to this moment',
      photoCredit: P.photoCredit, photoUrl: P.photoUrl, buildDate: P.buildDate, buildCommit: P.buildCommit,
      clock: sky.fmt(nowMin) + ' ' + tz + (note ? ' · ' + note : ''), clockShort: sky.fmt(nowMin) + ' ' + tz,
      sunLine, skyLine, moonLine, showMoonLine: el < -4,
      scrubOpen: st.scrub, scrubExpanded: String(st.scrub), scrubLabel: st.scrub ? 'close' : 'control time',
      toggleScrub: () => this.setState(st.scrub ? { scrub: false, minute: null, moment: null, now: Date.now() } : { scrub: true }),
      backToNow: () => { this._coast = null; this.setState({ minute: null, moment: null, lapse: null, now: Date.now() }); },
      // time-lapse (owner, 2026-11-22): play a day or a year from the moment on show; press again to stop there
      canLapse: !this.reduced,
      dayLapseLabel: st.lapse && st.lapse.kind === 'day' ? 'stop' : 'play day', dayLapsePressed: String(!!(st.lapse && st.lapse.kind === 'day')),
      yearLapseLabel: st.lapse && st.lapse.kind === 'year' ? 'stop' : 'play year', yearLapsePressed: String(!!(st.lapse && st.lapse.kind === 'year')),
      playDay: () => this.toggleLapse('day', ms), playYear: () => this.toggleLapse('year', ms),
      // drag the photo sideways to move through the day (owner, 2026-11-22)
      onDragStart: (e) => this.dragStart(e, nowMin), onDragMove: (e) => this.dragMove(e), onDragEnd: () => this.dragEnd(),
      minuteVal: nowMin, onMinute: (e) => this.setState({ minute: +e.target.value }),
    };
  }
}
