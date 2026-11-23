import { describe, it, expect } from 'vitest';
import { Hero } from '../../src/sky/hero';

// Owner, 2026-11-22: traffic by day too, for a realistic city. The day fleet is the night fleet's twin: same lanes,
// same timing (so at dusk each car becomes its own headlights), car-coloured bodies instead of lights.
const mv = (new Hero({ box: () => ({ w: 1440, h: 900 }) }) as any).buildMovers(false);
const PALETTE = ['#e9e9e6', '#1d1f22', '#6e7176', '#b9bcc0', '#3a5378', '#8e2a26', '#a59a85', '#44584a'];
const delay = (st: string) => /animation-delay:(-?[\d.]+)s/.exec(st)![1];
const colour = (st: string) => /background:(#[0-9a-f]{6})/.exec(st)![1];

describe('day cars', () => {
  it('every car has a daytime body on the same path and timing as its lights', () => {
    for (const c of mv.cars) {
      expect(c.dayStyle).toBeTruthy();
      expect(/offset-path:path\('([^']+)'\)/.exec(c.dayStyle)![1]).toBe(/offset-path:path\('([^']+)'\)/.exec(c.style)![1]);
      expect(delay(c.dayStyle)).toBe(delay(c.style));
    }
  });
  it('bodies are small, follow the road, and do not glow', () => {
    for (const c of mv.cars) {
      expect(c.dayStyle).toContain('offset-rotate:auto');
      expect(+/width:([\d.]+)px/.exec(c.dayStyle)![1]).toBeLessThanOrEqual(3);
      expect(c.dayStyle).not.toMatch(/box-shadow:0 0 [2-9]/);
    }
  });
  it('colours come from a realistic palette, white/black/grey/silver most common', () => {
    const cs = mv.cars.map((c: any) => colour(c.dayStyle));
    for (const c of cs) expect(PALETTE).toContain(c);
    expect(new Set(cs).size).toBeGreaterThanOrEqual(5);
    const neutral = cs.filter((c: string) => PALETTE.slice(0, 4).includes(c)).length;
    expect(neutral / cs.length).toBeGreaterThan(0.55);
  });
});

describe('the hero by day', () => {
  const at = (moment: string) => new Hero({ moment, sky: 'clear', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
  const visible = (v: any) => v.dayCars.filter((c: any) => c.road === 'i5' && !c.off).length;
  it('shows day cars at noon and not at midnight; night lights the other way round', () => {
    const noon = at('2026-06-23T12:00'), night = at('2026-06-23T00:30');
    expect(noon.show.dayCars).toBe(true);
    expect(+noon.dayCarsOpacity).toBeGreaterThan(0.9);
    expect(night.show.dayCars).toBe(false);
    expect(+night.carsOpacity).toBeGreaterThan(0.5);
  });
  it('a summer weekday commute is busier than the same hour on Sunday', () => {
    expect(visible(at('2026-06-23T07:45'))).toBeGreaterThan(visible(at('2026-06-21T07:45')) * 1.6);
  });
});

describe('day density', () => {
  it('by day I-5 carries up to 40 cars each way at the peak (night stays at 16: lights are kept subtle)', () => {
    const all = mv.cars.length + mv.dayOnly.length;
    expect(mv.dayOnly.length).toBeGreaterThan(0);
    for (const dir of ['nb', 'sb']) {
      expect(mv.cars.filter((c: any) => c.road === 'i5' && c.dir === dir).length).toBe(16);
      expect([...mv.cars, ...mv.dayOnly].filter((c: any) => c.road === 'i5' && c.dir === dir).length).toBe(40);
    }
    expect(all).toBe(mv.cars.length + 2 * 24 + 2 * 3);
  });
  it('the extra day cars ride the same lanes', () => {
    const lanes = new Set(mv.cars.map((c: any) => /offset-path:path\('([^']+)'\)/.exec(c.dayStyle)![1]));
    for (const c of mv.dayOnly) expect(lanes.has(/offset-path:path\('([^']+)'\)/.exec(c.dayStyle)![1])).toBe(true);
  });
});

describe('holiday lights (December)', () => {
  // Owner, 2026-11-22: about 30% of what they were; a fun easter egg, not a light show. Was on * (0.4 + 0.4 * windows), up to 0.8.
  it('stay a faint easter egg on a December evening', () => {
    const v = new Hero({ moment: '2026-12-15T20:00', sky: 'clear', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
    expect(v.show.holiday).toBe(true);
    expect(+v.holidayOpacity).toBeGreaterThan(0.05);
    expect(+v.holidayOpacity).toBeLessThanOrEqual(0.8 * 0.3);
  });
});

describe('rain rings on the water', () => {
  // Owner, 2026-11-22: the dots on the water were too busy; really subtle at most.
  it('stay faint even in a downpour by day', () => {
    const v = new Hero({ moment: '2026-11-22T13:00', sky: 'rain', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
    expect(v.show.rings).toBe(true);
    expect(+v.ringsOpacity).toBeGreaterThan(0);
    expect(+v.ringsOpacity).toBeLessThanOrEqual(0.25);
  });
});
