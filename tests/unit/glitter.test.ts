import { describe, it, expect } from 'vitest';
import { Hero } from '../../src/sky/hero';

// Found while profiling (2026-11-22): moon glitter on the lake was drawn under full rain cloud. A glint needs a clear
// line to the moon, as the sun's already did.
const v = (moment: string, skyName: string) => new Hero({ moment, sky: skyName, moon: 'full', box: () => ({ w: 1440, h: 900 }), siteUrl: 'x', photoCredit: 'x', photoUrl: 'y', buildDate: 'd', buildCommit: 'c' }).renderVals();
describe('moon glitter', () => {
  it('shows on a clear night with a high full moon', () => expect(v('2026-06-21T23:30', 'clear').show.glitter).toBe(true));
  it('does not show under rain cloud', () => expect(v('2026-11-22T22:00', 'rain').show.glitter).toBe(false));
  it('does not show in fog', () => expect(v('2026-10-15T03:00', 'fog').show.glitter).toBe(false));
});
