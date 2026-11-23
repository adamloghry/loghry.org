# loghry.org redesign — design

Date: 2026-11-22. Owner: akl. Status: draft for approval.

## Intent

Replace the 2018 loghry.org (an HTML5 UP "Dimension" template: jQuery,
Font Awesome, Google Analytics UA tag, one background JPEG) with the
redesign delivered as a Claude Code handoff in `tmp/redesign/`: one aerial
photograph of Lake Union redrawn for the hour, season and *typical* weather
it is in Seattle right now, plus an almanac section ("today over Lake
Union", "the year in Seattle's daylight", "a typical <month>"). It is a
small public family landing page. The owner will link it from akl.run as
**loghry.org — "Small landing page which shows typical Seattle."**

Why now: the old site is a dead template with a defunct analytics tag; the
owner's other sites (akl.dev, akl.run) have moved to a common Astro + Nix
stack and this one should join them.

## Goals

- Ship the handoff's design and behaviour faithfully: copy, layout, model,
  image layers, preview hooks, CSP, "rules that must keep holding" (handoff
  README). The handoff is the visual and behavioural authority.
- Port it onto the sibling-site toolchain (see Approaches) so all three
  sites build, test, format and deploy the same way.
- Make it **highly tested**, closing the gaps the handoff itself lists as
  "Not verified" / "Known weak spots": an evaluated and built flake, a
  committed `flake.lock`, automated axe and contrast checks, the 21
  reference states exercised headlessly with zero console/CSP/network
  errors.
- Public and secret-free: nothing in the repo or `dist/` is private.
- Add the akl.run landing-page row on a branch the owner pushes after
  loghry.org is live.

## Non-goals

- Any change to the design, copy, model maths, image bake or layer tuning.
- Re-running the image bake (`bake/` is kept, its outputs are committed).
- Pixel-diff screenshot testing against `reference/` (the scenes animate
  and are time-dependent; we assert structure and state, not pixels).
- Firefox/Safari automation (only Chromium is in the Nix toolchain on the
  sibling repos; noted as a remaining gap).
- DNS/Cloudflare cutover and pushing anywhere. The owner does those.

## Anti-goals (failure even if it "works")

- Any third-party request, analytics, or `fetch` at runtime.
- Using the visitor's clock or time zone anywhere.
- Named family members or dates; any sound.
- Mentioning the retired `akl.io` domain in anything shipped.
- Secrets in the repo (deploy creds come only from the environment).

## Constraints

- Workspace rules (`/tahoma/workspace/AGENTS.md`): no new files at the
  workspace root; parallel work in `.claude/worktrees/`; never `git add -A`
  (use explicit paths); never push.
- akl.run edits happen in an akl.run worktree on a new branch; that repo's
  `AGENTS.md` and golden-output check govern there.
- Sandbox has npm registry and nix cache access (to be confirmed at
  implementation time; if not, report rather than work around).

## Approaches

1. **Port the handoff onto the sibling toolchain (chosen by owner).** Keep
   all handoff source (`src/`, `public/`, `bake/`, tests) and move it onto
   Astro 7, Node 26, flake-parts + devenv + treefmt, Workers static assets
   (`wrangler.json`), renovate, GitHub `nix.yml`, Playwright `verify`, and
   Bombadil — the akl.dev / akl.run conventions. Cost: an Astro 5→7 upgrade
   and a vitest 3→4 bump the handoff never ran against.
2. **Handoff as written.** Astro 5, `nixos-25.11`, plain `mkShell`,
   `wrangler pages deploy`. Least work, but a third, divergent stack, on a
   Pages deploy path the siblings have already left. Rejected by owner.
3. **Rewrite the hero as Astro components / a framework.** Would replace
   the handoff's 40-line template runtime with something "standard", but
   it rewrites tested, tuned behaviour for no user-visible gain and breaks
   "handoff is the authority". Not considered further.

## Decisions taken with the owner

- Tooling: match siblings (approach 1).
- `keybase.txt`: dropped.
- `humans.txt`: rewritten for the new site (points to akl.dev, credits the
  photo, names Astro + Nix; no akl.io).
- akl.run link: a worktree + branch in akl.run with the new row, a 12×12
  pixel-art icon in akl.run's existing icon style, and regenerated golden
  files; not pushed.
- Everything else from the old site (template, jQuery, Font Awesome, GA,
  `images/`, `assets/`) is deleted. Old `sitemap.xml`/`robots.txt` are
  superseded by the new ones.

## Design

### Repository layout (after)

```
astro.config.mjs  package.json  package-lock.json  tsconfig.json
flake.nix  flake.lock  nix/{treefmt,checks}.nix  .envrc  .node-version
wrangler.json  renovate.json  .github/workflows/nix.yml  .gitignore
AGENTS.md  CLAUDE.md (-> @AGENTS.md)  README.md
src/        handoff source (site.ts, sky/, styles/, layouts/, pages/, assets/sky/)
public/     handoff public/ + humans.txt + llms.txt
tests/unit/       vitest (handoff's 31 tests + new ones)
tests/ui/         Bombadil spec + runner (handoff), serve.mjs shared
scripts/verify.mjs      Playwright acceptance suite (new)
scripts/verify-static.mjs  no-browser checks on dist/ (new)
tests/upkeep.mjs  handoff upkeep reminder
bake/             handoff offline image pipeline (not a build input)
docs/handoff/     the handoff README + reference/ screenshots, verbatim
docs/superpowers/ this spec and the plan
```

`tmp/` stays untracked scratch (gitignored).

### Toolchain

- **Astro 7** (`^7.4.x`, as siblings), `output: 'static'`,
  `passthroughImageService`, `inlineStylesheets: 'never'`,
  `assetsInlineLimit: 0` (handoff settings kept). `@astrojs/sitemap`
  replaces the hand-written `sitemap.xml` (siblings do this); `robots.txt`
  points at `sitemap-index.xml`. 404 excluded from the sitemap.
- **Node 26** (`.node-version` 26, `engines >=22.23.4`, flake
  `nodejs_26`), matching akl.dev.
- **vitest 4**, `@astrojs/check` + `typescript` for `astro check`
  (`hero.ts`/`almanac.ts` keep `// @ts-nocheck` per handoff).
- Fonts unchanged: `@fontsource/newsreader`, `@fontsource/jetbrains-mono`.
- **Flake**: flake-parts, nixos-unstable, devenv shell (`dev`, `build`,
  `verify`, `test` helpers; Playwright browsers from nixpkgs
  `playwright-driver`, Chromium for Bombadil), treefmt (nixfmt +
  prettier, excluding verbatim files: `public/_headers`, `docs/**`,
  `src/assets/**`, `*.md`, lockfiles, binaries, and the handoff's
  hand-formatted `src/sky/*.html`/`*.ts`/`styles/*.css` so the port stays
  byte-comparable to the handoff).
  - `packages.default`: `buildNpmPackage` with `importNpmLock`; build
    stamp from `self.shortRev`/`self.lastModifiedDate` via
    `LOGHRY_COMMIT`/`LOGHRY_BUILD_DATE` (handoff mechanism kept).
  - `checks`: `build`, `unit` (vitest ×3 time zones), `upkeep`,
    `astro-check`, `static` (`scripts/verify-static.mjs` against the built
    package), `treefmt`, `playwright-pin` (package.json `playwright` ==
    nixpkgs `playwright-driver` version, as akl.dev).
  - `apps.bake` (handoff), `apps.deploy` (wrangler, assets-only Worker,
    creds from env only).
- **Deploy**: `wrangler.json` `{ name: "loghry-org", assets: { directory:
  "./dist", not_found_handling: "404-page" }, previews: {} }` — the
  Workers Builds path the siblings use. `_headers` keeps working there.
- **CI**: `.github/workflows/nix.yml` like akl.run: `nix flake check
  --impure`, build, `npm run verify`, Bombadil. No remote exists yet; the
  workflow is ready for when one is added.
- **renovate.json**: copied from akl.run.

### Tests ("highly tested")

1. **Unit (vitest)** — handoff's model and hero tests, run under
   `TZ=America/Los_Angeles`, `Asia/Tokyo`, `UTC`. Add: `view.ts` runtime
   (holes, `sc-if`, `sc-for`, keyed patch reuses nodes), `almanac.ts`
   render values for a few dates, `site.ts` build-stamp parsing, preview
   hash parsing.
2. **Static checks on `dist/`** (`scripts/verify-static.mjs`, also a flake
   check): required files exist (`index.html`, `404.html`, `_headers`,
   `robots.txt`, `humans.txt`, `llms.txt`, `site.webmanifest`, icons,
   `og.jpg`, `sitemap-index.xml`); no inline `<script>` without `src`
   (JSON-LD excepted if added); every `src`/`href`/`srcset`/`url()` in
   HTML and CSS is same-origin or one of an allow-list of outbound links
   (Unsplash credit); no `akl.io`, no `googletagmanager`, no `keybase`;
   CSP in `_headers` has `default-src 'none'` and no script
   `unsafe-inline`; total `dist/` size budget (≤ 8 MB).
3. **Playwright acceptance** (`npm run verify`, akl.dev style, serving
   `dist/` with `_headers` applied):
   - All 21 reference states (the handoff's preview hashes, at the
     handoff's viewports) load with zero `pageerror`, console errors,
     CSP violations, or non-same-origin requests; the status line names
     the expected sky; exactly one `h1`; no `{{` left in the DOM.
   - Seattle-time invariance: with the browser time zone forced to
     `Asia/Tokyo` and `UTC`, a fixed `#t=` renders the same clock text.
   - Controls: gear panel opens/closes with matching `aria-expanded`;
     "control time" slider shows and its `aria-valuetext` is Seattle
     time; "back to now"; hide-text chip toggles `aria-pressed`; "link to
     this moment" produces a `#t=` URL.
   - axe-core (WCAG 2 A/AA + best-practice) with zero violations on:
     desktop day, desktop snow, phone night with panel open, 404.
   - Contrast: the handoff's hand check, automated — text colour vs.
     the brightest 2 % of pixels behind each label ≥ 4.5:1 in snow,
     clear noon, fog, phone.
   - JS disabled: day photo, heading and photo credit visible.
   - `prefers-reduced-motion`: no running CSS animations on layers.
   - No horizontal scroll at 320, 390, 768, 1440, 2560 wide.
   - 404 returns the 404 page.
4. **Bombadil** (handoff spec + runner adapted to the sibling runner
   pattern): desktop 1280×800 and phone 390×844, 60 s each by default.
5. **Upkeep** (`tests/upkeep.mjs`) as a flake check (warns, never fails,
   per handoff).

### Copy and metadata files

- `humans.txt`: team (Adam Loghry, https://akl.dev, Seattle), photo credit
  (Ryan Wilson / Unsplash), built with Astro + Nix. No akl.io.
- `llms.txt`: one paragraph on what the page is and how the sky is
  computed (typical, not a forecast), linking to `/`.
- Everything else (title, description, OG, manifest, icons) is the
  handoff's.

### akl.run change (separate repo, separate branch)

In an akl.run worktree under `.claude/worktrees/loghry-org`, branch
`loghry-org-link`: add an `<li class="project">` row linking
`https://loghry.org/`, name `loghry.org`, description "Small landing page
which shows typical Seattle.", with a 12×12 `<rect>`-pixel icon (lake +
skyline in the photo's palette) matching the existing icons' markup.
Placed after the existing live rows. Update whatever akl.run's tests and
golden files require (`nix run .#update-golden`), run its checks, commit,
do not push.

## Calls made after the builder check (owner may override)

- **Production path is Workers Builds** (git-connected, as siblings), with
  `nix run .#deploy` as a manual alternative that uploads the Nix-built
  `result/`. Because Workers Builds runs plain `npm run build` outside Nix,
  `prebuild` runs the unit tests (×3 time zones) and the upkeep check, so
  nothing reaches production untested. `site.ts` additionally reads
  Cloudflare's `WORKERS_CI_COMMIT_SHA` for the build stamp when
  `LOGHRY_COMMIT` is unset (date falls back to build day, as the handoff
  already does).
- **Handoff-code changes made during the build** (each with a test): the
  build stamp above; preview-hook parsing moved from `main.ts` into
  `src/sky/hooks.ts`; `view.ts` renames bound `on*="{{…}}"` attributes before
  parsing (Chrome reported each as a CSP violation, 6 console errors per
  load); two type annotations in `model.ts` for `astro check`.
- **Branch**: work lands on a `redesign` branch in this checkout (no
  worktree needed: nothing else is running here); `trunk` is left at the
  old site until the owner merges. akl.run gets its own branch as above.
- **Reference states**: the handoff records names and two viewports, not
  exact hashes. The suite defines one `#t=…&sky=…&event=…` per reference
  filename, read off the screenshots (time shown in the status line) and
  the README's viewports; tablet 820×1180, ultrawide 2560×1080,
  short-landscape 844×390. These approximate, not reproduce, `reference/`.
- **"No named family members"** means relatives beyond the site owner:
  `humans.txt` may name Adam Loghry (already public on akl.dev). The static
  check greps for akl.io, analytics and keybase, not for names.

## Owner changes after the build

- 2026-11-22: drop the "loghry.org" wordmark from the top left; the
  coordinates chip stays top right (`.lk-top` is `flex-end`). Asserted per
  state by `verify.mjs` (`top-bar`).
- 2026-11-22: roads and night light. Northlake starts at the foot of Gas Works
  (it ran out across the bay); Westlake is retraced along the building line,
  inland of the marina band the water mask misses; the straight Mercer trace
  to the Needle is removed. Water reflections are half as strong (0.9 to 0.45)
  and city lights are composited at 0.7 of the handoff's strength (night
  highlights -18%). Cars: I-5 14/13 cars at 64/68 s (were 26/24 at 36/38 s),
  Aurora 2 each way at 14 s (were 5 at 7 s), 3/2 px with a 3 px glow at
  0.4 alpha (were 4/3 px, 6 px at 0.65-0.75). Pinned by tests/unit/cars.test.ts;
  the bake changes were checked by eye against the photo and water mask.
- 2026-11-22: I-5 cars 30% slower (91/97 s per pass); N 45th St and Westlake
  lights at half strength (`DIM_45TH`, `DIM_WESTLAKE` in `lights.py`, applied at
  raster time so no other light moves; verified with a before/after difference
  image).

## Left to the builder

- Exact Astro 7 / vitest 4 breakages and their minimal fixes (keep handoff
  behaviour; note any deviation in `AGENTS.md`).
- Exact Playwright assertions per reference state, derived from the
  handoff's hash list and screenshots.
- `deploy` app details (wrangler `deploy` vs. `versions upload`), as long
  as creds come only from env.
- Icon pixel art for akl.run.

## Known remaining gaps (to report at the end)

- Firefox/Safari still unautomated.
- Real-GPU frame rates still unmeasured.
- Deploy is untested until the owner creates the Worker and DNS.
