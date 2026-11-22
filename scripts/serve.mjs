// A small static server for tests: serves dist/ the way Cloudflare static assets do for this site.
// - applies public/_headers (every matching block, in file order, so /* plus path-specific blocks)
// - / -> index.html, /foo -> foo.html, unknown paths -> 404.html with status 404
// - confined to the directory: no traversal, no symlinks pointing out
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, realpath, stat } from 'node:fs/promises';
import { join, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ pattern: line.trim(), headers: [] }); continue; }
    const i = line.indexOf(':');
    if (rules.length && i > 0) rules.at(-1).headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules.map((r) => ({ ...r, re: new RegExp('^' + r.pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$') }));
}

export async function serve(dir, port = 0, host = '127.0.0.1') {
  const root = await realpath(dir);
  let rules = [];
  try { rules = parseHeaders(await readFile(join(root, '_headers'), 'utf8')); } catch { /* no _headers */ }

  // resolve a URL path to a real file inside root, or null
  async function resolve(urlPath) {
    let p;
    try { p = decodeURIComponent(urlPath); } catch { return null; }
    if (p.includes('\0')) return null;
    const candidates = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'];
    for (const c of candidates) {
      try {
        const real = await realpath(join(root, c));
        if (real !== root && !real.startsWith(root + sep)) continue;
        if ((await stat(real)).isFile()) return real;
      } catch { /* try the next */ }
    }
    return null;
  }

  const server = createServer(async (req, res) => {
    const path = (req.url || '/').split(/[?#]/)[0];
    let file = await resolve(path), status = 200;
    if (!file) { file = await resolve('/404.html'); status = 404; }
    for (const r of rules) if (r.re.test(path)) for (const [k, v] of r.headers) res.setHeader(k, v);
    if (!file) { res.statusCode = 404; res.end(); return; }
    res.statusCode = status;
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  });
  server.listen(port, host);
  await once(server, 'listening');
  return { host: server.address().address, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // HOST picks the interface, e.g. HOST=$(tailscale ip -4) to share a demo on the tailnet only. Loopback by default.
  const s = await serve(process.argv[2] || 'dist', Number(process.env.PORT || 4329), process.env.HOST || '127.0.0.1');
  console.log(`serving on http://${s.host.includes(':') ? `[${s.host}]` : s.host}:${s.port}/`);
}
