import { describe, it, expect } from 'vitest';
import { parseHooks } from '../../src/sky/hooks';

describe('preview hooks in the URL hash', () => {
  it('reads all five hooks', () => {
    expect(parseHooks('#t=2026-07-04T22:25&sky=clear&event=july4&moon=full&lights=drawn')).toEqual({
      moment: '2026-07-04T22:25', sky: 'clear', event: 'july4', moon: 'full', lightStyle: 'drawn',
    });
  });
  it('an empty hash sets nothing', () => {
    expect(parseHooks('')).toEqual({});
    expect(parseHooks('#')).toEqual({});
  });
  it('a hook may come first without t=', () => {
    expect(parseHooks('#sky=rain')).toEqual({ sky: 'rain' });
  });
  it('does not match a hook name inside another value', () => {
    expect(parseHooks('#event=sky=fog')).toEqual({ event: 'sky=fog' });
  });
  it('ignores unknown keys', () => {
    expect(parseHooks('#zoom=3&t=2026-01-01T00:00')).toEqual({ moment: '2026-01-01T00:00' });
  });
  it('decodes percent-escapes', () => {
    expect(parseHooks('#t=2026-07-04T22%3A25')).toEqual({ moment: '2026-07-04T22:25' });
  });
});
