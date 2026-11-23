// Facts about the site that are fixed at build time.
export const SITE = {
  title: 'Loghry',
  description: 'The Loghry family lives in Seattle. A living aerial view of Lake Union, drawn for the hour and season it is in Seattle right now.',
  url: 'https://loghry.org/',
  photo: { credit: 'Ryan Wilson', url: 'https://unsplash.com/photos/aerial-photography-of-city-during-daytime-HkF6feHrGBE' },
};

type Env = Record<string, string | undefined>;

// The build stamp in the bottom-right panel. The Nix flake passes LOGHRY_BUILD_DATE (YYYYMMDDHHMMSS, UTC) and
// LOGHRY_COMMIT; Cloudflare's git builds run plain `npm run build` and set CF_PAGES_COMMIT_SHA (Pages, how the site
// deploys) or WORKERS_CI_COMMIT_SHA (Workers Builds).
// Without either, the date is the build day (UTC) and the commit is "dev".
export function buildStamp(env: Env, today: Date = new Date()): { date: string; commit: string } {
  const raw = env.LOGHRY_BUILD_DATE || today.toISOString().slice(0, 10).replace(/-/g, '');
  const date = raw.length >= 8 && !raw.includes('-') ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
  const commit = env.LOGHRY_COMMIT || (env.CF_PAGES_COMMIT_SHA || env.WORKERS_CI_COMMIT_SHA || '').slice(0, 7) || 'dev';
  return { date, commit };
}

export const BUILD = buildStamp(process.env);
