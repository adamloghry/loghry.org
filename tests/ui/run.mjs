// Serves dist/ with production headers and lets Bombadil explore it. Usage: node tests/ui/run.mjs [time-limit, default 60s]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';

if (!existsSync('dist/index.html')) { console.error('dist/ is missing: run `npm run build` first'); process.exit(2); }
const port = 4399, limit = process.argv[2] || '60s';
const server = await serve('dist', port);
const runs = [['desktop', 1280, 800], ['phone', 390, 844]];
let failed = 0;
for (const [name, w, h] of runs) {
  console.log(`\n== bombadil: ${name} ${w}x${h}, ${limit} ==`);
  const args = ['bombadil', 'browser', 'test', '--headless', '--exit-on-violation', '--time-limit', limit, '--width', String(w), '--height', String(h),
    '--output-path', `/tmp/bombadil-${name}.bin`, '--output-path-overwrite'];
  if (process.env.BOMBADIL_NO_SANDBOX) args.push('--no-sandbox');
  args.push(`http://127.0.0.1:${port}/`, 'tests/ui/spec.ts');
  const code = await new Promise((ok) => spawn('npx', args, { stdio: 'inherit' }).on('exit', ok));
  if (code !== 0) failed++;
}
server.close();
process.exit(failed ? 1 : 0);
