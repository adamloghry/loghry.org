// node --test scripts/verify-static.test.mjs
// Each check gets a fixture that passes and one that fails it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkDist, REQUIRED } from './verify-static.mjs';

const CSP = "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'";
const GOOD_HTML = `<!doctype html><html><head><link rel="stylesheet" href="/_astro/a.css"><script type="module" src="/_astro/a.js"></script></head>
<body><h1>Loghry</h1><img src="/_astro/p.webp" srcset="/_astro/p.avif"><a href="https://unsplash.com/photos/x">credit</a><a href="/">home</a></body></html>`;

async function fixture(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'vs-'));
  const files = {
    ...Object.fromEntries(REQUIRED.map((f) => [f, 'x'])),
    'index.html': GOOD_HTML,
    '404.html': GOOD_HTML,
    '_headers': `/*\n  ${CSP}\n  X-Content-Type-Options: nosniff\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
    'sitemap-index.xml': '<sitemapindex><sitemap><loc>https://loghry.org/sitemap-0.xml</loc></sitemap></sitemapindex>',
    'sitemap-0.xml': '<urlset><url><loc>https://loghry.org/</loc></url></urlset>',
    '_astro/a.css': 'body{background:url(/_astro/p.webp)}',
    ...overrides,
  };
  for (const [name, body] of Object.entries(files)) {
    if (body === null) continue;
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), body);
  }
  return dir;
}
async function failing(overrides) {
  const dir = await fixture(overrides);
  try { return (await checkDist(dir)).filter((r) => !r.ok).map((r) => r.id); } finally { await rm(dir, { recursive: true }); }
}

test('a clean dist passes every check', async () => assert.deepEqual(await failing({}), []));
test('S-FILES: a missing required file fails', async () => assert.deepEqual(await failing({ 'llms.txt': null }), ['S-FILES']));
test('S-SCRIPT: an inline script fails', async () =>
  assert.deepEqual(await failing({ 'index.html': GOOD_HTML.replace('</body>', '<script>alert(1)</script></body>') }), ['S-SCRIPT']));
test('S-SCRIPT: a JSON-LD block is allowed', async () =>
  assert.deepEqual(await failing({ 'index.html': GOOD_HTML.replace('</head>', '<script type="application/ld+json">{}</script></head>') }), []));
test('S-ORIGIN: a third-party script fails', async () =>
  assert.deepEqual(await failing({ 'index.html': GOOD_HTML.replace('/_astro/a.js', 'https://www.googletagmanager.com/gtag/js') }), ['S-ORIGIN', 'S-BANNED']));
test('S-ORIGIN: a protocol-relative image fails', async () =>
  assert.deepEqual(await failing({ '404.html': GOOD_HTML.replace('src="/_astro/p.webp"', 'src="//cdn.example/p.webp"') }), ['S-ORIGIN']));
test('S-ORIGIN: a third-party url() in CSS fails', async () =>
  assert.deepEqual(await failing({ '_astro/a.css': 'body{background:url(https://fonts.example/x.woff2)}' }), ['S-ORIGIN']));
test('S-ORIGIN: a data: URI fails (the CSP allows only self)', async () =>
  assert.deepEqual(await failing({ '_astro/a.css': 'body{background:url(data:image/png;base64,AAAA)}' }), ['S-ORIGIN']));
test('S-LINKS: an outbound link to an unexpected host fails', async () =>
  assert.deepEqual(await failing({ 'index.html': GOOD_HTML.replace('https://unsplash.com/photos/x', 'https://example.com/') }), ['S-LINKS']));
test('S-BANNED: the retired domain fails', async () =>
  assert.deepEqual(await failing({ 'humans.txt': 'Site: https://akl.io' }), ['S-BANNED']));
test('S-BANNED: keybase fails', async () =>
  assert.deepEqual(await failing({ 'keybase.txt': 'I am akl on keybase' }), ['S-BANNED']));
test('S-CSP: unsafe-inline scripts fail', async () =>
  assert.deepEqual(await failing({ '_headers': `/*\n  ${CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")}\n` }), ['S-CSP']));
test('S-CSP: a missing default-src none fails', async () =>
  assert.deepEqual(await failing({ '_headers': `/*\n  ${CSP.replace("default-src 'none'", "default-src 'self'")}\n` }), ['S-CSP']));
test('S-SIZE: more than 8 MB fails', async () =>
  assert.deepEqual(await failing({ 'big.bin': Buffer.alloc(8 * 1024 * 1024 + 1) }), ['S-SIZE']));
test('S-SITEMAP: listing the 404 page fails', async () =>
  assert.deepEqual(await failing({ 'sitemap-0.xml': '<urlset><url><loc>https://loghry.org/</loc></url><url><loc>https://loghry.org/404/</loc></url></urlset>' }), ['S-SITEMAP']));
test('S-SITEMAP: missing the home page fails', async () =>
  assert.deepEqual(await failing({ 'sitemap-0.xml': '<urlset></urlset>' }), ['S-SITEMAP']));
test("S-CSP: style-src must keep 'unsafe-inline' (the template runtime writes style attributes; without it the photo layers break silently)", async () =>
  assert.deepEqual(await failing({ '_headers': `/*\n  ${CSP.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")}\n` }), ['S-CSP']));
test('S-ORIGIN: a third-party CSS @import without url() fails', async () =>
  assert.deepEqual(await failing({ '_astro/a.css': '@import "https://fonts.googleapis.com/css2?family=X";body{}' }), ['S-ORIGIN']));
test('S-ORIGIN: a third-party URL in a JS bundle fails', async () =>
  assert.deepEqual(await failing({ '_astro/a.js': 'fetch("https://api.example.com/weather").then(r=>r.json())' }), ['S-ORIGIN']));
test('S-ORIGIN: the photo-credit link and the site itself may appear in JS', async () =>
  assert.deepEqual(await failing({ '_astro/a.js': 'const u="https://unsplash.com/photos/x", s="https://loghry.org/", ns="http://www.w3.org/2000/svg"' }), []));
test('S-LINKS: the OpenStreetMap copyright link is allowed', async () =>
  assert.deepEqual(await failing({ 'index.html': GOOD_HTML.replace('<a href="/">home</a>', '<a href="https://www.openstreetmap.org/copyright">OSM</a>') }), []));
