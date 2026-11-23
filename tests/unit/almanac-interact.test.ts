import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { illuminance, lightPhase } from '../../src/sky/model';
import { Almanac } from '../../src/sky/almanac';

// Owner, 2026-11-22: the almanac charts should answer back. Hovering (or touching, or arrowing) a point tells you
// what you are looking at; the day band gives estimated light levels.
afterEach(() => vi.useRealTimers());

describe('light model', () => {
  it('a high summer sun is roughly 100,000 lux under a clear sky', () => {
    expect(illuminance(64)).toBeGreaterThan(80000);
    expect(illuminance(64)).toBeLessThan(130000);
  });
  it('falls through the known twilight points', () => {
    expect(illuminance(0)).toBeGreaterThan(200); expect(illuminance(0)).toBeLessThan(1000);       // sunset, a few hundred lux
    expect(illuminance(-6)).toBeGreaterThan(1); expect(illuminance(-6)).toBeLessThan(10);         // end of civil twilight, ~3.4
    expect(illuminance(-18)).toBeLessThan(0.01);                                                   // night, starlight
  });
  it('never decreases as the sun climbs', () => {
    for (let el = -20; el < 90; el += 0.5) expect(illuminance(el + 0.5)).toBeGreaterThanOrEqual(illuminance(el));
  });
  it('names the phase', () => {
    expect(lightPhase(30)).toBe('daylight');
    expect(lightPhase(3)).toBe('golden hour');
    expect(lightPhase(-3)).toBe('civil twilight');
    expect(lightPhase(-9)).toBe('nautical twilight');
    expect(lightPhase(-15)).toBe('astronomical twilight');
    expect(lightPhase(-25)).toBe('night');
  });
});

const make = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); return new Almanac({ photoCredit: 'x', photoUrl: 'y' }) as any; };
const strings = (v: unknown): string[] => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

describe('day band readout', () => {
  it('at noon on the March equinox: daylight, tens of thousands of lux, and the typical-sky estimate is lower', () => {
    const a = make('2026-03-20T19:00:00Z'); a.state.hover = { chart: 'day', i: 12 * 60 + 15 };
    const r = a.renderVals().dayRead;
    expect(r).toMatch(/^12:15 PM PDT/);
    expect(r).toMatch(/daylight/);
    const lux = [...r.matchAll(/≈ ([\d,]+) lux/g)].map((m) => +m[1].replace(/,/g, ''));
    expect(lux).toHaveLength(2);
    expect(lux[0]).toBeGreaterThan(30000);
    expect(lux[1]).toBeLessThan(lux[0]);
  });
  it('late evening is night, in fractions of a lux', () => {
    const a = make('2026-03-20T19:00:00Z'); a.state.hover = { chart: 'day', i: 23 * 60 };
    expect(a.renderVals().dayRead).toMatch(/11:00 PM PDT.*night.*≈ 0\.\d+ lux/);
  });
  it('without a hover it describes now', () => {
    const a = make('2026-03-20T19:00:00Z');
    expect(a.renderVals().dayRead).toMatch(/^Now, 12:00 PM PDT/);
  });
  it('draws a cursor where the hover is', () => {
    const a = make('2026-03-20T19:00:00Z'); a.state.hover = { chart: 'day', i: 18 * 60 };
    expect(a.renderVals().dayCursorStyle).toMatch(/left:75\.00%/);
  });
});

describe('year chart readout', () => {
  it('a bar in early March names its dates, daylight and sunrise/sunset in PST (before the change)', () => {
    const a = make('2026-11-22T20:00:00Z');
    a.state.hover = { chart: 'year', i: 13 };       // bars every 5 days from Jan 1: day 66 = Mar 7
    const r = a.renderVals().yearRead;
    expect(r).toMatch(/^Mar 7–11/);
    expect(r).toMatch(/11h \d\dm of daylight/);
    expect(r).toMatch(/sunrise 6:[34]\d AM · sunset 6:0\d PM PST/);   // Seattle, Mar 7: about 6:37 AM / 6:01 PM (the almanac's formula is good to a few minutes)
    expect(r).toMatch(/[+−]\d+h \d\dm vs today/);
  });
  it('a bar after the change reads PDT', () => {
    const a = make('2026-11-22T20:00:00Z'); a.state.hover = { chart: 'year', i: 16 };   // day 81 = Mar 22
    expect(a.renderVals().yearRead).toMatch(/PDT/);
  });
  it('highlights the hovered bar', () => {
    const a = make('2026-11-22T20:00:00Z'); a.state.hover = { chart: 'year', i: 13 };
    const bars = a.renderVals().bars;
    expect(bars[13].style).toContain('#f4efe6');
  });
  it('without a hover it describes today', () => {
    expect(make('2026-11-22T20:00:00Z').renderVals().yearRead).toMatch(/^Today, Nov 22/);
  });
});

describe('month chart readout', () => {
  it('March: highs and lows, sun share, rain days, fog days', () => {
    const a = make('2026-11-22T20:00:00Z'); a.state.hover = { chart: 'month', i: 2 };
    expect(a.renderVals().monthRead).toBe('March · highs near 54°F, lows near 40°F · sun 48% of daylight hours · rain on 17 days · fog on about 2 days');
  });
  it('without a hover it describes this month', () => {
    expect(make('2026-11-22T20:00:00Z').renderVals().monthRead).toMatch(/^November/);
  });
});

describe('keys and pointer', () => {
  it('arrow keys step through each chart and stop at the ends', () => {
    const a = make('2026-11-22T20:00:00Z'); a.__draw = () => {};
    const v = a.renderVals();
    const key = (k: string) => ({ key: k, preventDefault() {} });
    v.onYearKey(key('Home')); expect(a.state.hover).toEqual({ chart: 'year', i: 0 });
    v.onYearKey(key('ArrowLeft')); expect(a.state.hover.i).toBe(0);
    v.onYearKey(key('End')); expect(a.state.hover.i).toBe(72);
    v.onMonthKey(key('ArrowRight')); expect(a.state.hover.chart).toBe('month');
    v.onDayKey(key('ArrowRight')); expect(a.state.hover.chart).toBe('day');
  });
  it('a pointer position picks the bar under it', () => {
    const a = make('2026-11-22T20:00:00Z'); a.__draw = () => {};
    const target = { getBoundingClientRect: () => ({ left: 100, width: 730 }) };
    a.renderVals().onYearMove({ clientX: 100 + 730 * (13.5 / 73), currentTarget: target });
    expect(a.state.hover).toEqual({ chart: 'year', i: 13 });
    a.renderVals().onLeave();
    expect(a.state.hover).toBeNull();
  });
  it('no readout ever shows NaN or undefined', () => {
    const a = make('2026-06-21T19:00:00Z');
    for (const [chart, n] of [['day', 1440], ['year', 73], ['month', 12]] as const)
      for (let i = 0; i < n; i += chart === 'day' ? 37 : 1) { a.state.hover = { chart, i }; expect(strings(a.renderVals()).filter((s) => /NaN|undefined/.test(s))).toEqual([]); }
  });
});

describe('rain speed', () => {
  // Owner, 2026-11-22: the rain should fall at about half the speed.
  it('falls half as fast as the handoff (1.15 / .62 / .36 s per tile)', () => {
    const css = readFileSync('src/styles/layers.css', 'utf8');
    const dur = (c: string) => +new RegExp('\\.lk-anim \\.' + c + '\\{animation:lk-fall\\d+ ([\\d.]+)s').exec(css)![1];
    expect(dur('lk-f256')).toBeCloseTo(2.3, 2);
    expect(dur('lk-f384')).toBeCloseTo(1.24, 2);
    expect(dur('lk-f512')).toBeCloseTo(0.72, 2);
  });
});
