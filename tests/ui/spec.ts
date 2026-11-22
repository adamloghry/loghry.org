// Bombadil specification: properties that must hold whatever a visitor clicks, drags, reloads or resizes.
// Run with `npm run test:ui` (builds nothing; serves dist/ with the production headers).
import { always, eventually } from '@antithesishq/bombadil';
import { extract } from '@antithesishq/bombadil/browser';

// no uncaught exceptions, no unhandled rejections, no console errors, no HTTP error codes
export * from '@antithesishq/bombadil/browser/defaults';

const count = (sel: string) => extract((s) => s.document.querySelectorAll(sel).length);
const text = (sel: string) => extract((s) => s.document.querySelector(sel)?.textContent ?? '');

const home = extract((s) => s.window.location.pathname === '/');
const headings = count('h1');
const scenes = count('.lk-stage');
const clock = text('[data-test=clock]');
const status = text('[data-test=status]');
const page = extract((s) => (s.document.body as HTMLElement).innerText);
const panelOpen = extract((s) => !!s.document.querySelector('[data-test=panel]'));
const gearExpanded = extract((s) => s.document.querySelector('.lk-gear > button')?.getAttribute('aria-expanded') ?? null);
const slider = extract((s) => s.document.querySelector('input[type=range]')?.getAttribute('aria-valuetext') ?? null);
const scrubExpanded = extract((s) => s.document.querySelector('.lk-status > button')?.getAttribute('aria-expanded') ?? null);
const wordsHidden = extract((s) => { const el = s.document.querySelector('.lk-bottom .lk-words') as HTMLElement | null; return el ? s.window.getComputedStyle(el).visibility === 'hidden' : null; });
const hidePressed = extract((s) => s.document.querySelector('.lk-top > button')?.getAttribute('aria-pressed') ?? null);
const shareLabel = extract((s) => [...s.document.querySelectorAll('[data-test=panel] button')].map((b) => b.textContent ?? '')[0] ?? null);
const origin = extract((s) => s.window.location.origin);
const overflowX = extract((s) => s.document.documentElement.scrollWidth - s.document.documentElement.clientWidth);
const unnamedControls = extract((s) => [...s.document.querySelectorAll('button, a, input')].filter((el) => !((el.textContent ?? '').trim() || el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.length)).length);

// Exactly one page heading, always (the static fallback before the script runs, the live hero after).
export const oneHeading = always(() => headings.current === 1);

// The scene is never drawn twice. (A redraw once stacked a second copy of the whole hero on the first.)
export const neverTwoScenes = always(() => scenes.current <= 1);
export const sceneAppears = always(() => !home.current || eventually(() => scenes.current === 1).within(10, 'seconds'));

// Once the hero is up, the clock reads as Seattle time, whatever the visitor does.
export const clockIsSeattleTime = always(() => scenes.current === 0 || /^\d{1,2}:\d\d (AM|PM) P[SD]T/.test(clock.current));
export const statusNamesTheSky = always(() => scenes.current === 0 || /(Typical sky|Sky): [A-Z]/.test(status.current));

// No template or arithmetic debris ever reaches the page.
export const noBrokenText = always(() => !/NaN|undefined|\[object |\{\{/.test(page.current));

// Controls say what they do.
export const gearMatchesPanel = always(() => gearExpanded.current === null || (gearExpanded.current === 'true') === panelOpen.current);
export const sliderOnlyWhenOpen = always(() => scrubExpanded.current === null || (scrubExpanded.current === 'true') === (slider.current !== null));
export const sliderAnnouncesSeattleTime = always(() => slider.current === null || /^\d{1,2}:\d\d (AM|PM) P[SD]T$/.test(slider.current));
export const hideButtonMatchesText = always(() => hidePressed.current === null || wordsHidden.current === null || (hidePressed.current === 'true') === wordsHidden.current);
export const everyControlHasAName = always(() => unnamedControls.current === 0);

// The page never scrolls sideways.
export const noSidewaysScroll = always(() => overflowX.current <= 1);

// "link to this moment" only ever offers a well-formed link back to this site: the label, "copied", or (when the
// clipboard is refused, as in a headless browser) the link itself, pinned to a Seattle wall-clock minute.
export const shareLinkIsWellFormed = always(() => shareLabel.current === null || shareLabel.current === 'link to this moment' || shareLabel.current === 'copied'
  || new RegExp('^' + origin.current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/#t=\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d(&|$)').test(shareLabel.current));
