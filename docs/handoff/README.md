# loghry.org

A fully static site. One aerial photograph of Lake Union is redrawn for the hour, season and typical weather it is **in Seattle right now** (never the visitor's clock). No server, no API, no analytics, no third-party requests.

This README is the authority for the handoff. Where it and a comment in the code disagree, fix the code.

## Commands

| What | Command |
| --- | --- |
| Develop | `nix develop` then `npm ci && npm run dev` |
| Build (plain) | `npm run build` → `dist/` |
| Build (reproducible) | `nix build` → `./result` (runs the unit tests and the upkeep check first) |
| Unit tests | `npm test` (31 tests, run three times: `TZ=America/Los_Angeles`, `Asia/Tokyo`, `UTC`) |
| UI property tests | `npm run build && npm run test:ui` (Bombadil, desktop 1280×800 and phone 390×844, 60 s each; pass a limit: `node tests/ui/run.mjs 5m`) |
| Upkeep reminder | `npm run check:upkeep` |
| Rebake the images | `nix run .#bake` (about 2 minutes), then commit `src/assets/sky` |
| Deploy | `nix run .#deploy` (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; project name from `CLOUDFLARE_PAGES_PROJECT`, default `loghry-org`) |

Bombadil needs a Chrome or Chromium on `PATH`; the dev shell provides one on Linux. In a container without user namespaces, set `BOMBADIL_NO_SANDBOX=1`.

## Not verified. Read this first

1. **`flake.nix` has never been evaluated or built.** The machine it was written on could not reach `cache.nixos.org` or the nixpkgs repository. Expect to fix small things on first `nix build`. Likely spots: `importNpmLock` with this lockfile, `npmRebuildFlags`, the `wrangler` package name, `pkgs.system`. There is no `flake.lock`; run `nix flake lock` and commit it.
2. **Only Chrome was tested.** Safari and Firefox have fallbacks written (WebP inside `<picture>`, an `@supports not (offset-path…)` branch that hides the moving cars and boats, `-webkit-mask-*` prefixes) but nobody has looked at them.
3. **No real GPU was used.** Frame rates below come from software rendering on 2 CPU cores. They are a floor, not a forecast.
4. **`nix run .#deploy` is untested**, and the Cloudflare Pages project name is a guess.

## Layout

```
src/site.ts            title, description, photo credit, build stamp (from the flake)
src/sky/model.ts       the model: Seattle clock, sun, moon, weather normals, calendar. Pure functions, unit tested.
src/sky/hero.ts|html   the living photograph (state → template values)
src/sky/almanac.ts|html  "The year in Seattle's daylight"
src/sky/view.ts        40-line template runtime ({{holes}}, sc-if, sc-for, keyed patching)
src/sky/assets.ts      hashed URLs for the baked layers
src/styles/            ui.css (layout, text, controls), layers.css (animation and masks)
src/assets/sky/        baked image layers. Committed. Never resized at build time.
public/                _headers (CSP, cache), icons, og.jpg, robots, sitemap, manifest
bake/                  offline image pipeline; not an input of the site build
tests/unit, tests/ui   vitest; Bombadil spec + a server that applies _headers
reference/             screenshots of every state from the final build
```

`hero.ts` and `almanac.ts` carry `// @ts-nocheck`. They were ported from the design prototype and are tested through behaviour, not types.

## Rules that must keep holding

- **Static forever.** Nothing is fetched except the site's own files. The content security policy in `public/_headers` enforces it (`default-src 'none'`, everything else `'self'`). `style-src` allows `'unsafe-inline'` because the layers set inline `style` attributes; scripts do not get that allowance.
- **Seattle time only.** `sky.parts()` reads the clock through `Intl` with `America/Los_Angeles`, and falls back to the US daylight-saving rule if that is missing. The unit tests run under three process time zones to catch any use of local time.
- **Same sky for everyone.** Weather is a hash of the Seattle date and hour, weighted by the Sea-Tac 1991–2020 normals. It is typical weather, not a forecast, and the status line words it that way ("Mostly clear", not "Clear").
- **Fixed camera.** Every mask and light position assumes this exact frame. A different photo means a full rebake and re-tuning `bake/scripts/masks.py`.
- **No sound. No named family members or dates.**

## Tables to maintain

| Table | Where | When |
| --- | --- | --- |
| Calendar events (July 4 22:20–22:42, New Year 00:00–00:10, Duck Dodge Tuesdays 19:00–21:00 May–mid-Sept) | `sky.calendar` in `model.ts`; bump `CALENDAR_REVIEWED` | Yearly. `check:upkeep` warns when the year rolls over. |
| Weather normals | `NORMALS`, `NORMALS_PERIOD` in `model.ts` | When NOAA publishes 2001–2030 (about 2031). |
| Photo credit | `SITE.photo` in `site.ts` | Only if the photo changes. |

## Preview hooks

Append to the URL. These are also the shareable-moment links.

`#t=2026-07-04T22:25` (Seattle wall time) · `&sky=clear|partly|cloudy|shower|rain|fog|snow|haze` · `&event=july4|newyear|duckdodge|seaplane|none` · `&moon=full|new` · `&lights=drawn`

`reference/` was rendered with exactly these.

## The photograph

Ryan Wilson, Unsplash: <https://unsplash.com/photos/aerial-photography-of-city-during-daytime-HkF6feHrGBE>. Taken 2018-04-13 from about 958 m above 47.665° N 122.334° W, looking south. Published under the Unsplash License, which permits this use and does not require credit; the site credits him anyway, in the build panel.

`bake/original.png` is the 2268×2268 original. `bake/run.sh` derives everything in `src/assets/sky` from it: masks → lights → plates (day, golden morning, golden evening, blue hour, night) → rain → water, snow, foliage and star masks → plates with the city lights baked in → install. Every lossy file is encoded once from a lossless master. Two inputs are hand-made and not derived from the photo: `bake/static/cloud?_t.png` (tiling cloud textures) and `bake/static/ringsw?.webp` (rain rings). Their generators were not kept.

## Measured on the final build

Chrome 1440×900 and 390×844 (3× pixels), software rendering, production headers.

| Scene | Desktop fps | Phone fps | First visit |
| --- | --- | --- | --- |
| Clear day | 60 | 60 | 0.61 MB, 11 requests |
| Dusk | 60 | 60 | 0.80 MB |
| Clear night | 39 | 60 | 0.84 MB |
| Rainy night | 14 | 49 | 0.93 MB, 21 requests |
| Snow | 43 | 60 | 0.86 MB |
| July 4 fireworks | 54 | 60 | 0.43 MB |

`dist/` is 6.1 MB because it holds every plate in both AVIF and WebP; a visitor downloads only the plates for the current light.

- Bombadil: no property violated in 60 s per viewport (about 490 actions desktop, 840 phone). Properties: one heading, never two scenes, clock is Seattle time, status names the sky, no unfilled template text, panel and slider state match their ARIA attributes, every control has a name, no sideways scroll.
- axe-core (WCAG 2 A/AA + best practice): 0 violations on desktop day, desktop snow, phone night with panel open, and the 404 page.
- Text contrast against the brightest 2 % of pixels behind each label: worst 10.3:1 across snow, clear noon, fog, phone, and text-hidden states.
- No console errors, CSP violations or failed requests in any of the 21 reference states. With JavaScript off, the page shows the day photo, the heading and the credit.

## Known weak spots

- Rainy night at 14 fps without a GPU. Three full-frame rain layers move by transform, which is the cheap path on a GPU and the expensive one without. If a real low-end laptop stutters, drop `rain_near` first.
- The ripple layer steps its mask position instead of a transform (this took clear night from 25 to 39 fps in software). On a GPU the old way may have been as good; it was not compared.
- `og.jpg` and the icons are committed renders, not build outputs. Re-render by hand if the look changes.
- Contrast and axe checks were run by hand with Playwright and are not in the repo's test suite.
- Bombadil explores randomly; 60 s is a smoke test. Run `5m` before a release.
- The build date is the commit's UTC date, so a late-evening Seattle commit shows tomorrow's date.
