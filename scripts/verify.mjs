// Acceptance checks against the built site in a real browser. Run:  npm run build && npm run verify
// Serves dist/ with public/_headers applied (scripts/serve.mjs), drives real browsers with Playwright, exits non-zero
// on any failure. Screenshots go to tmp/shots/. Browsers come from PLAYWRIGHT_BROWSERS_PATH (the dev shell sets it).
// Every state runs in Chromium, WebKit (Safari's engine) and Firefox; VERIFY_BROWSERS=chromium,webkit narrows that.
// Controls, time zones, axe and contrast run in Chromium only.
import { chromium, webkit, firefox } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';
import { STATES, VIEWPORTS } from './states.mjs';

const dist = new URL('../dist/', import.meta.url).pathname;
const shots = new URL('../tmp/shots/', import.meta.url).pathname;
await mkdir(shots, { recursive: true });
const only = process.argv.slice(2);
const srv = await serve(dist, 0);
const base = `http://127.0.0.1:${srv.port}`;
const ENGINES = { chromium, webkit, firefox };
const engines = (process.env.VERIFY_BROWSERS || 'chromium,webkit,firefox').split(',').map((e) => e.trim()).filter(Boolean);
for (const e of engines) if (!ENGINES[e]) throw new Error(`VERIFY_BROWSERS: unknown browser ${e}`);
const chrome = await chromium.launch();
let browser = chrome; // the engine open() uses
let fails = 0;
const ok = (id, cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${id}  ${msg}`); if (!cond) fails++; };
const want = (name) => !only.length || only.some((o) => name.includes(o));

// A visitor somewhere other than Seattle, so any use of the browser's own clock shows up.
const VISITOR_TZ = 'Europe/Berlin';

async function open(state, { timezoneId = VISITOR_TZ, clock, reduced = state.reduced } = {}) {
  const ctx = await browser.newContext({
    viewport: state.viewport, timezoneId, javaScriptEnabled: state.js !== false,
    reducedMotion: reduced ? 'reduce' : 'no-preference', deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !(state.status === 404 && /404/.test(m.text()))) problems.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(base)) problems.push('foreign request: ' + r.url()); });
  page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !(state.status === 404 && r.url().endsWith(state.path))) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')));
  });
  if (clock) await page.clock.setFixedTime(clock);
  const res = await page.goto(base + (state.path || '/') + (state.hash ? '#' + state.hash : ''), { waitUntil: 'load' });
  if (state.js !== false && !state.path) await page.waitForSelector('[data-test=clock]', { timeout: 10000 });
  await page.waitForTimeout(600);
  return { ctx, page, problems, res };
}

const clockText = (page) => page.locator('[data-test=clock]').innerText();
// Every photo plate has reached the opacity its inline style asks for (they transition there from 0).
const platesSettled = () => [...document.querySelectorAll('.lk-plate')].every((i) => Math.abs(+getComputedStyle(i).opacity - +(i.style.opacity || 1)) < 0.01);
// The template runtime redraws on the next animation frame, so state is read after it settles.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const t0 = Date.now(); const lap = (what) => console.log(`---- ${what} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ---- every state, in every engine ----
for (const engine of engines) {
  const pre = engine === 'chromium' ? '' : engine + ':';
  const states = STATES.filter((s) => want(s.name) || (pre && want(engine)));
  if (!states.length) continue;
  // A browser that fails to launch is a failure, not a skip: the suite must not pass by testing less.
  browser = engine === 'chromium' ? chrome : await ENGINES[engine].launch().catch((e) => { ok(pre + 'launch', false, e.message.split('\n')[0]); return null; });
  if (!browser) continue;
for (const state of states) {
  // A browser that crashes is that engine's failure; record it and carry on so the other engines still report.
  // ...and one that hangs (as WebKit does when its sandbox cannot start) fails after a minute instead of stalling CI.
  const hung = new Promise((_, no) => setTimeout(() => no(new Error('no page after 60 s')), 60000).unref());
  const opened = await Promise.race([open(state), hung]).catch((e) => { ok(pre + state.name + ' open', false, 'browser failed: ' + e.message.split('\n')[0]); return null; });
  if (!opened) break; // the rest of this engine's states would fail the same way
  const { ctx, page, problems, res } = opened;
  const id = pre + state.name;
  if (state.open) { await page.locator('.lk-gear > button').click(); await page.waitForTimeout(300); }
  const r = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    h1Text: document.querySelector('h1')?.textContent?.trim(),
    text: document.body.innerText,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    csp: window.__csp,
    status: document.querySelector('[data-test=status]')?.textContent ?? null,
  }));
  ok(id + ' clean', problems.length === 0 && r.csp.length === 0, 'no errors, CSP violations or foreign requests' + (problems.length || r.csp.length ? ': ' + [...problems, ...r.csp].join(' | ') : ''));
  ok(id + ' h1', r.h1 === 1, `exactly one h1 (${r.h1})`);
  ok(id + ' text', !/NaN|undefined|\{\{|\[object /.test(r.text), 'no template or arithmetic debris');
  ok(id + ' overflow', r.overflow <= 1, `no sideways scroll (${r.overflow}px)`);
  if (state.status) ok(id + ' status', res.status() === state.status && r.h1Text === 'Not here', `HTTP ${res.status()} and "Not here"`);
  if (state.sky) ok(id + ' sky', state.sky.test(r.status || ''), `status names the sky: ${(r.status || '').replace(/\s+/g, ' ').slice(0, 90)}`);
  if (state.clock) ok(id + ' clock', state.clock.test(await clockText(page)), 'clock shows the event');
  if (state.js !== false && !state.path) ok(id + ' seattle', /^\d{1,2}:\d\d (AM|PM) P[SD]T/.test(await clockText(page)), 'clock is Seattle time');
  if (state.js !== false && !state.path) {
    // Owner decision 2026-11-22: no "loghry.org" wordmark top left; the coordinates chip stays top right.
    const top = await page.evaluate(() => {
      const bar = document.querySelector('.lk-top'), chip = document.querySelector('.lk-top > button');
      return { mark: !!document.querySelector('.lk-mark'), text: bar.textContent, gap: bar.getBoundingClientRect().right - chip.getBoundingClientRect().right,
        shown: chip.innerText, fits: chip.getBoundingClientRect().left >= bar.getBoundingClientRect().left - 1 };
    });
    ok(id + ' top-bar', !top.mark && !/loghry\.org/i.test(top.text) && Math.abs(top.gap) <= 1, `no wordmark; chip flush right (${top.gap.toFixed(1)}px)`);
    // With the wordmark gone the chip has the bar to itself: it names the lake down to 360px, and always fits.
    const wantLake = state.viewport.width >= 360;
    ok(id + ' chip', top.fits && /lake union/i.test(top.shown) === wantLake, `chip "${top.shown.replace(/\s+/g, ' ')}" ${wantLake ? 'names' : 'omits'} the lake and fits`);
  }
  if (state.open) ok(id + ' panel', await page.locator('[data-test=panel]').isVisible(), 'panel open');
  if (state.js === false) {
    const img = await page.evaluate(() => { const i = document.querySelector('noscript ~ * img, picture img, img'); return i ? { w: i.naturalWidth, vis: i.getBoundingClientRect().width > 0 } : null; });
    ok(id + ' photo', !!img && img.w > 0 && img.vis, 'day photo visible without JavaScript');
    ok(id + ' credit', /Ryan Wilson/.test(r.text) && r.h1Text === 'Loghry', 'heading and photo credit');
  }
  if (state.reach) {
    // On small screens the controls sit below the fold (the hero has min-height: 520px, as designed); they must
    // still be reachable. Playwright scrolls them into view and refuses to click anything covered or off-page.
    const reached = async (button, opened) => {
      try { await page.locator(button).click({ timeout: 3000 }); await settle(page); return await page.locator(opened).isVisible(); } catch { return false; }
    };
    ok(id + ' reach-gear', await reached('.lk-gear > button', '[data-test=panel]'), 'gear reachable and opens the panel');
    ok(id + ' reach-time', await reached('.lk-status > button', 'input[type=range]'), '"control time" reachable and shows the slider');
  }
  if (state.reduced) {
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    ok(id + ' still', running === 0, `no running animations (${running})`);
  }
  // Plates fade in over 2.4 s from opacity 0; a screenshot before that shows a dim scene, not the state.
  const settled = await page.waitForFunction(platesSettled, null, { timeout: 8000 }).then(() => true, () => false);
  ok(id + ' settled', settled, 'photo layers finished fading in before the screenshot');
  await page.screenshot({ path: shots + id.replace(':', '-') + '.png', fullPage: !!state.fullPage });
  await ctx.close();
}
  if (browser !== chrome) await browser.close().catch(() => {});
  lap('states ' + engine);
}
browser = chrome;

// ---- Seattle time, whatever the visitor's time zone ----
if (want('timezone')) {
  const st = { viewport: VIEWPORTS.desktop, hash: 't=2026-06-21T13:00&sky=clear' };
  const seen = [];
  for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC', 'Pacific/Kiritimati']) {
    const { ctx, page } = await open(st, { timezoneId: tz });
    seen.push(await clockText(page)); await ctx.close();
  }
  ok('timezone fixed-moment', seen.every((c) => c === seen[0]) && /^1:00 PM PDT/.test(seen[0]), 'same clock in 4 time zones: ' + seen[0]);
  // "now" with no hook: pin the browser clock to an instant that is a different calendar day in Seattle than in
  // Tokyo or UTC (2026-11-23 06:30 UTC = Sunday 22 Nov, 10:30 PM PST) and check the hero and the almanac.
  for (const tz of ['Asia/Tokyo', 'UTC', 'America/Los_Angeles']) {
    const { ctx, page } = await open({ viewport: VIEWPORTS.desktop, hash: '' }, { timezoneId: tz, clock: new Date('2026-11-23T06:30:00Z') });
    const c = await clockText(page);
    const date = await page.locator('#almanac').textContent(); // not innerText: the label is text-transform: uppercase
    ok('timezone live ' + tz, c.startsWith('10:30 PM PST') && date.includes('Sunday, November 22, 2026 · PST'), `clock "${c.slice(0, 20)}", almanac dated Seattle's day`);
    await ctx.close();
  }
}
lap('timezone');

// ---- controls ----
if (want('controls')) {
  const { ctx, page, problems } = await open({ viewport: VIEWPORTS.desktop, hash: 't=2026-06-21T13:00&sky=clear' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const gear = page.locator('.lk-gear > button');
  ok('controls gear-closed', (await gear.getAttribute('aria-expanded')) === 'false', 'gear starts collapsed');
  await gear.click(); await settle(page);
  ok('controls gear-open', (await gear.getAttribute('aria-expanded')) === 'true' && await page.locator('[data-test=panel]').isVisible(), 'gear opens the panel');
  await page.getByRole('button', { name: 'link to this moment' }).click();
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok('controls share', /#t=2026-06-21T13:00/.test(clip), 'link to this moment copies a #t= link: ' + clip);
  await gear.click(); await settle(page);
  ok('controls gear-close', (await gear.getAttribute('aria-expanded')) === 'false' && await page.locator('[data-test=panel]').count() === 0, 'gear closes the panel');

  const scrub = page.locator('.lk-status > button');
  ok('controls scrub-closed', (await scrub.getAttribute('aria-expanded')) === 'false' && await page.locator('input[type=range]').count() === 0, 'slider hidden at first');
  await scrub.click(); await settle(page);
  const range = page.locator('input[type=range]');
  ok('controls scrub-open', (await scrub.getAttribute('aria-expanded')) === 'true' && await range.isVisible(), '"control time" shows the slider');
  await range.focus(); for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const vt = await range.getAttribute('aria-valuetext');
  ok('controls scrub-value', /^\d{1,2}:\d\d (AM|PM) P[SD]T$/.test(vt) && vt !== '1:00 PM PDT', 'slider moves and announces Seattle time: ' + vt);
  ok('controls scrub-clock', (await clockText(page)).startsWith(vt), 'clock follows the slider');
  await page.getByRole('button', { name: 'back to now' }).click();
  await page.waitForTimeout(200);
  const nowSeattle = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date());
  ok('controls back-to-now', (await clockText(page)).startsWith(nowSeattle), 'back to now returns to the live Seattle clock');

  const chip = page.locator('.lk-top > button');
  await chip.click(); await page.waitForTimeout(700);
  const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('.lk-bottom .lk-words')).visibility);
  ok('controls hide-text', (await chip.getAttribute('aria-pressed')) === 'true' && hidden === 'hidden', 'chip hides the words');
  await chip.click(); await page.waitForTimeout(700);
  ok('controls show-text', (await chip.getAttribute('aria-pressed')) === 'false', 'chip shows them again');
  ok('controls clean', problems.length === 0, 'no errors while using the controls ' + problems.join(' | '));
  await ctx.close();
}

// ---- traffic follows the hour (owner, 2026-11-22) ----
if (want('traffic')) {
  const seen = {};
  for (const [label, t] of [['3am', '2026-12-15T03:00'], ['rush', '2026-12-15T07:30']]) {
    const { ctx, page } = await open({ viewport: VIEWPORTS.desktop, hash: `t=${t}&sky=clear` });
    seen[label] = await page.evaluate(() => [...document.querySelectorAll('.lk-car')].filter((c) => getComputedStyle(c).visibility === 'visible' && c.getBoundingClientRect().width > 0).length);
    await page.screenshot({ path: shots + `traffic-${label}.png`, clip: { x: 0, y: 150, width: 720, height: 750 } });
    await ctx.close();
  }
  ok('traffic hour', seen['3am'] > 0 && seen.rush > seen['3am'] * 2.5, `cars on screen: 3 AM ${seen['3am']}, 7:30 AM ${seen.rush}`);
  // by day: car-coloured bodies on the same lanes (owner: a realistic city by day too)
  const { ctx, page } = await open({ viewport: VIEWPORTS.desktop, hash: 't=2026-06-23T07:45&sky=clear' });
  const day = await page.evaluate(() => [...document.querySelectorAll('.lk-car')].filter((c) => getComputedStyle(c).visibility === 'visible' && +getComputedStyle(c.parentElement).opacity > 0.5 && c.getBoundingClientRect().width > 0).length);
  await ctx.close();
  ok('traffic day', day > 15, `cars on screen on a June weekday at 7:45 AM: ${day}`);
}
// ---- the almanac charts answer back (owner, 2026-11-22) ----
if (want('almanac')) {
  const { ctx, page, problems } = await open({ viewport: VIEWPORTS.desktop, hash: 't=2026-06-21T13:00&sky=clear' });
  const read = (id) => page.locator('#' + id).innerText();
  const charts = page.locator('#almanac .alm-chart');
  ok('almanac charts', (await charts.count()) === 3, `three inspectable charts (${await charts.count()})`);
  const [day, year, month] = [charts.nth(0), charts.nth(1), charts.nth(2)];
  await year.scrollIntoViewIfNeeded();
  const yb = await year.boundingBox();
  await page.mouse.move(yb.x + yb.width * (13.5 / 73), yb.y + yb.height / 2); await settle(page);
  const yr = await read('alm-year-read');
  ok('almanac year hover', /^Mar \d+–\d+ · \d+h \d\dm of daylight · sunrise .* (PST|PDT) · [+−]/.test(yr), 'hovering March: ' + yr);
  await page.mouse.move(yb.x + yb.width / 2, yb.y - 60); await settle(page);
  ok('almanac year leave', (await read('alm-year-read')).startsWith('Today, '), 'leaving the chart returns to today');
  await day.focus(); await page.keyboard.press('Home'); await settle(page);
  const d0 = await read('alm-day-read');
  await page.keyboard.press('ArrowRight'); await settle(page);
  const d1 = await read('alm-day-read');
  ok('almanac day keys', d0.startsWith('12:00 AM') && d1.startsWith('12:15 AM') && /lux/.test(d1), `keyboard steps the day band: "${d0.slice(0, 30)}" -> "${d1.slice(0, 30)}"`);
  const mb = await month.boundingBox();
  await page.mouse.move(mb.x + mb.width * (2.5 / 12), mb.y + mb.height / 2); await settle(page);
  ok('almanac month hover', /^March · highs near \d+°F, lows near \d+°F/.test(await read('alm-month-read')), 'hovering March shows its normals');
  ok('almanac clean', problems.length === 0, 'no errors while inspecting ' + problems.join(' | '));
  await ctx.close();
  // touch: drag sideways along the year chart on a phone
  const t = await browser.newContext({ viewport: VIEWPORTS.phone, hasTouch: true, isMobile: true });
  const tp = await t.newPage(); await tp.goto(base + '/#t=2026-06-21T13:00&sky=clear'); await tp.waitForSelector('[data-test=clock]');
  const ty = tp.locator('#almanac .alm-chart').nth(1); await ty.scrollIntoViewIfNeeded(); const tb = await ty.boundingBox();
  await ty.dispatchEvent('pointerdown', { clientX: tb.x + tb.width * 0.9, clientY: tb.y + tb.height / 2, pointerType: 'touch', bubbles: true });
  await settle(tp);
  ok('almanac touch', /^(Nov|Dec) /.test(await tp.locator('#alm-year-read').innerText()), 'a touch near the end of the year chart reads Nov/Dec');
  await t.close();
}
lap('almanac');
lap('controls');
// ---- accessibility (axe-core, WCAG 2 A/AA + best practice) ----
if (want('axe')) {
  // Not 19-no-javascript: axe is itself a script and cannot run with JavaScript off.
  for (const name of ['01-desktop-day', '08-desktop-snow', '14-phone-panel-open', '21-404', '13-phone-night-rain']) {
    const state = STATES.find((s) => s.name === name);
    const { ctx, page } = await open(state);
    if (state.open) { await page.locator('.lk-gear > button').click(); await page.waitForTimeout(300); }
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
    ok('axe ' + name, res.violations.length === 0, res.violations.length ? res.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ') : 'no violations');
    await ctx.close();
  }
}

lap('axe');
// ---- text contrast against the brightest 2 % of pixels behind each label ----
if (want('contrast')) {
  const decoder = await browser.newPage(); // about:blank, no CSP: decodes screenshots with a canvas
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let worst = Infinity, worstAt = '';
  for (const name of ['01-desktop-day', '07-desktop-fog', '08-desktop-snow', '12-phone-day', '02-desktop-golden']) {
    const state = STATES.find((s) => s.name === name);
    const { ctx, page } = await open(state, { reduced: true });
    const labels = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.lk-root h1, .lk-tag, [data-test=status] span, [data-test=status] button, .lk-top button')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || !el.textContent.trim()) continue;
        let a = 1; for (let p = el; p; p = p.parentElement) a *= +getComputedStyle(p).opacity;
        const m = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
        out.push({ text: el.textContent.trim().slice(0, 24), box: { x: r.x, y: r.y, width: r.width, height: r.height }, rgb: m.slice(0, 3), alpha: (m[3] ?? 1) * a });
      }
      return out;
    });
    ok(`contrast ${name} labels`, labels.length >= 5, `${labels.length} labels measured`);
    // Hide the text to see what is behind it. Underlines too: .lk-link sets its own text-decoration-color.
    await page.addStyleTag({ content: '*{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;text-decoration-color:transparent!important}' });
    await page.waitForTimeout(100);
    for (const l of labels) {
      const png = (await page.screenshot({ clip: l.box })).toString('base64');
      const top = await decoder.evaluate(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
        const d = x.getImageData(0, 0, bmp.width, bmp.height).data, px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        const L = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
        px.sort((a, b) => L(b) - L(a));
        return px[Math.floor(px.length * 0.02)];
      }, png);
      const fg = l.rgb.map((c, i) => c * l.alpha + top[i] * (1 - l.alpha));
      const [a, b] = [lum(fg), lum(top)].sort((p, q) => q - p);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < worst) { worst = ratio; worstAt = `${name} "${l.text}"`; }
      if (ratio < 4.5) ok(`contrast ${name}`, false, `"${l.text}" ${ratio.toFixed(1)}:1`);
    }
    await ctx.close();
  }
  ok('contrast all', worst >= 4.5, `worst ${worst.toFixed(1)}:1 at ${worstAt}`);
  await decoder.close();
}

lap('contrast');
await chrome.close();
await srv.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exitCode = fails ? 1 : 0;
