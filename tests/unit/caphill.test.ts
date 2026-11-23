import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Hero, template } from '../../src/sky/hero';

// Owner, 2026-11-23: red obstruction lights must sit on real structures. They are projected from OpenStreetMap through
// the fitted camera (bake/osm/beacons.py), not placed by hand.
describe('red obstruction lights', () => {
  const list = JSON.parse(readFileSync('src/sky/beacons.json', 'utf8'));
  const names = list.map((b: any) => b.name);
  it('come from the map: the Needle, Columbia Center, Queen Anne and Capitol Hill broadcast towers', () => {
    for (const n of ['Space Needle', 'Columbia Center', 'KOMO-TV tower, Queen Anne', 'KCTS/KUOW mast, Capitol Hill', 'KTZZ mast, Capitol Hill']) expect(names).toContain(n);
    expect(names.join()).not.toMatch(/Rainier Square/);   // built after the photo was taken
  });
  it('the Capitol Hill masts are at the far left of the frame, not on the houses near I-5', () => {
    for (const b of list.filter((b: any) => /Capitol Hill/.test(b.name))) { expect(b.x / 1440).toBeLessThan(0.13); expect(b.y / 1440).toBeGreaterThan(0.22); }
  });
  it('the page draws exactly these, and no hand-placed ones', () => {
    expect(template).not.toMatch(/class="lk-blink" style="position: absolute; left: \d+px/);
    const v = new Hero({ moment: '2026-11-18T21:00', sky: 'clear', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
    expect(v.show.beacons).toBe(true);
    expect(v.beacons.map((b: any) => [b.x, b.y])).toEqual(list.map((b: any) => [b.x, b.y]));
  });
});

describe('map credit (OpenStreetMap ODbL)', () => {
  it('the gear panel credits OpenStreetMap contributors with a link to the copyright page', () => {
    expect(template).toMatch(/href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>[^<]*OpenStreetMap contributors/);
  });
});
