// Page entry: mounts the hero and the section below it.
import { mount } from './view';
import { Hero, template as heroTemplate } from './hero';
import { Almanac, template as almanacTemplate } from './almanac';
import { parseHooks } from './hooks';

const hero = document.getElementById('hero')!, almanac = document.getElementById('almanac')!;
const d = hero.dataset;

// Shared links and hand checks:  #t=2026-07-04T22:25  (Seattle time), optionally  &sky=rain &event=seaplane &moon=full &lights=drawn
const common = { photoCredit: d.photoCredit, photoUrl: d.photoUrl };

mount(hero, heroTemplate, Hero, {
  ...common,
  buildDate: d.buildDate, buildCommit: d.buildCommit,
  siteUrl: location.origin + location.pathname,
  ...parseHooks(location.hash),
  box: () => ({ w: hero.clientWidth, h: hero.clientHeight }),
});
mount(almanac, almanacTemplate, Almanac, common);
addEventListener('hashchange', () => location.reload());
