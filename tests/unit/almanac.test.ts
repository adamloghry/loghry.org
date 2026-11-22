import { describe, it, expect, afterEach, vi } from 'vitest';
import { Almanac } from '../../src/sky/almanac';
import { Hero } from '../../src/sky/hero';

afterEach(() => vi.useRealTimers());

const minutes = (dur: string) => { const m = /^(\d+)h (\d\d)m$/.exec(dur)!; return +m[1] * 60 + +m[2]; };
const almanacAt = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); return new Almanac({ photoCredit: 'x', photoUrl: 'y' }).renderVals(); };
const strings = (v: unknown): string[] => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

describe('almanac', () => {
  it('the summer solstice has about 16 hours of daylight', () => {
    expect(minutes(almanacAt('2026-06-21T20:00:00Z').dayLen)).toBeGreaterThanOrEqual(15 * 60 + 55);
  });
  it('the winter solstice has under 8h 30m', () => {
    expect(minutes(almanacAt('2026-12-21T20:00:00Z').dayLen)).toBeLessThanOrEqual(8 * 60 + 30);
  });
  it('labels the date in Seattle, not UTC (late evening Seattle is the next day in UTC)', () => {
    const v = almanacAt('2026-11-23T06:30:00Z'); // 10:30 PM PST on the 22nd
    expect(v.dateLabel).toBe('Sunday, November 22, 2026 · PST');
    expect(v.monthName).toBe('November');
  });
  it('switches to PDT in summer', () => {
    expect(almanacAt('2026-07-04T19:00:00Z').dateLabel).toMatch(/· PDT$/);
  });
  it('renders no NaN or undefined anywhere through the year', () => {
    for (let m = 0; m < 12; m++) {
      const all = strings(almanacAt(new Date(Date.UTC(2026, m, 15, 19)).toISOString()));
      expect(all.filter((s) => /NaN|undefined/.test(s))).toEqual([]);
    }
  });
});

describe('hero with malformed preview hooks', () => {
  it('falls back to now and renders a real clock', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-22T21:00:00Z'));
    const v = new Hero({ moment: 'garbage', sky: 'nope', event: '??', moon: 'x', lightStyle: 'y', box: () => ({ w: 1440, h: 900 }), siteUrl: 'https://loghry.org/', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
    expect(v.clock).toMatch(/^1:00 PM PST/);
    expect(strings({ clock: v.clock, status: v.status }).join(' ')).not.toMatch(/NaN|undefined/);
  });
});
