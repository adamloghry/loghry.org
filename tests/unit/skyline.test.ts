import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { skylineLighting, LIGHTING_REVIEWED } from '../../src/sky/model';
import { Hero } from '../../src/sky/hero';

const at = (moment: string, skyName = 'clear') => new Hero({ moment, sky: skyName, box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
const beacons = JSON.parse(readFileSync('src/sky/beacons.json', 'utf8'));

describe('beacon heights (owner, 2026-11-23: published heights, not guesses)', () => {
  it('all three Capitol Hill towers, at 181-208 m', () => {
    expect(beacons.filter((b: any) => /Capitol Hill/.test(b.name))).toHaveLength(3);
  });
});

describe('beacons in the photo haze', () => {
  it('the Queen Anne towers stand in the photo cloud; the Needle does not', () => {
    const h = (n: string) => beacons.find((b: any) => b.name.startsWith(n)).haze;
    expect(h('KOMO')).toBeGreaterThan(0.4);
    expect(h('Space Needle')).toBeLessThan(0.1);
  });
  it('a hazy beacon is drawn larger, softer and dimmer', () => {
    const v = at('2026-11-18T21:00');
    const style = (n: string): string => v.beacons.find((b: any) => b.name.startsWith(n))!.style;
    expect(style('KOMO')).toMatch(/filter:blur\(\d/);
    expect(style('Space Needle')).not.toMatch(/filter:blur/);
    const op = (n: string) => +/opacity:([\d.]+)/.exec(style(n))![1];
    expect(op('KOMO')).toBeLessThan(op('Space Needle'));
  });
});

describe('Seattle lighting calendar (2026 + known 2027)', () => {
  const ev = (y: number, mo: number, d: number, h: number) => skylineLighting(y, mo, d, h);
  it('Space Needle in Seahawks colours on 2026 home game evenings', () => {
    for (const [mo, d] of [[9, 9], [10, 4], [10, 11], [10, 25], [11, 2], [11, 8], [12, 7], [12, 13], [12, 25]]) expect(ev(2026, mo, d, 20).needle, `${mo}/${d}`).toBe('seahawks');
    expect(ev(2026, 12, 26, 20).needle).toBe(null);
    expect(ev(2026, 12, 25, 9).needle).toBe(null);       // evening only
  });
  it('rainbow for Pride weekend, 2026 and 2027', () => {
    expect(ev(2026, 6, 28, 21).needle).toBe('pride');
    expect(ev(2027, 6, 26, 21).needle).toBe('pride');
    expect(ev(2026, 6, 21, 21).needle).toBe(null);
  });
  it('KING 5 tower holiday lights through December', () => {
    expect(ev(2026, 12, 15, 20).kingTree).toBe(true);
    expect(ev(2027, 1, 2, 20).kingTree).toBe(false);
    expect(ev(2026, 11, 20, 20).kingTree).toBe(false);
  });
  it('is reviewed yearly', () => expect(LIGHTING_REVIEWED).toBe(2026));
  it('the hero colours the Needle on a game night, only after dark', () => {
    expect(at('2026-12-25T20:00').show.needleColor).toBe(true);
    expect(at('2026-12-25T20:00').needleClass).toContain('lk-needle-seahawks');
    expect(at('2026-12-26T20:00').show.needleColor).toBe(false);
    expect(at('2026-12-15T20:00').show.kingTree).toBe(true);
  });
});
