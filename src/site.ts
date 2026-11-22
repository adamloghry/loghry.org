// Facts about the site that are fixed at build time.
export const SITE = {
  title: 'Loghry',
  description: 'The Loghry family lives in Seattle. A living aerial view of Lake Union, drawn for the hour and season it is in Seattle right now.',
  url: 'https://loghry.org/',
  photo: { credit: 'Ryan Wilson', url: 'https://unsplash.com/photos/aerial-photography-of-city-during-daytime-HkF6feHrGBE' },
};

// The Nix flake passes these in; `npm run build` on its own falls back to today's date and "dev".
const raw = process.env.LOGHRY_BUILD_DATE || new Date().toISOString().slice(0, 10).replace(/-/g, '');
export const BUILD = {
  date: raw.length >= 8 && !raw.includes('-') ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw,
  commit: process.env.LOGHRY_COMMIT || 'dev',
};
