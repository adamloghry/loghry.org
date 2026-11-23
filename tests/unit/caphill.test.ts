import { describe, it, expect } from 'vitest';
import { template } from '../../src/sky/hero';

// Owner, 2026-11-23: red obstruction lights up on Capitol Hill (east of I-5, left of downtown in this view).
describe('red obstruction lights', () => {
  const beacons = [...template.matchAll(/class="lk-blink" style="position: absolute; left: (\d+)px; top: (\d+)px/g)].map((m) => ({ x: +m[1] / 1440, y: +m[2] / 1440 }));
  it('blink on Capitol Hill as well as downtown and the Needle', () => {
    const hill = beacons.filter((b) => b.x > 0.2 && b.x < 0.39 && b.y > 0.18 && b.y < 0.23);
    expect(hill.length).toBeGreaterThanOrEqual(3);
    expect(beacons.filter((b) => b.x >= 0.42).length).toBeGreaterThanOrEqual(3);   // the existing ones stay
  });
});

describe('map credit (OpenStreetMap ODbL)', () => {
  it('the gear panel credits OpenStreetMap contributors with a link to the copyright page', () => {
    expect(template).toMatch(/href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>[^<]*OpenStreetMap contributors/);
  });
});
