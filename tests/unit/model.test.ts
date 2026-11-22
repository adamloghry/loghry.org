import { describe, it, expect, vi, afterEach } from 'vitest';
import { sky, NORMALS } from '../../src/sky/model';

const at = (iso: string) => Date.parse(iso);
const hm = (min: number) => `${Math.floor(Math.round(min) / 60)}:${String(Math.round(min) % 60).padStart(2, '0')}`;

describe('Seattle clock', () => {
  const cases: [string, number, number, number][] = [
    // UTC instant, Seattle hour, minute, offset (minutes)
    ['2026-03-08T09:59:00Z', 1, 59, -480],   // one minute before clocks spring forward
    ['2026-03-08T10:01:00Z', 3, 1, -420],    // one minute after
    ['2026-11-01T08:59:00Z', 1, 59, -420],   // one minute before clocks fall back
    ['2026-11-01T09:01:00Z', 1, 1, -480],    // one minute after
    ['2026-07-04T03:30:00Z', 20, 30, -420],
    ['2026-12-31T23:30:00Z', 15, 30, -480],
  ];
  it.each(cases)('%s', (iso, h, mi, off) => {
    const p = sky.parts(at(iso));
    expect([p.h, p.mi, p.off]).toEqual([h, mi, off]);
  });
  it('gives the same answer without time-zone data (US daylight-saving rule)', () => {
    const real = Intl.DateTimeFormat;
    const expected = cases.map(([iso]) => sky.parts(at(iso)));
    // @ts-expect-error simulate a browser with no time-zone database
    Intl.DateTimeFormat = function () { throw new RangeError('no tz'); };
    try { cases.forEach(([iso], i) => expect(sky.parts(at(iso))).toEqual(expected[i])); }
    finally { Intl.DateTimeFormat = real; }
  });
  it('wall clock -> instant -> wall clock round-trips through the year', () => {
    for (let doy = 1; doy <= 365; doy += 3) for (const h of [0, 4, 9, 13, 18, 23]) {
      const d = new Date(Date.UTC(2026, 0, doy)), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
      if (mo === 3 && day === 8 && h < 4) continue;                // 2 AM does not exist on the spring-forward day
      const p = sky.parts(sky.toUtc(2026, mo, day, h, 17));
      expect([p.mo, p.d, p.h, p.mi]).toEqual([mo, day, h, 17]);
    }
  });
  it('does not depend on the machine time zone', () => {
    // the suite is run under several TZ values by `npm test` (see package.json); the expectations above are absolute
    expect(sky.parts(at('2026-11-22T17:48:00Z')).h).toBe(9);
  });
});

describe('sun', () => {
  // Published sunrise / sunset for Seattle, local clock time. Tolerance: 4 minutes.
  const days: [number, number, number, string, string][] = [
    [2026, 6, 21, '5:11', '21:11'],
    [2026, 12, 21, '7:55', '16:20'],
    [2026, 3, 20, '7:12', '19:22'],
    [2026, 9, 22, '6:56', '19:07'],
  ];
  it.each(days)('%i-%i-%i rises and sets on time', (y, mo, d, rise, set) => {
    const ev = sky.dayEvents(y, mo, d);
    const mins = (s: string) => +s.split(':')[0] * 60 + +s.split(':')[1];
    expect(Math.abs(ev.rise - mins(rise)), `sunrise ${hm(ev.rise)}`).toBeLessThanOrEqual(4);
    expect(Math.abs(ev.set - mins(set)), `sunset ${hm(ev.set)}`).toBeLessThanOrEqual(4);
  });
  it('is due south and highest at solar noon', () => {
    const ev = sky.dayEvents(2026, 6, 21), s = sky.sun(sky.toUtc(2026, 6, 21, Math.floor(ev.noon / 60), ev.noon % 60));
    expect(s.el).toBeGreaterThan(64); expect(s.el).toBeLessThan(67);
    expect(Math.abs(s.az - 180)).toBeLessThan(6);
  });
});

describe('moon', () => {
  const phase = (iso: string) => { const ms = at(iso); return sky.moon(ms, sky.sun(ms).lam); };
  it('is full on 24 Nov 2026 and new on 9 Nov 2026', () => {
    expect(phase('2026-11-24T14:53:00Z').illum).toBeGreaterThan(0.98);
    expect(phase('2026-11-09T07:02:00Z').illum).toBeLessThan(0.02);
    expect(sky.moonName(phase('2026-11-24T14:53:00Z'))).toBe('Full moon');
  });
  it('waxes before full and wanes after', () => {
    expect(phase('2026-11-20T12:00:00Z').waxing).toBe(true);
    expect(phase('2026-11-28T12:00:00Z').waxing).toBe(false);
  });
});

describe('typical weather', () => {
  const sample = (mo: number, d: number, h: number) => {
    const ms = sky.toUtc(2026, mo, d, h, 0), p = sky.parts(ms);
    const doy = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 0)) / 86400000);
    return sky.weather(ms, p, doy, sky.dayEvents(p.y, p.mo, p.d));
  };
  it('is the same for everyone: same moment, same sky', () => {
    expect(sample(11, 22, 9)).toEqual(sample(11, 22, 9));
  });
  it('stays in range every third hour of the year', () => {
    for (let mo = 1; mo <= 12; mo++) for (let d = 1; d <= 28; d++) for (let h = 0; h < 24; h += 3) {
      const w = sample(mo, d, h);
      for (const k of ['cloud', 'rain', 'fog', 'snowing', 'haze']) { expect(w[k], `${k} ${mo}/${d} ${h}h`).toBeGreaterThanOrEqual(0); expect(w[k]).toBeLessThanOrEqual(1); }
      expect(w.temp).toBeGreaterThan(20); expect(w.temp).toBeLessThan(90);
    }
  });
  it('follows the normals: November is wetter and cloudier than July; snow only in the cold months', () => {
    const stats = (mo: number) => { let rain = 0, cloud = 0, snow = 0, n = 0; for (let d = 1; d <= 28; d++) for (let h = 0; h < 24; h += 2) { const w = sample(mo, d, h); rain += w.rain > 0.05 ? 1 : 0; cloud += w.cloud; snow += w.snowCover; n++; } return { rain: rain / n, cloud: cloud / n, snow }; };
    const jul = stats(7), nov = stats(11);
    expect(nov.rain).toBeGreaterThan(jul.rain);
    expect(nov.cloud).toBeGreaterThan(jul.cloud);
    for (const mo of [5, 6, 7, 8, 9]) expect(stats(mo).snow).toBe(0);
  });
  it('normals tables have twelve months each', () => {
    for (const k of Object.keys(NORMALS)) expect(NORMALS[k as keyof typeof NORMALS]).toHaveLength(12);
  });
});

describe('small helpers', () => {
  it('parses a shared moment and rejects junk', () => {
    expect(sky.parseMoment('2026-07-04T22:25')).toEqual({ y: 2026, mo: 7, d: 4, min: 1345 });
    for (const bad of ['', undefined, 'tomorrow', '2026-13-01T00:00', '2026-07-04T25:00']) expect(sky.parseMoment(bad)).toBeNull();
  });
  it('formats clock times', () => {
    expect(sky.fmt(0)).toBe('12:00 AM'); expect(sky.fmt(13 * 60 + 5)).toBe('1:05 PM'); expect(sky.fmt(1440 + 61)).toBe('1:01 AM');
  });
});
