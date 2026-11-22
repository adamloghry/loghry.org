// The states the acceptance suite renders. One per screenshot in docs/handoff/reference/ (the handoff names them
// but does not record their URLs, so these are read off the screenshots: the time in the status line, the
// weather, the viewport), plus the edge cases from the plan's Review Focus.
// `sky` is the status-line word(s) the forced weather must produce.
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  ultrawide: { width: 2560, height: 1080 },
  short: { width: 844, height: 390 },
};

const SKY = { clear: /Mostly clear/, partly: /Mostly clear|Partly cloudy|Mostly cloudy/, rain: /Rain|Light rain/, fog: /Fog/, snow: /Snow/ };
const s = (name, vp, hash, sky, extra = {}) => ({ name, viewport: VIEWPORTS[vp], hash, sky: sky && SKY[sky], ...extra });

export const STATES = [
  s('01-desktop-day', 'desktop', 't=2026-06-21T13:00&sky=clear', 'clear'),
  s('02-desktop-golden', 'desktop', 't=2026-06-21T20:30&sky=clear', 'clear'),
  s('03-desktop-dusk', 'desktop', 't=2026-06-21T21:25&sky=partly', 'partly'),
  s('04-desktop-night', 'desktop', 't=2026-06-21T23:30&sky=clear&moon=full', 'clear'),
  s('05-desktop-night-drawn', 'desktop', 't=2026-06-21T23:30&sky=clear&moon=full&lights=drawn', 'clear'),
  s('06-desktop-rain', 'desktop', 't=2026-11-22T14:00&sky=rain', 'rain'),
  s('07-desktop-fog', 'desktop', 't=2026-10-15T08:00&sky=fog', 'fog'),
  s('08-desktop-snow', 'desktop', 't=2026-01-15T12:00&sky=snow', 'snow'),
  s('09-desktop-july4', 'desktop', 't=2026-07-04T22:25&sky=clear&event=july4', null, { clock: /Fireworks over the lake/ }),
  s('10-desktop-panel-open', 'desktop', 't=2026-06-21T13:00&sky=clear&event=seaplane', 'clear', { open: true }),
  s('11-desktop-almanac', 'desktop', 't=2026-06-21T13:00&sky=clear', 'clear', { fullPage: true }),
  s('12-phone-day', 'phone', 't=2026-06-21T13:00&sky=clear', 'clear'),
  s('13-phone-night-rain', 'phone', 't=2026-11-22T22:00&sky=rain', 'rain'),
  s('14-phone-panel-open', 'phone', 't=2026-06-21T13:00&sky=clear', 'clear', { open: true }),
  s('15-phone-snow', 'phone', 't=2026-01-15T12:00&sky=snow', 'snow'),
  s('16-tablet-dusk', 'tablet', 't=2026-06-21T21:25&sky=partly', 'partly'),
  s('17-ultrawide-day', 'ultrawide', 't=2026-06-21T13:00&sky=clear', 'clear'),
  s('18-short-landscape', 'short', 't=2026-06-21T13:00&sky=clear', 'clear', { reach: true }),
  s('19-no-javascript', 'desktop', '', null, { js: false }),
  s('20-reduced-motion', 'desktop', 't=2026-11-22T14:00&sky=rain', 'rain', { reduced: true }),
  s('21-404', 'desktop', '', null, { path: '/nope', status: 404 }),
  // Review Focus edge cases
  s('dst-spring-forward', 'desktop', 't=2026-03-08T02:30', null),
  s('dst-fall-back', 'desktop', 't=2026-11-01T01:30', null),
  s('malformed-hooks', 'desktop', 't=garbage&sky=nope&event=%zz', null),
  s('narrow-320', 'phone', 't=2026-06-21T13:00&sky=clear', 'clear', { viewport: { width: 320, height: 568 }, reach: true }),
];
