// Serves dist/ the way Cloudflare Pages will: applies public/_headers, and 404.html for unknown paths.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

function parseHeaders(file) {
  const rules = []; let cur = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); }
    else if (cur) { const i = line.indexOf(':'); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return rules;
}

export function serve(root = 'dist', port = 4321) {
  const rules = existsSync(join(root, '_headers')) ? parseHeaders(join(root, '_headers')) : [];
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    let file = normalize(join(root, path));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    let status = 200;
    if (!file.startsWith(normalize(root)) || !existsSync(file)) { file = join(root, '404.html'); status = 404; }
    const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' };
    for (const r of rules) if (r.pattern.endsWith('*') ? path.startsWith(r.pattern.slice(0, -1)) : path === r.pattern) Object.assign(headers, r.headers);
    res.writeHead(status, headers); res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) { await serve(process.argv[2] || 'dist', +(process.argv[3] || 4321)); console.log('serving on http://127.0.0.1:' + (process.argv[3] || 4321)); }
