# Non-browser checks, run by `nix flake check --impure`. The package build itself already runs the unit tests
# (x3 time zones) and the upkeep reminder through `prebuild`, so `checks.build` covers those.
# The browser suites (`npm run verify`, `npm run test:ui`) need Chromium and a local server; they run in CI and
# the dev shell, not here.
{
  perSystem =
    {
      pkgs,
      lib,
      self',
      npmPackage,
      ...
    }:
    let
      stamp =
        name: script:
        npmPackage {
          pname = "loghry-org-${name}";
          dontNpmBuild = true;
          buildPhase = ''
            runHook preBuild
            ${script}
            runHook postBuild
          '';
          installPhase = ''
            runHook preInstall
            touch $out
            runHook postInstall
          '';
        };
    in
    {
      checks = {
        build = self'.packages.default;

        # astro check: type-checks the pages, layouts and the typed modules (hero.ts and almanac.ts are
        # // @ts-nocheck, as delivered).
        astro-check = stamp "astro-check" "npm run check";

        # The fixture tests of the static checker and the test server, then the static checks on the real build.
        static = stamp "static" ''
          node --test scripts/verify-static.test.mjs scripts/serve.test.mjs
          node scripts/verify-static.mjs ${self'.packages.default}
        '';

        # The Playwright npm package must match the browsers nixpkgs provides to the dev shell.
        playwright-pin =
          let
            npmPin = (builtins.fromJSON (builtins.readFile ../package.json)).devDependencies.playwright;
          in
          assert lib.assertMsg (npmPin == pkgs.playwright-driver.version)
            "package.json playwright (${npmPin}) != nixpkgs playwright-driver (${pkgs.playwright-driver.version}): set package.json to the nixpkgs version and run npm install";
          pkgs.runCommand "playwright-pin" { } "touch $out";
      };
    };
}
