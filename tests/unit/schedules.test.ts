import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { sky, ferriesAt, seaplaneAt, aircraftAt, FERRY_VISIBLE_S } from '../../src/sky/model';
import { Hero } from '../../src/sky/hero';

// Owner, 2026-11-22: real-world-shaped schedules for the moving things. Typical patterns, not timetables.
const at = (mo: number, d: number, h: number, mi: number, s = 0) => sky.toUtc(2026, mo, d, h, mi) + s * 1000;
const countOver = (fn: (ms: number) => unknown[], mo: number, d: number, from: number, to: number, stepMin = 1) => {
  let n = 0; for (let m = from * 60; m < to * 60; m += stepMin) n += fn(at(mo, d, Math.floor(m / 60), m % 60)).length; return n;
};

describe('ferries from Colman Dock', () => {
  it('a Bainbridge boat that just left Seattle is in the bay, heading out', () => {
    const f = ferriesAt(at(11, 18, 8, 50));   // Wednesday morning
    expect(f.some((x) => x.route === 'bainbridge' && x.dir === 'out' && x.elapsedS >= 0 && x.elapsedS <= FERRY_VISIBLE_S)).toBe(true);
  });
  it('boats come in as well as go out, on both routes, over a day', () => {
    const seen = new Set<string>();
    for (let m = 5 * 60; m < 24 * 60; m += 3) for (const x of ferriesAt(at(11, 18, Math.floor(m / 60), m % 60))) seen.add(x.route + ':' + x.dir);
    expect([...seen].sort()).toEqual(['bainbridge:in', 'bainbridge:out', 'bremerton:in', 'bremerton:out']);
  });
  it('the bay is busier at 8 AM than at 3 AM', () => {
    expect(countOver(ferriesAt, 11, 18, 7, 9)).toBeGreaterThan(countOver(ferriesAt, 11, 18, 2, 4) + 20);
  });
  it('elapsed time advances with the clock (so a shared link shows the boat where it would be)', () => {
    const a = ferriesAt(at(11, 18, 8, 50, 0)).find((x) => x.route === 'bainbridge' && x.dir === 'out')!;
    const b = ferriesAt(at(11, 18, 8, 50, 30)).find((x) => x.route === 'bainbridge' && x.dir === 'out')!;
    expect(b.elapsedS - a.elapsedS).toBe(30);
  });
});

describe('seaplanes on Lake Union', () => {
  const moves = (mo: number) => { let n = 0; for (let s = 0; s < 86400; s += 20) if (seaplaneAt(sky.toUtc(2026, mo, 15, 0, 0) + s * 1000)) n++; return n; };
  it('more movements in summer than in winter, none at night', () => {
    expect(moves(7)).toBeGreaterThan(moves(1) * 1.5);
    for (const h of [0, 3, 22]) expect(seaplaneAt(at(7, 15, h, 30))).toBeNull();
  });
  it('a movement is visible for under a minute', () => {
    let longest = 0, run = 0;
    for (let s = 0; s < 3 * 3600; s += 2) { if (seaplaneAt(at(7, 15, 9, 0, s))) longest = Math.max(longest, ++run * 2); else run = 0; }
    expect(longest).toBeGreaterThan(20); expect(longest).toBeLessThanOrEqual(60);
  });
});

describe('aircraft at night', () => {
  it('fly in the evening, rarely in the small hours', () => {
    expect(countOver(aircraftAt, 11, 18, 20, 22)).toBeGreaterThan(countOver(aircraftAt, 11, 18, 2, 4) * 3);
    expect(countOver(aircraftAt, 11, 18, 20, 22)).toBeGreaterThan(0);
  });
  it('are only ever airliners', () => {
    for (let m = 0; m < 1440; m += 1) for (const a of aircraftAt(at(8, 2, Math.floor(m / 60), m % 60))) expect(a.kind).toBe('airliner');
  });
});

describe('no Blue Angels, ever (owner, 2026-11-22)', () => {
  it('no airshow event in the calendar, nothing in the page code', () => {
    expect(JSON.stringify(sky.calendar())).not.toMatch(/blue ?angel|airshow|seafair|jet/i);
    for (const f of readdirSync('src/sky')) expect(readFileSync('src/sky/' + f, 'utf8'), f).not.toMatch(/blue ?angel|airshow/i);
  });
  it('the first weekend of August (Seafair) has the same quiet sky as any other', () => {
    for (let m = 600; m < 1080; m += 2) {
      const a = aircraftAt(at(8, 1, Math.floor(m / 60), m % 60));
      expect(a.every((x) => x.kind === 'airliner')).toBe(true);
    }
  });
});

describe('the hero draws them', () => {
  const v = (moment: string, extra = {}) => new Hero({ moment, box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c', ...extra }).renderVals();
  it('a morning sailing appears by day as a hull with its animation phase from the clock', () => {
    const r = v('2026-11-18T08:50', { sky: 'clear' });
    expect(r.show.ferries).toBe(true);
    expect(r.ferries.length).toBeGreaterThan(0);
    expect(r.ferries[0].style).toMatch(/animation:lk-ferry-run \d+s linear forwards;animation-delay:-\d+(\.\d)?s/);
  });
  it('night aircraft show at 9 PM in clear weather', () => {
    let n = 0; for (let m = 0; m < 60; m++) n += v(`2026-11-18T21:${String(m).padStart(2, '0')}`, { sky: 'clear' }).aircraft.length;
    expect(n).toBeGreaterThan(0);
  });
});
