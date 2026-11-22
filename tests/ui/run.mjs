// Bombadil property-based browser checks on the built site: random clicks, drags, reloads and resizes, with the
// properties in tests/ui/spec.ts checked after every step. Run after a build:
//   npm run test:ui              desktop 1280x800, phone 390x844, and desktop from a shared link; 60 s each
//   node tests/ui/run.mjs 5m     longer (do this before a release)
// Serves dist/ with the production _headers (scripts/serve.mjs). Chromium is Playwright's (the dev shell sets
// PLAYWRIGHT_BROWSERS_PATH), or $CHROME. Traces go to tmp/bombadil-<viewport>/trace.bin.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

if (!existsSync('dist/index.html')) { console.error('dist/ is missing: run `npm run build` first'); process.exit(2); }
const limit = process.argv[2] || process.env.BOMBADIL_TIME_LIMIT || '60s';
const chrome = process.env.CHROME || chromium.executablePath();
const server = await serve('dist', 0);
let failed = 0;
try {
  // The third run starts from a shared link (July 4 fireworks), so the event layers get explored too.
  for (const [name, w, h, hash] of [['desktop', 1280, 800, ''], ['phone', 390, 844, ''], ['shared-link', 1280, 800, '#t=2026-07-04T22:25&sky=clear&event=july4']]) {
    console.log(`\n== bombadil: ${name} ${w}x${h}, ${limit} ==`);
    const out = `tmp/bombadil-${name}`;
    await mkdir(out, { recursive: true });
    const args = ['browser', 'test', '--headless', '--exit-on-violation', '--time-limit', limit, '--width', String(w), '--height', String(h),
      '--output-path', `${out}/trace.bin`, '--output-path-overwrite'];
    if (process.env.BOMBADIL_NO_SANDBOX || process.env.CI) args.push('--no-sandbox');
    args.push(`http://127.0.0.1:${server.port}/${hash}`, 'tests/ui/spec.ts');
    const child = spawn('node_modules/.bin/bombadil', args, { stdio: 'inherit', env: { ...process.env, CHROME: chrome } });
    const [code, signal] = await once(child, 'exit');
    if (signal || code !== 0) { failed++; console.log(`bombadil ${name}: ${signal || 'exit ' + code}; trace in ${out}/trace.bin`); }
  }
} finally {
  await server.close();
}
process.exitCode = failed ? 1 : 0;
