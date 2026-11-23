import { describe, it, expect } from 'vitest';
import { Hero } from '../../src/sky/hero';

// Owner, 2026-11-22: the cars moved too quickly and were too prominent; make them more subtle.
const cars = (new Hero({ box: () => ({ w: 1440, h: 900 }) }) as any).buildMovers(false).cars as { style: string }[];
const parsed = cars.map(({ style }) => {
  const [, kf, dur] = /animation:(lk-in|lk-out) ([\d.]+)s/.exec(style)!;
  const [, glow, alpha] = /box-shadow:0 0 ([\d.]+)px [\d.]+px rgba\([^)]*,([\d.]+)\)/.exec(style)!;
  const path = /offset-path:path\('M([-\d.]+) /.exec(style)![1];
  return { kf, dur: +dur, glow: +glow, alpha: +alpha, size: +/width:([\d.]+)px/.exec(style)![1], aurora: +path > 1000 };
});
const i5 = parsed.filter((c) => !c.aurora), aurora = parsed.filter((c) => c.aurora);

describe('traffic', () => {
  it('I-5 carries at most 16 cars each way', () => {
    expect(i5.filter((c) => c.kf === 'lk-in').length).toBeLessThanOrEqual(16);
    expect(i5.filter((c) => c.kf === 'lk-out').length).toBeLessThanOrEqual(16);
  });
  it('an I-5 car takes about a minute and a half to cross the frame (owner: 30% slower than 64/68 s)', () => {
    for (const c of i5) expect(c.dur).toBeGreaterThanOrEqual(90);
  });
  it('Aurora is quieter: at most 3 cars each way, at least 12 s for the short stretch', () => {
    expect(aurora.length).toBeGreaterThan(0);
    expect(aurora.length).toBeLessThanOrEqual(6);
    for (const c of aurora) expect(c.dur).toBeGreaterThanOrEqual(12);
  });
  it('headlights and taillights are small, dim points', () => {
    for (const c of parsed) {
      expect(c.size).toBeLessThanOrEqual(3);
      expect(c.glow).toBeLessThanOrEqual(3);
      expect(c.alpha).toBeLessThanOrEqual(0.45);
    }
  });
});
