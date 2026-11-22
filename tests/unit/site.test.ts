import { describe, it, expect } from 'vitest';
import { buildStamp } from '../../src/site';

describe('build stamp', () => {
  it('takes the date and commit the Nix flake passes in', () => {
    expect(buildStamp({ LOGHRY_BUILD_DATE: '20261122130500', LOGHRY_COMMIT: 'abc1234' })).toEqual({ date: '2026-11-22', commit: 'abc1234' });
  });
  it('falls back to the Cloudflare Workers Builds commit, shortened to 7', () => {
    expect(buildStamp({ WORKERS_CI_COMMIT_SHA: '0123456789abcdef' }, new Date('2026-05-01T00:00:00Z')).commit).toBe('0123456');
  });
  it('prefers the flake commit over the Cloudflare one', () => {
    expect(buildStamp({ LOGHRY_COMMIT: 'flake00', WORKERS_CI_COMMIT_SHA: 'cf0000000000' }).commit).toBe('flake00');
  });
  it('without either, uses the build day (UTC) and "dev"', () => {
    expect(buildStamp({}, new Date('2026-01-02T00:00:00Z'))).toEqual({ date: '2026-01-02', commit: 'dev' });
  });
  it('treats empty strings as unset', () => {
    expect(buildStamp({ LOGHRY_COMMIT: '', WORKERS_CI_COMMIT_SHA: '' }, new Date('2026-01-02T00:00:00Z')).commit).toBe('dev');
  });
});
