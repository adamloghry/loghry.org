# loghry.org redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2018 template site with the `tmp/redesign` handoff, ported onto the akl.dev/akl.run toolchain, with layered tests, and link it from akl.run on a branch.

**Architecture:** Astro 7 static output; the handoff's hand-rolled template runtime (`src/sky/view.ts`) mounts the hero and almanac from `src/sky/main.ts`. Nix flake (flake-parts + devenv + treefmt) builds `dist/` and runs every non-browser check; Playwright and Bombadil run against the built `dist/` served with `_headers` applied.

**Tech Stack:** Astro 7.4, Node 26, vitest 4, TypeScript 6, @astrojs/sitemap, @astrojs/check, Playwright (pinned to nixpkgs `playwright-driver`), @axe-core/playwright, @antithesishq/bombadil 0.8.0, Nix flake-parts/devenv/treefmt, wrangler (Workers static assets).

**Spec:** `docs/superpowers/specs/2026-11-22-loghry-org-redesign-design.md` (handoff authority: `docs/handoff/README.md` once copied).

## Global Constraints

- Handoff copy, layout, model maths, layers and image assets are not changed. The only handoff-code change is the build-stamp fallback in `src/site.ts`.
- Nothing fetched at runtime except same-origin files; CSP `default-src 'none'`, no script `'unsafe-inline'`.
- Seattle time only (`America/Los_Angeles`); tests must hold under `TZ=America/Los_Angeles`, `Asia/Tokyo`, `UTC`.
- No `akl.io`, `googletagmanager`, `keybase` anywhere in `dist/`.
- `git add <explicit paths>` only; never push; never `git add .claude/`.
- `wrangler.json` `name` is `loghry-org`.
- akl.run row copy: name `loghry.org`, description `Small landing page which shows typical Seattle.`, href `https://loghry.org/`.

## Review Focus

1. Visitor in a non-Seattle time zone (Tokyo, UTC) → identical clock text for a fixed `#t=` → Task 4 (Playwright `timezoneId`) and Task 2 (vitest ×3 TZ).
2. DST transition hours (spring-forward 02:xx, fall-back 01:xx) via `#t=` → page renders, no `NaN`/`{{` in DOM → Task 4 states list includes `#t=2026-03-08T02:30` and `#t=2026-11-01T01:30`.
3. Malformed preview hash (`#t=garbage&sky=nope`) → page falls back to "now", no `pageerror` → Task 2 unit test on `parseHooks`, Task 4 state.
4. JS disabled → day photo, `h1`, photo credit visible → Task 4.
5. Narrow (320 px) and short-landscape (844×390) → no horizontal scroll, controls reachable → Task 4 + Bombadil `noSidewaysScroll`.

---

### Task 1: Port the handoff onto Astro 7 and replace the old site

**Files:**
- Delete: `index.html assets/ images/ keybase.txt humans.txt robots.txt sitemap.xml`
- Create from handoff: `src/** public/** bake/** tests/** astro.config.mjs tsconfig.json`
- Create: `docs/handoff/README.md`, `docs/handoff/reference/*.jpg` (verbatim copies), `.gitignore`, `package.json`, `package-lock.json`

- [ ] Step 1: `git switch -c redesign`; `git rm -r` the old files listed above.
- [ ] Step 2: copy handoff tree (excluding `node_modules`, `package-lock.json`, `flake.nix`, `README.md`, `reference/`) to repo root; copy `README.md` + `reference/` to `docs/handoff/`. Delete `public/sitemap.xml` (sitemap integration replaces it).
- [ ] Step 3: `package.json`: deps per Tech Stack; `engines.node >=22.23.4`; scripts `dev`, `build`, `prebuild` (`npm test && node tests/upkeep.mjs`), `preview`, `check` (`astro check`), `test` (vitest ×3 TZ, as handoff), `test:ui`, `verify`, `check:upkeep`. `npm install` to produce a fresh lockfile.
- [ ] Step 4: `astro.config.mjs`: add `@astrojs/sitemap` with `filter: p => !p.includes('404')`; keep handoff options. `public/robots.txt` → `Sitemap: https://loghry.org/sitemap-index.xml`.
- [ ] Step 5: Run `npm test` → 31 handoff tests pass ×3. Fix only upgrade breakages.
- [ ] Step 6: Run `npm run build` → `dist/index.html`, `dist/404.html`, `dist/sitemap-index.xml` exist. Compare emitted `<script>` tags to handoff expectation (one module script from `src/sky/main.ts`, no inline script).
- [ ] Step 7: Commit.

### Task 2: Build stamp, metadata files, and new unit tests

**Files:**
- Modify: `src/site.ts` (stamp fallback), `src/sky/main.ts` (use `parseHooks`)
- Create: `src/sky/hooks.ts`, `public/humans.txt`, `public/llms.txt`
- Test: `tests/unit/site.test.ts`, `tests/unit/hooks.test.ts`, `tests/unit/view.test.ts`, `tests/unit/almanac.test.ts`

**Interfaces:**
- Produces: `buildStamp(env: Record<string,string|undefined>, today?: Date): { date: string; commit: string }` in `src/site.ts` (`BUILD = buildStamp(process.env)`); `parseHooks(hash: string): { moment?: string; sky?: string; event?: string; moon?: string; lightStyle?: string }` in `src/sky/hooks.ts`.

- [ ] Step 1: Tests:
  - `buildStamp({LOGHRY_BUILD_DATE:'20261122130500', LOGHRY_COMMIT:'abc1234'})` → `{date:'2026-11-22', commit:'abc1234'}`; `buildStamp({WORKERS_CI_COMMIT_SHA:'0123456789abcdef'})` → commit `'0123456'`; `buildStamp({}, new Date('2026-01-02T00:00:00Z'))` → `{date:'2026-01-02', commit:'dev'}`; `LOGHRY_COMMIT` wins over `WORKERS_CI_COMMIT_SHA`.
  - `parseHooks('#t=2026-07-04T22:25&sky=clear&event=july4&moon=full&lights=drawn')` → all five fields; `parseHooks('')` → `{}`; `parseHooks('#sky=rain')` → `{sky:'rain'}`.
  - view: `mount` fills `{{a.b}}`, `sc-if` false drops subtree, `sc-for` renders N items, a second `setState` keeps the same DOM node (identity) for an unchanged key, attribute `false` removes it. Uses jsdom environment (`// @vitest-environment jsdom`), rAF stubbed.
  - almanac: `new Almanac({}).renderVals()` with `vi.setSystemTime` at `2026-06-21T20:00Z` has daylight ≥ `16h` and at `2026-12-21T20:00Z` ≤ `8h 30m`; renders no `undefined`/`NaN` strings.
  - Malformed hero: `new Hero({moment:'garbage', sky:'nope', ...})` renderVals has no `NaN` in `clock`.
- [ ] Step 2: Run → fail. Step 3: implement. Step 4: Run `npm test` → pass ×3.
- [ ] Step 5: humans.txt (Adam Loghry, https://akl.dev, Seattle; photo Ryan Wilson / Unsplash; Astro, Nix) and llms.txt (what the page is; typical not forecast; Seattle time). Commit.

### Task 3: Static checks on `dist/`

**Files:** Create `scripts/verify-static.mjs`, `scripts/verify-static.test.mjs`

**Interfaces:** Produces `checkDist(dir: string): Promise<{id:string; ok:boolean; msg:string}[]>`; CLI `node scripts/verify-static.mjs [dir=dist]` exits non-zero on any failure.

Checks (ids): `S-FILES` required files (`index.html 404.html _headers robots.txt humans.txt llms.txt site.webmanifest favicon.ico icon.svg apple-touch-icon.png og.jpg sitemap-index.xml`); `S-SCRIPT` every `<script>` has `src` or is `application/ld+json`; `S-ORIGIN` every `src=`, `srcset=`, `<link href=`, CSS `url()` is root-relative or relative; `S-LINKS` outbound `<a href>` hosts ⊆ {`unsplash.com`}; `S-BANNED` no `akl.io`, `googletagmanager`, `gtag(`, `keybase`; `S-CSP` `_headers` `/*` CSP contains `default-src 'none'` and `script-src 'self'` without `unsafe-inline`; `S-SIZE` total ≤ 8 MB; `S-SITEMAP` sitemap lists `https://loghry.org/` and not `404`.

- [ ] Step 1: test builds a tiny fixture dir in `$TMPDIR` per check (one passing, one failing each) and asserts ids. Step 2: fail. Step 3: implement. Step 4: `node --test scripts/verify-static.test.mjs` pass; `node scripts/verify-static.mjs` against real `dist/` pass. Commit.

### Task 4: Playwright acceptance suite

**Files:** Create `scripts/serve.mjs` (shared static server applying `_headers` `/*` block + path-specific blocks, 404 → `404.html` with status 404, confined to dist), `scripts/states.mjs` (the 21 reference states + Review Focus states), `scripts/verify.mjs`.

**Interfaces:** `serve(dir: string, port=0): Promise<{port:number; close():Promise<void>}>`; `STATES: {name:string; hash:string; viewport:{width:number;height:number}; js?:boolean; reduced?:boolean}[]`.

States (hash by reference filename; viewports desktop 1440×900, phone 390×844, tablet 820×1180, ultrawide 2560×1080, short 844×390): 01 day `t=2026-06-21T13:00&sky=clear`, 02 golden `t=2026-06-21T20:30&sky=clear`, 03 dusk `t=2026-06-21T21:25&sky=partly`, 04 night `t=2026-06-21T23:30&sky=clear&moon=full`, 05 night drawn `…&lights=drawn`, 06 rain `t=2026-11-22T14:00&sky=rain`, 07 fog `t=2026-10-15T08:00&sky=fog`, 08 snow `t=2026-01-15T12:00&sky=snow`, 09 july4 `t=2026-07-04T22:25&sky=clear&event=july4`, 10 panel open (01 + click gear), 11 almanac (01, full page), 12 phone day, 13 phone night rain `t=2026-11-22T22:00&sky=rain`, 14 phone panel open, 15 phone snow, 16 tablet dusk, 17 ultrawide day, 18 short landscape, 19 no-JS, 20 reduced motion, 21 404; plus DST-spring `t=2026-03-08T02:30`, DST-fall `t=2026-11-01T01:30`, malformed `t=garbage&sky=nope`.

Assertions per state: no `pageerror`, no console `error`, no `securitypolicyviolation`, every request URL same-origin, exactly one `h1`, no `{{` or `NaN` or `undefined` in `document.body.innerText`, `scrollWidth <= innerWidth + 1`, status line (`[data-test=status]`) contains the sky word expected for that hash (clear→"clear", rain→"Rain", fog→"Fog", snow→"Snow"; case-insensitive), screenshot to `tmp/shots/<name>.png`.

Extra checks: TZ invariance (state 01 under `timezoneId` `Asia/Tokyo` and `UTC` → identical `[data-test=clock]` text); controls (gear `aria-expanded` toggles and panel visible; "control time" reveals range whose `aria-valuetext` matches `/^\d{1,2}:\d\d (AM|PM) P[SD]T$/`; "back to now"; hide chip toggles `aria-pressed`; "link to this moment" button text changes and location/clipboard contains `#t=` — grant clipboard permissions); axe (`@axe-core/playwright`, tags `wcag2a wcag2aa best-practice`) zero violations on 01, 08, 14, 21; contrast (for each visible text element in `.lk-status, .lk-words, .lk-top`: hide text, screenshot element box, take 98th-percentile luminance of background pixels, compute ratio with computed `color` → ≥ 4.5) on 01, 07, 08, 12; no-JS (`javaScriptEnabled:false`) `img` visible with non-zero `naturalWidth`, `h1` "Loghry", credit link present; reduced motion → `document.getAnimations().filter(a => a.playState==='running').length === 0`; 404 for `/nope` → status 404 and `h1` "Not here".

- [ ] Steps: write `serve.mjs` + `node --test` unit for traversal (`/../etc/passwd` → 404) and header application; write `states.mjs` + `verify.mjs`; `npm run build && npm run verify` → all PASS; inspect a handful of `tmp/shots/` against `docs/handoff/reference/` by eye. Commit.

### Task 5: Bombadil property tests

**Files:** Modify `tests/ui/run.mjs` (use `scripts/serve.mjs`, Chromium from `$CHROME`/`$CHROMIUM` or `nix build nixpkgs#chromium` cached in `tmp/.chromium-path`, runs desktop then phone, time limit from arg or `BOMBADIL_TIME_LIMIT`, default `60s`); keep `tests/ui/spec.ts` properties; add `seattleClockStable` (clock text matches `/^\d{1,2}:\d\d (AM|PM) P[SD]T/`) if absent and an `h1Visible` property.

- [ ] Steps: `npm run build && npm run test:ui` → both viewports, no violation. Commit.

### Task 6: Nix flake, CI and repo docs

**Files:** Create `flake.nix`, `flake.lock`, `nix/treefmt.nix`, `nix/checks.nix`, `.envrc`, `.node-version` (`26`), `wrangler.json`, `renovate.json` (copy akl.run), `.github/workflows/nix.yml`, `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`), `README.md`.

Flake: inputs as akl.dev; `packages.default` = `buildNpmPackage` (`nodejs_26`, `importNpmLock`, env `ASTRO_TELEMETRY_DISABLED=1`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, `LOGHRY_COMMIT`, `LOGHRY_BUILD_DATE`, `src` = fileset excluding `bake docs tmp .github`); since `prebuild` runs tests, the package build itself runs vitest ×3 + upkeep. `checks`: `build`, `astro-check`, `static` (`node scripts/verify-static.mjs ${site}` + `node --test` of the script tests), `playwright-pin`. treefmt excludes: `docs/**`, `bake/**`, `src/assets/**`, `src/sky/**`, `src/styles/**`, `src/pages/**`, `src/layouts/**`, `public/**`, `tests/**` (handoff verbatim), `*.md`, lockfiles, binaries. `apps.bake` (handoff), `apps.deploy` (copy `result`/`dist` to temp, `wrangler deploy --assets <dir>` using `wrangler.json`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` required from env). devShell: devenv, node 26, Playwright browsers from nixpkgs, chromium on PATH, python bake env, scripts `dev build verify test`.

- [ ] Steps: `nix flake lock`; set `playwright` in package.json to nixpkgs `playwright-driver.version`, reinstall; `nix build` → `result/index.html`; `nix flake check --impure` → all pass; `nix develop --impure --command npm run verify` passes. Write AGENTS.md (layout, commands, rules from handoff README, tables to maintain, deploy). Commit.

### Task 7: akl.run link (separate repo)

- [ ] Steps: in `/tahoma/workspace/akl.run`, `git worktree add .claude/worktrees/loghry-org -b loghry-org-link`; add the row after the enchilada row (before the commented block) with a 12×12 rect icon (`icon--loghry`: water `#3e5a6e`, skyline `#9aa3ab`/`#dfe3e6`, needle accent `#c67f50`); add any CSS the icon class needs following existing `icon--*`; run akl.run's unit tests (`npm test`) and `nix run .#update-golden`, then `nix flake check --impure`; commit with explicit paths; do not push.

### Task 8: Final review

- [ ] Fresh reviewer over `git diff trunk..redesign`; fix confirmed findings; re-run `nix flake check --impure`, `npm run verify`, `npm run test:ui`.
