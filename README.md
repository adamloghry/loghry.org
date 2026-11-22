# loghry.org

https://loghry.org — the Loghry family lives in Seattle. One aerial photograph of Lake Union, looking south toward
downtown, redrawn for the hour, season and typical weather it is in Seattle right now (never the visitor's clock).
Fully static: no server, no API, no analytics, no third-party requests.

Photo: [Ryan Wilson on Unsplash](https://unsplash.com/photos/aerial-photography-of-city-during-daytime-HkF6feHrGBE).

```sh
nix develop --impure     # or: direnv allow
npm run dev              # http://localhost:4321
npm run demo             # build, then serve dist/ like production (CSP, 404) on http://127.0.0.1:4329
npm run build            # unit tests (3 time zones) + upkeep, then dist/
npm run verify           # static + Playwright acceptance on dist/
npm run test:ui          # Bombadil property tests on dist/
nix flake check --impure # build, astro check, static checks, formatting
```

Preview any moment: `/#t=2026-07-04T22:25&sky=clear&event=july4` (Seattle wall time; also `moon=full|new`,
`lights=drawn`, `sky=clear|partly|cloudy|shower|rain|fog|snow|haze`).

See [AGENTS.md](AGENTS.md) for the layout, rules, tests and deploy, and
[docs/handoff/README.md](docs/handoff/README.md) for the design handoff.
