// node --test scripts/serve.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { serve } from './serve.mjs';

const root = await mkdtemp(join(tmpdir(), 'serve-'));
const dist = join(root, 'dist');
await mkdir(join(dist, '_astro'), { recursive: true });
await writeFile(join(dist, 'index.html'), '<h1>home</h1>');
await writeFile(join(dist, '404.html'), '<h1>Not here</h1>');
await writeFile(join(dist, '_astro', 'a.js'), 'x');
await writeFile(join(root, 'secret.txt'), 'secret');
await symlink(join(root, 'secret.txt'), join(dist, 'link.txt'));
await writeFile(join(dist, '_headers'), "/*\n  Content-Security-Policy: default-src 'none'\n  X-Content-Type-Options: nosniff\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n");
const srv = await serve(dist, 0);
after(() => srv.close());

// raw path, so the client does not normalise ../ away
const get = (path) => new Promise((resolve, reject) => {
  request({ host: '127.0.0.1', port: srv.port, path, method: 'GET' }, (res) => {
    let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject).end();
});

test('serves / as index.html with the /* headers', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.equal(r.body, '<h1>home</h1>');
  assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(r.headers['content-security-policy'], "default-src 'none'");
  assert.equal(r.headers['cache-control'], undefined);
});
test('applies path-specific blocks on top of /*', async () => {
  const r = await get('/_astro/a.js');
  assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['content-type'], 'text/javascript; charset=utf-8');
});
test('unknown paths get 404.html with status 404', async () => {
  const r = await get('/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body, '<h1>Not here</h1>');
});
test('path traversal cannot leave dist', async () => {
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/_astro/..%2f..%2fsecret.txt']) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.notEqual(r.body, 'secret', p);
  }
});
test('symlinks pointing outside dist are not followed', async () => {
  const r = await get('/link.txt');
  assert.equal(r.status, 404);
  assert.notEqual(r.body, 'secret');
});
test('the query string and hash are ignored', async () => {
  assert.equal((await get('/?x=1')).status, 200);
});
