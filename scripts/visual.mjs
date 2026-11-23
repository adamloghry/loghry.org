// Visual regression: renders key moments and compares them with the committed baselines in tests/visual/.
//   npm run build && node scripts/visual.mjs            compare (non-zero exit on a difference)
//   npm run build && node scripts/visual.mjs --update   accept the current look as the new baselines (commit them)
// Deterministic: reduced motion (nothing mid-animation; clouds and boats hold still), fixed moments and sizes, the
// page's own fonts. Compared at half size, so baselines stay small; a state fails when more than 0.005% of its pixels
// differ noticeably. Diff images go to tmp/visual/.
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { serve } from './serve.mjs';

const update = process.argv.includes('--update');
const root = new URL('../', import.meta.url).pathname;
const BASE = root + 'tests/visual/', OUT = root + 'tmp/visual/';
await mkdir(BASE, { recursive: true }); await mkdir(OUT, { recursive: true });
const D = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844 };
export const SNAPSHOTS = [
  ['day', D, '/#t=2026-06-21T13:00&sky=clear'],
  ['golden', D, '/#t=2026-06-21T20:30&sky=clear'],
  ['night', D, '/#t=2026-06-21T23:30&sky=clear&moon=full'],
  ['rain-night', D, '/#t=2026-11-22T22:00&sky=rain'],
  ['snow', D, '/#t=2026-01-15T12:00&sky=snow'],
  ['fog', D, '/#t=2026-10-15T08:00&sky=fog'],
  ['phone-evening', PHONE, '/#t=2026-11-18T19:00&sky=clear'],
  ['404', D, '/nope'],
];

// 2x box downscale of an RGBA PNG
function half(png) {
  const w = png.width >> 1, h = png.height >> 1, out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += png.data[((2 * y + dy) * png.width + 2 * x + dx) * 4 + c];
    out.data[(y * w + x) * 4 + c] = Math.round(s / 4);
  }
  return out;
}

const srv = await serve(root + 'dist', 0), browser = await chromium.launch();
let failed = 0;
for (const [name, viewport, path] of SNAPSHOTS) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.port}${path}`, { waitUntil: 'load' });
  if (path.startsWith('/#')) await page.waitForSelector('[data-test=clock]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const shot = half(PNG.sync.read(await page.screenshot()));
  await ctx.close();
  const file = BASE + name + '.png';
  if (update) { await writeFile(file, PNG.sync.write(shot)); console.log(`updated ${name}`); continue; }
  let base;
  try { base = PNG.sync.read(await readFile(file)); } catch { console.log(`FAIL visual ${name}  no baseline (run with --update)`); failed++; continue; }
  if (base.width !== shot.width || base.height !== shot.height) { console.log(`FAIL visual ${name}  size ${shot.width}x${shot.height} vs ${base.width}x${base.height}`); failed++; continue; }
  const diff = new PNG({ width: shot.width, height: shot.height });
  const n = pixelmatch(base.data, shot.data, diff.data, shot.width, shot.height, { threshold: 0.12 });
  const share = n / (shot.width * shot.height);
  if (share > 0.00005) { await writeFile(OUT + name + '-diff.png', PNG.sync.write(diff)); await writeFile(OUT + name + '-now.png', PNG.sync.write(shot)); failed++; }
  console.log(`${share > 0.00005 ? 'FAIL' : 'PASS'} visual ${name}  ${(share * 100).toFixed(3)}% of pixels differ (budget 0.005%)`);
}
await browser.close(); await srv.close();
if (!update) console.log(failed ? `\n${failed} failed; diffs in tmp/visual/. If the change is intended: node scripts/visual.mjs --update` : '\nall passed');
process.exitCode = failed ? 1 : 0;
