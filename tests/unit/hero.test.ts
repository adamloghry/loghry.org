import { describe, it, expect, vi } from 'vitest';
import { Hero } from '../../src/sky/hero';

const draw = (moment: string, extra: Record<string, unknown> = {}, box = { w: 1440, h: 900 }) =>
  new Hero({ moment, box: () => box, siteUrl: 'https://loghry.org/', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c', ...extra }).renderVals();

describe('calendar moments', () => {
  it('July 4, 10:25 PM: fireworks over the lake', () => {
    const v = draw('2026-07-04T22:25', { sky: 'clear' });
    expect(v.clock).toContain('Fireworks over the lake'); expect(v.show.fireworks).toBe(true); expect(v.show.fwLake).toBe(true);
  });
  it('New Year, 12:03 AM: fireworks at the Needle, holiday lights on', () => {
    const v = draw('2027-01-01T00:03', { sky: 'clear' });
    expect(v.clock).toContain('Happy New Year'); expect(v.show.fireworks).toBe(true); expect(v.show.holiday).toBe(true);
  });
  it('a summer Tuesday at 7:30 PM: Duck Dodge; the Wednesday after: none', () => {
    expect(draw('2026-07-07T19:30', { sky: 'clear' }).show.sails).toBe(true);
    expect(draw('2026-07-08T19:30', { sky: 'clear' }).show.sails).toBe(false);
    expect(draw('2026-11-24T19:30', { sky: 'clear' }).show.sails).toBe(false);
  });
  it('no fireworks an hour earlier', () => {
    expect(draw('2026-07-04T21:25', { sky: 'clear' }).show.fireworks).toBe(false);
  });
});

describe('light', () => {
  it('city lights are off at noon and on at night', () => {
    expect(draw('2026-06-21T13:00', { sky: 'clear' }).show.lights).toBe(false);
    expect(draw('2026-11-22T21:00', { sky: 'clear' }).show.lights).toBe(true);
  });
  it('seaplanes only fly in daylight', () => {
    for (let h = 22; h < 28; h++) expect(draw(`2026-11-2${h < 24 ? 2 : 3}T${String(h % 24).padStart(2, '0')}:00`).show.plane).toBe(false);
  });
  it('the share link names the moment being shown', () => {
    const v = draw('2026-07-04T22:25'); let copied = '';
    vi.stubGlobal('navigator', { clipboard: { writeText: (s: string) => { copied = s; return Promise.resolve(); } } });
    v.copyLink(); vi.unstubAllGlobals(); expect(copied).toBe('https://loghry.org/#t=2026-07-04T22:25');
  });
});

describe('every drawn value is well-formed', () => {
  const skies = ['auto', 'clear', 'partly', 'cloudy', 'rain', 'shower', 'fog', 'snow', 'haze'];
  const boxes = [{ w: 1440, h: 900 }, { w: 390, h: 844 }, { w: 2560, h: 1080 }, { w: 820, h: 1180 }];
  it('no NaN / undefined in any state, any window shape', () => {
    let n = 0;
    for (const mo of [1, 4, 7, 10]) for (const h of [0, 3, 6, 8, 12, 16, 18, 21]) for (const sky of skies) for (const box of boxes) {
      const v = draw(`2026-${String(mo).padStart(2, '0')}-15T${String(h).padStart(2, '0')}:10`, { sky }, box); n++;
      for (const [k, val] of Object.entries(v)) if (typeof val === 'string') expect(val, `${k} @ ${mo}/15 ${h}h ${sky}`).not.toMatch(/NaN|undefined|Infinity/);
      for (const k of ['op0', 'op1', 'op2', 'op3', 'op3L', 'op4', 'op4E', 'rainOpacity', 'fogOpacity', 'glitterOpacity']) { expect(+v[k]).toBeGreaterThanOrEqual(0); expect(+v[k]).toBeLessThanOrEqual(1); }
    }
    expect(n).toBe(4 * 8 * 9 * 4);
  });
  it('the stage always covers the window', () => {
    for (const box of boxes) {
      const m = /translate\((-?[\d.]+)px,(-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(draw('2026-06-21T13:00', {}, box).stageStyle)!;
      const [ox, oy, s] = [+m[1], +m[2], +m[3]], size = 1440 * s;
      expect(ox).toBeLessThanOrEqual(0); expect(oy).toBeLessThanOrEqual(0);
      expect(ox + size).toBeGreaterThanOrEqual(box.w - 0.5); expect(oy + size).toBeGreaterThanOrEqual(box.h - 0.5);
    }
  });
});
