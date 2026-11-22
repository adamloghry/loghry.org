// Preview hooks, which double as shareable-moment links (see docs/handoff/README.md):
//   #t=2026-07-04T22:25 (Seattle wall time) &sky=… &event=… &moon=… &lights=drawn
export type Hooks = { moment?: string; sky?: string; event?: string; moon?: string; lightStyle?: string };

const KEYS: Record<string, keyof Hooks> = { t: 'moment', sky: 'sky', event: 'event', moon: 'moon', lights: 'lightStyle' };

export function parseHooks(hash: string): Hooks {
  const out: Hooks = {};
  for (const pair of hash.replace(/^#/, '').split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const key = KEYS[pair.slice(0, eq)];
    if (!key || key in out) continue;
    let value = pair.slice(eq + 1);
    try { value = decodeURIComponent(value); } catch { /* keep it as written */ }
    if (value) out[key] = value;
  }
  return out;
}
