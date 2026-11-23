import { describe, it, expect } from 'vitest';
import { sky, cloudVelocity } from '../../src/sky/model';

// Owner, 2026-11-22: smoother weather. Day-level decisions (rain day, snow day, smoke, stratus, cloud offset, wind
// direction) used to switch at midnight, and wind speed in 6-hour steps; now they blend.
const wxAt = (ms: number) => {
  const p = sky.parts(ms), doy = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 0)) / 86400000);
  return sky.weather(ms, p, doy, sky.dayEvents(p.y, p.mo, p.d));
};
const FIELDS = ['cloud', 'rain', 'snowing', 'snowCover', 'haze', 'fog'] as const;

describe('weather is continuous', () => {
  it('across every midnight of the year (two minutes apart)', () => {
    let worst = 0, where = '';
    for (let doy = 1; doy <= 365; doy++) {
      const d = new Date(Date.UTC(2026, 0, doy)), ms = sky.toUtc(2026, d.getUTCMonth() + 1, d.getUTCDate(), 23, 59);
      const a = wxAt(ms), b = wxAt(ms + 120000);
      for (const f of FIELDS) { const dv = Math.abs(a[f] - b[f]); if (dv > worst) { worst = dv; where = `${f} on day ${doy}`; } }
      const dt = Math.abs(a.temp - b.temp); if (dt / 20 > worst) { worst = dt / 20; where = `temp on day ${doy}`; }
    }
    expect(worst, where).toBeLessThan(0.06);
  });
  it('across the old 6-hour wind steps', () => {
    for (let doy = 1; doy <= 365; doy += 3) for (const h of [5, 11, 17]) {
      const d = new Date(Date.UTC(2026, 0, doy)), ms = sky.toUtc(2026, d.getUTCMonth() + 1, d.getUTCDate(), h, 59);
      expect(Math.abs(wxAt(ms).wind.speedQ - wxAt(ms + 120000).wind.speedQ)).toBeLessThan(0.05);
    }
  });
  it('still has rainy days and dry days in a typical November', () => {
    let wet = 0;
    for (let d = 1; d <= 30; d++) if (wxAt(sky.toUtc(2026, 11, d, 14, 0)).rain > 0.3) wet++;
    expect(wet).toBeGreaterThan(3); expect(wet).toBeLessThan(28);
  });
});

describe('cloud drift', () => {
  it('velocity follows the wind and passes through zero when the wind turns, never jumping', () => {
    let worst = 0;
    // every 3rd day: the six hours either side of midnight in 2-minute steps (where day-level dice blend) and the rest
    // of the day every 30 minutes
    for (let doy = 1; doy <= 365; doy += 3) {
      const d = new Date(Date.UTC(2026, 0, doy));
      for (let m = 0; m < 1440; m += (m < 180 || m >= 1260 ? 2 : 30)) {
        const ms = sky.toUtc(2026, d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(m / 60), m % 60);
        worst = Math.max(worst, Math.abs(cloudVelocity(wxAt(ms).wind) - cloudVelocity(wxAt(ms + 120000).wind)));
      }
    }
    // loops per second; the old animation went from 1/260 to 1/124 in one step
    expect(worst).toBeLessThan(0.0005);
  });
  it('storms (southerly) and fair summer days (northerly) drift opposite ways', () => {
    expect(Math.sign(cloudVelocity({ speedQ: 0.5, flow: 1 }))).toBe(1);
    expect(Math.sign(cloudVelocity({ speedQ: 0.5, flow: -1 }))).toBe(-1);
    expect(cloudVelocity({ speedQ: 0.5, flow: 0 })).toBe(0);
  });
});

describe('the hero drifts clouds from script, not by switching animation durations', async () => {
  const { Hero, template } = await import('../../src/sky/hero');
  it('the template no longer binds animation durations or directions to the wind', () => {
    expect(template).not.toMatch(/animation-duration: \{\{cloudDur|animation-direction: \{\{cloudDir/);
    expect((template.match(/data-cloud="[12]"/g) || []).length).toBe(2);
  });
  it('each render sets the target velocity from the weather; a lapse speeds it up, capped', () => {
    const h: any = new Hero({ moment: '2026-11-22T14:00', sky: 'rain', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' });
    h.renderVals();
    const live = h._cloudTarget;
    expect(Math.abs(live)).toBeGreaterThan(0);
    h.state.lapse = { kind: 'day', t0: 0, base: sky.toUtc(2026, 11, 22, 14, 0) }; h.state.lapseNow = 0;
    h.renderVals();
    expect(Math.abs(h._cloudTarget)).toBeGreaterThan(Math.abs(live) * 5);
    expect(Math.abs(h._cloudTarget)).toBeLessThanOrEqual(Math.abs(live) * 25 + 1e-9);
  });
});
