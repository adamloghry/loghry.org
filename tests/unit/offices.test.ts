import { describe, it, expect } from 'vitest';
import { officeFloorsLit, OFFICE_GROUPS } from '../../src/sky/model';
import { Hero } from '../../src/sky/hero';

// Owner, 2026-11-22: downtown office floors switch off through the evening and on before dawn, in groups.
const TUE = 2, SAT = 6, SUN = 0;
const on = (hr: number, dow = TUE) => officeFloorsLit(hr, dow).filter((x) => x > 0.5).length;

describe('office floors by the clock', () => {
  it('has eight groups', () => expect(OFFICE_GROUPS).toBe(8));
  it('a weekday afternoon: all lit', () => expect(on(14)).toBe(8));
  it('switch off one group at a time through the evening', () => {
    const seq = [16.9, 17.5, 18, 18.5, 19, 20, 21, 23].map((h) => on(h));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThanOrEqual(seq[i - 1]);
    expect(seq[0]).toBe(8); expect(seq.at(-1)).toBe(1);
  });
  it('one group (cleaners, security, 24-hour floors) stays on all night', () => {
    for (const h of [0, 2, 4]) expect(on(h)).toBe(1);
  });
  it('come back on before and through the morning commute', () => {
    expect(on(6)).toBe(1); expect(on(7.1)).toBeGreaterThanOrEqual(3); expect(on(8.25)).toBe(8);
  });
  it('switch in minutes, not hours', () => {
    const g = (hr: number) => officeFloorsLit(hr, TUE)[0];
    expect(g(17.25 - 0.1)).toBeGreaterThan(0.95); expect(g(17.25 + 0.1)).toBeLessThan(0.05);
  });
  it('weekends: offices mostly dark', () => {
    for (const d of [SAT, SUN]) expect(on(14, d)).toBeLessThanOrEqual(4);
  });
});

describe('the hero shows the groups as layers', () => {
  const v = (moment: string) => new Hero({ moment, sky: 'clear', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
  it('at 7 PM on a Tuesday some tower groups are lit and some dark', () => {
    const r = v('2026-11-17T19:00');
    expect(r.towers).toHaveLength(8);
    const ops = r.towers.map((t: any) => +t.opacity);
    expect(ops.filter((o: number) => o > 0.3).length).toBeGreaterThan(0);
    expect(ops.filter((o: number) => o < 0.05).length).toBeGreaterThan(0);
  });
  it('at noon the tower layers are off (daylight)', () => {
    expect(v('2026-11-17T12:00').towers.every((t: any) => +t.opacity < 0.05)).toBe(true);
  });
});
