import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Hero, template } from '../../src/sky/hero';

const v = (moment: string, skyName: string) => new Hero({ moment, sky: skyName, box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
const lanes = JSON.parse(readFileSync('src/sky/i5_lanes.json', 'utf8'));
const css = readFileSync('src/styles/i5-clouds.css', 'utf8');

// CSS cubic-bezier: progress at time fraction t (solve x(s) = t, return y(s))
const bezier = ([x1, y1, x2, y2]: number[], t: number) => {
  const c = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (c(x1, x2, m) < t) lo = m; else hi = m; }
  return c(y1, y2, (lo + hi) / 2);
};
// clear-sky value at a fraction of the lane's length
const clearAt = (dir: 'nb' | 'sb', f: number) => {
  const P: number[][] = lanes[dir], C: number[] = lanes.clear[dir];
  const d = [0]; for (let i = 1; i < P.length; i++) d.push(d[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const target = f * d[d.length - 1]; let i = d.findIndex((x) => x >= target); if (i < 0) i = d.length - 1;
  return C[i];
};
const stops = (name: string) => {
  const body = new RegExp(`@keyframes ${name}\\{(.*?)\\}\\}`).exec(css)![1];
  return [...body.matchAll(/([\d.]+)%\{opacity:([\d.]+)/g)].map((m) => [+m[1] / 100, +m[2]]);
};

// Owner, 2026-11-23: cars must not float over the photo's clouds or show through fog. A CSS mask over the moving
// traffic did that but cost two-thirds of the frame rate on software rendering (CI: clear day 61 -> 33 fps), and hid
// the ferries, because the hazy Elliott Bay reads as cloud. Each I-5 car now fades by an opacity animation baked per lane.
describe('cars stay under clouds and fog, cheaply', () => {
  it('no moving-traffic layer is masked (a mask re-composites the whole layer every frame)', () => {
    for (const show of ['ferries', 'dayCars', 'cars']) {
      const block = template.slice(template.indexOf(`<sc-if value="{{show.${show}}}">`));
      expect(block.slice(0, 300), show).not.toMatch(/lk-clearmask/);
    }
  });
  it('I-5 cars run a per-lane cloud fade alongside their motion, with the easing from the bake', () => {
    const mv = (new Hero({ box: () => ({ w: 1440, h: 900 }) }) as any).buildMovers(false);
    for (const dir of ['nb', 'sb'] as const) {
      const c = mv.cars.find((x: any) => x.road === 'i5' && x.dir === dir);
      const ease = 'cubic-bezier(' + lanes.ease[dir].join(',') + ')';
      for (const style of [c.style, c.dayStyle]) expect(style).toMatch(new RegExp(`animation:lk-(in|out) ([\\d.]+)s ${ease.replace(/[().]/g, '\\$&')} infinite,lk-i5${dir}-cloud \\2s linear infinite`));
    }
  });
  for (const dir of ['nb', 'sb'] as const) {
    it(`the ${dir} fade follows the car under the photo's clouds`, () => {
      const S = stops(`lk-i5${dir}-cloud`);
      expect(S.length).toBeGreaterThan(40);
      for (const [t, o] of S) {
        const along = bezier(lanes.ease[dir], t);   // offset-distance runs along the stored path, eased
        const end = dir === 'nb' ? Math.min(1, t / 0.12) : Math.min(1, (1 - t) / 0.12);   // the far-end fade of lk-in / lk-out
        expect(o, `t ${t}`).toBeCloseTo(end * clearAt(dir, along), 1);
      }
      expect(S.some(([t, o]) => t > 0.15 && t < 0.85 && o < 0.2)).toBe(true);   // it really passes under a cloud
    });
  }
  it('fog thins the traffic out of sight', () => {
    const clear = v('2026-10-15T08:00', 'clear'), fog = v('2026-10-15T08:00', 'fog');
    expect(+fog.dayCarsOpacity).toBeLessThan(+clear.dayCarsOpacity * 0.4);
    const nClear = v('2026-12-15T07:00', 'clear'), nFog = v('2026-12-15T07:00', 'fog');
    expect(+nFog.carsOpacity).toBeLessThan(+nClear.carsOpacity * 0.4);
  });
});
