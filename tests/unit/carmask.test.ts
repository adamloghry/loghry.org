import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { Hero, template } from '../../src/sky/hero';

// Owner, 2026-11-23: cars must not float over the photo's clouds or show through fog.
describe('cars stay under clouds and fog', () => {
  it('every moving-traffic layer is masked by the photo clear-sky mask', () => {
    for (const show of ['ferries', 'dayCars', 'cars']) {
      const block = template.slice(template.indexOf(`<sc-if value="{{show.${show}}}">`));
      expect(block.slice(0, 300), show).toMatch(/class="[^"]*lk-clearmask/);
    }
    const css = readFileSync('src/styles/layers.css', 'utf8');
    expect(css).toMatch(/\.lk-clearmask\{[^}]*mask-image:url\(\.\.\/assets\/sky\/clear_a\.webp\)/);
    expect(existsSync('src/assets/sky/clear_a.webp')).toBe(true);
  });
  const v = (moment: string, skyName: string) => new Hero({ moment, sky: skyName, box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
  it('fog thins the traffic out of sight', () => {
    const clear = v('2026-10-15T08:00', 'clear'), fog = v('2026-10-15T08:00', 'fog');
    expect(+fog.dayCarsOpacity).toBeLessThan(+clear.dayCarsOpacity * 0.4);
    const nClear = v('2026-12-15T07:00', 'clear'), nFog = v('2026-12-15T07:00', 'fog');
    expect(+nFog.carsOpacity).toBeLessThan(+nClear.carsOpacity * 0.4);
  });
});
