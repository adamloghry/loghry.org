// No-browser checks on the built site. Run after a build:  node scripts/verify-static.mjs [dir=dist]
// Also a flake check against the Nix-built package. Exits non-zero on any failure.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED = ['index.html', '404.html', '_headers', 'robots.txt', 'humans.txt', 'llms.txt', 'site.webmanifest',
  'favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'og.jpg', 'sitemap-index.xml'];
// Hosts the page may link out to (the photo credit). Everything it loads must be its own.
const LINK_HOSTS = new Set(['unsplash.com']);
const SITE = 'https://loghry.org';
const BANNED = [/akl\.io\b/i, /googletagmanager/i, /gtag\(/, /keybase/i];
const MAX_BYTES = 8 * 1024 * 1024;
const TEXT = new Set(['.html', '.css', '.js', '.txt', '.xml', '.json', '.webmanifest', '.md', '.svg', '']);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else if (e.isFile()) out.push(p);
  }
  return out;
}

// Same origin: root-relative, relative, or this site's own absolute URL. Not protocol-relative, not data:/http(s) elsewhere.
const sameOrigin = (u) => {
  u = u.trim();
  if (u === '' || u.startsWith('#')) return true;
  if (u.startsWith('//')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u === SITE || u.startsWith(SITE + '/');
  return true;
};
const attrs = (html, re) => [...html.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]);

export async function checkDist(dir) {
  const files = await walk(dir);
  const rel = (p) => relative(dir, p);
  const text = {};
  for (const f of files) if (TEXT.has(extname(f))) text[rel(f)] = await readFile(f, 'utf8');
  const html = Object.entries(text).filter(([n]) => n.endsWith('.html'));
  const css = Object.entries(text).filter(([n]) => n.endsWith('.css'));
  const results = [];
  const check = (id, problems, what) => results.push({ id, ok: problems.length === 0, msg: problems.length ? `${what}: ${problems.join(', ')}` : what });

  check('S-FILES', REQUIRED.filter((f) => !files.some((p) => rel(p) === f)).map((f) => 'missing ' + f), 'required files exist');

  const inline = [];
  for (const [n, h] of html) for (const m of h.matchAll(/<script\b([^>]*)>/gi)) {
    const a = m[1];
    if (!/\ssrc\s*=/i.test(a) && !/type\s*=\s*["']?application\/ld\+json/i.test(a)) inline.push(n);
  }
  check('S-SCRIPT', inline, 'no inline executable <script>');

  const foreign = [];
  for (const [n, h] of html) {
    const urls = [
      ...attrs(h, /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi),
      ...attrs(h, /\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi).flatMap((s) => s.split(',').map((c) => c.trim().split(/\s+/)[0])),
      ...[...h.matchAll(/<link\b[^>]*>/gi)].flatMap((m) => attrs(m[0], /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)),
    ];
    for (const u of urls) if (!sameOrigin(u)) foreign.push(`${n} ${u}`);
  }
  for (const [n, c] of css) for (const m of c.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const u = m[1] ?? m[2] ?? m[3];
    if (!sameOrigin(u)) foreign.push(`${n} ${u.slice(0, 40)}`);
  }
  check('S-ORIGIN', foreign, 'everything loaded is same-origin');

  const links = [];
  for (const [n, h] of html) for (const m of h.matchAll(/<a\b[^>]*\shref\s*=\s*"([^"]*)"/gi)) {
    const u = m[1];
    if (!/^https?:/i.test(u) || u === SITE || u.startsWith(SITE + '/')) continue;
    const host = new URL(u).hostname.replace(/^www\./, '');
    if (!LINK_HOSTS.has(host)) links.push(`${n} ${u}`);
  }
  check('S-LINKS', links, 'outbound links only to ' + [...LINK_HOSTS].join(', '));

  const banned = [];
  for (const [n, t] of Object.entries(text)) for (const re of BANNED) if (re.test(t)) banned.push(`${n} ${re.source}`);
  check('S-BANNED', banned, 'no retired domain, analytics or keybase');

  const headers = text['_headers'] || '';
  const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith('/*')) || '';
  const csp = block.split('\n').map((l) => l.trim()).find((l) => l.startsWith('Content-Security-Policy:'))?.slice(24).trim() || '';
  const dirs = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
  const cspProblems = [];
  if (!csp) cspProblems.push('no CSP on /*');
  if ((dirs['default-src'] || []).join(' ') !== "'none'") cspProblems.push("default-src is not 'none'");
  if (!dirs['script-src']) cspProblems.push('no script-src');
  if ((dirs['script-src'] || []).some((v) => /unsafe-(inline|eval)/.test(v))) cspProblems.push('script-src allows unsafe-*');
  check('S-CSP', cspProblems, "CSP default-src 'none', no unsafe scripts");

  let bytes = 0;
  for (const f of files) bytes += (await stat(f)).size;
  check('S-SIZE', bytes > MAX_BYTES ? [`${(bytes / 1048576).toFixed(1)} MB`] : [], `dist is ${(bytes / 1048576).toFixed(1)} MB (budget 8 MB)`);

  const locs = Object.entries(text).filter(([n]) => /^sitemap-(?!index).*\.xml$/.test(n))
    .flatMap(([, t]) => [...t.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
  const sm = [];
  if (!locs.includes(SITE + '/')) sm.push('home page not listed');
  for (const l of locs) if (/404/.test(l)) sm.push('lists ' + l);
  check('S-SITEMAP', sm, 'sitemap lists the home page and not the 404');

  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || new URL('../dist', import.meta.url).pathname;
  const results = await checkDist(dir);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}  ${r.msg}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
