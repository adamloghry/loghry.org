import { describe, it, expect } from 'vitest';
import { trafficLevel } from '../../src/sky/model';
import { Hero } from '../../src/sky/hero';

// Owner, 2026-11-22: traffic should follow the day (more in the morning, little very late at night), and I-5 should show
// both directions on their own sides: southbound on the right (west), northbound on the left (east).
const TUE = 2, SAT = 6;

describe('traffic by hour (Seattle time)', () => {
  it('is light in the small hours', () => {
    for (const h of [2, 3, 4]) { const t = trafficLevel(h, TUE); expect(t.nb).toBeLessThan(0.25); expect(t.sb).toBeLessThan(0.25); }
  });
  it('peaks southbound, into downtown, on a weekday morning', () => {
    const t = trafficLevel(7.75, TUE);
    expect(t.sb).toBeGreaterThanOrEqual(0.9);
    expect(t.sb).toBeGreaterThan(t.nb);
  });
  it('peaks northbound, out of downtown, on a weekday evening', () => {
    const t = trafficLevel(17, TUE);
    expect(t.nb).toBeGreaterThanOrEqual(0.9);
    expect(t.nb).toBeGreaterThan(t.sb);
  });
  it('is quieter late in the evening than at midday', () => {
    expect(trafficLevel(23, TUE).sb).toBeLessThan(trafficLevel(12, TUE).sb);
  });
  it('has no commuter peak on a weekend morning', () => {
    expect(trafficLevel(7.75, SAT).sb).toBeLessThan(trafficLevel(7.75, TUE).sb * 0.75);
  });
  it('changes smoothly within an hour (no jumps on the hour)', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const a = trafficLevel(h, TUE), b = trafficLevel(h + 0.25, TUE);
      expect(Math.abs(a.sb - b.sb)).toBeLessThan(0.2);
      expect(Math.abs(a.nb - b.nb)).toBeLessThan(0.2);
    }
  });
  it('stays within 0..1', () => {
    for (let h = 0; h < 24; h += 0.5) for (const d of [0, 1, 2, 3, 4, 5, 6]) {
      const t = trafficLevel(h, d);
      for (const v of [t.nb, t.sb]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
});

// x of a path 'M x y L x y ...' where it crosses height y (1440-px stage)
function xAt(path: string, y: number) {
  const pts = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  }
  return NaN;
}

describe('I-5 lanes', () => {
  const mv = (new Hero({ box: () => ({ w: 1440, h: 900 }) }) as any).buildMovers(false);
  const path = (c: { style: string }) => /offset-path:path\('([^']+)'\)/.exec(c.style)![1];
  const i5 = mv.cars.filter((c: any) => c.road === 'i5');
  const nb = i5.find((c: any) => c.dir === 'nb'), sb = i5.find((c: any) => c.dir === 'sb');
  it('northbound shows headlights, southbound taillights', () => {
    expect(nb.style).toContain('#e8ebf2');
    expect(sb.style).toContain('#e0402e');
  });
  it('northbound runs on the left (east) of southbound, each in its own carriageway (owner, 2026-11-23: hew to the road)', () => {
    for (const y of [600, 800, 1000]) expect(xAt(path(sb), y) - xAt(path(nb), y)).toBeGreaterThan(14);
  });
  it('the lanes follow the roadway measured on the photo', () => {
    // centre of the roadway read off the photo (stage px); the two lanes straddle it
    for (const [y, cx] of [[936, 89], [835, 156], [734, 229], [615, 301], [535, 365], [458, 507], [432, 551], [392, 580]] as const) {
      const mid = (xAt(path(sb), y) + xAt(path(nb), y)) / 2;
      expect(Math.abs(mid - cx), `at y ${y}`).toBeLessThan(9);
    }
  });
  it('the lanes converge with distance (perspective)', () => {
    expect(xAt(path(sb), 400) - xAt(path(nb), 400)).toBeLessThan(xAt(path(sb), 1000) - xAt(path(nb), 1000));
  });
});

describe('the hero shows traffic for the hour', () => {
  const shown = (moment: string) => {
    const v = new Hero({ moment, sky: 'clear', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
    return v.cars.filter((c: any) => c.road === 'i5' && !c.off).length;
  };
  it('a December 3 AM has far fewer cars than the 7:30 AM commute (both dark)', () => {
    const night = shown('2026-12-15T03:00'), rush = shown('2026-12-15T07:30');
    expect(night).toBeGreaterThan(0);
    expect(rush).toBeGreaterThan(night * 2.5);
  });
});

describe('I-5 has one source of truth', () => {
  it('the page and the bake trace the same I-5 control points', async () => {
    const { readFileSync } = await import('node:fs');
    const nums = (s: string) => [...s.matchAll(/-?\d*\.\d+/g)].map((m) => +m[0]);
    const bake = /^I5_CP = \[([\s\S]*?)\]$/m.exec(readFileSync('bake/scripts/lights.py', 'utf8'))![1];
    const page = /const I5_CP = \[([\s\S]*?)\];/.exec(readFileSync('src/sky/hero.ts', 'utf8'))![1];
    expect(nums(page)).toEqual(nums(bake));
    const bakeH = /^I5_HALF = \[([\s\S]*?)\]$/m.exec(readFileSync('bake/scripts/lights.py', 'utf8'))![1];
    const pageH = /const I5_HALF = \[([\s\S]*?)\];/.exec(readFileSync('src/sky/hero.ts', 'utf8'))![1];
    expect(nums(pageH)).toEqual(nums(bakeH));
    expect(nums(bake).length).toBeGreaterThanOrEqual(30);
  });
});

describe('I-5 into the distance (owner, 2026-11-23: fade, never cut through buildings)', () => {
  it('car lanes stop where the freeway disappears into downtown', () => {
    const mv = (new Hero({ box: () => ({ w: 1440, h: 900 }) }) as any).buildMovers(false);
    for (const c of mv.cars.filter((x: any) => x.road === 'i5')) {
      const ys = [.../offset-path:path\('([^']+)'\)/.exec(c.style)![1].matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((m) => +m[1]);
      expect(Math.min(...ys) / 1440).toBeGreaterThanOrEqual(0.215);
    }
  });
  it('cars fade in at the far end and out again, instead of popping', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/layers.css', 'utf8');
    expect(/@keyframes lk-in\{from\{[^}]*opacity:0/.test(css) || /@keyframes lk-in\{0%\{[^}]*opacity:0/.test(css)).toBe(true);
    expect(/@keyframes lk-out\{.*100%\{[^}]*opacity:0/.test(css) || /@keyframes lk-out\{.*to\{[^}]*opacity:0/.test(css)).toBe(true);
  });
});
