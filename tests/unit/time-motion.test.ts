import { describe, it, expect, afterEach, vi } from 'vitest';
import { sky, lapseMoment, dragMinutes } from '../../src/sky/model';
import { Hero } from '../../src/sky/hero';
import { Almanac } from '../../src/sky/almanac';

// Owner, 2026-11-22: the almanac follows the moment shown; time-lapse a day and a year; drag the photo to scrub.
afterEach(() => vi.useRealTimers());
const at = (y: number, mo: number, d: number, h: number, mi: number) => sky.toUtc(y, mo, d, h, mi);

describe('time-lapse moments', () => {
  const base = at(2026, 6, 21, 12, 0);
  it('a day passes in 30 seconds', () => {
    const p = sky.parts(lapseMoment('day', base, 15000));
    expect([p.d, p.h, p.mi]).toEqual([22, 0, 0]);
    const q = sky.parts(lapseMoment('day', base, 30000));
    expect([q.d, q.h]).toEqual([22, 12]);
  });
  it('a year passes in 36.5 seconds, one day per tenth of a second, at the same Seattle clock time', () => {
    const p = sky.parts(lapseMoment('year', base, 5000));     // 50 days later
    expect([p.mo, p.d, p.h, p.mi]).toEqual([8, 10, 12, 0]);
    const w = sky.parts(lapseMoment('year', base, 18000));    // 180 days later, across the November clock change
    expect([p.h, w.h, w.mi]).toEqual([12, 12, 0]);
    expect(w.off).toBe(-480);
  });
});

describe('dragging the photo', () => {
  it('one full width is twelve hours, right is later', () => {
    expect(dragMinutes(500, 1000)).toBe(360);
    expect(dragMinutes(-1000, 1000)).toBe(-720);
  });
});

const props = (extra = {}) => ({ box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c', ...extra });

describe('the hero reports the moment it shows', () => {
  it('a preview moment is reported; live is reported as null', async () => {
    const seen: (number | null)[] = [];
    new Hero(props({ moment: '2026-07-04T22:25', onMoment: (ms: number | null) => seen.push(ms) })).renderVals();
    new Hero(props({ onMoment: (ms: number | null) => seen.push(ms) })).renderVals();
    await Promise.resolve();
    expect(seen).toEqual([at(2026, 7, 4, 22, 25), null]);
  });
  it('reports only when the moment changes', async () => {
    const seen: unknown[] = []; const h = new Hero(props({ moment: '2026-07-04T22:25', onMoment: (ms: unknown) => seen.push(ms) }));
    h.renderVals(); h.renderVals(); await Promise.resolve();
    expect(seen).toHaveLength(1);
  });
  it('a time-lapse drives the shown moment', () => {
    const h: any = new Hero(props({ moment: '2026-06-21T12:00' }));
    h.state.lapse = { kind: 'day', t0: 1000, base: at(2026, 6, 21, 12, 0) }; h.state.lapseNow = 1000 + 7500;
    expect(h.renderVals().clock).toMatch(/^6:00 PM PDT/);
    expect(h.renderVals().rootClass).toContain('lk-lapse');
  });
  it('offers play controls with the time panel, but not under reduced motion', () => {
    const h: any = new Hero(props()); h.state.scrub = true;
    const v = h.renderVals();
    expect(v.canLapse).toBe(true);
    expect(v.dayLapseLabel).toBe('play day'); expect(v.yearLapseLabel).toBe('play year');
    h.reduced = true;
    expect(h.renderVals().canLapse).toBe(false);
  });
});

describe('the almanac follows the shown moment', () => {
  it('shows that day and says so', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-22T20:00:00Z'));
    const a: any = new Almanac({ photoCredit: 'x', photoUrl: 'y' });
    a.state.fixed = at(2026, 7, 4, 22, 25);
    const v = a.renderVals();
    expect(v.dateLabel).toBe('Saturday, July 4, 2026 · PDT');
    expect(v.title).toBe('That day over Lake Union');
    expect(v.dayRead).toMatch(/^At 10:25 PM PDT/);
    expect(v.yearRead).toMatch(/^Jul 4 · 15h \d\dm of daylight/);
    expect(v.monthName).toBe('July');
  });
  it('live, it is today', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-22T20:00:00Z'));
    const v = (new Almanac({ photoCredit: 'x', photoUrl: 'y' }) as any).renderVals();
    expect(v.title).toBe('Today over Lake Union');
    expect(v.yearRead).toMatch(/^Today, Nov 22/);
  });
});
