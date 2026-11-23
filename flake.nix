{
  description = "loghry.org: a fully static site (Astro), built reproducibly and deployed with Cloudflare Pages";

  nixConfig = {
    extra-substituters = [ "https://devenv.cachix.org" ];
    extra-trusted-public-keys = [ "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv = {
      url = "github:cachix/devenv";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      self,
      flake-parts,
      devenv,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      imports = [
        inputs.treefmt-nix.flakeModule
        ./nix/treefmt.nix
        ./nix/checks.nix
      ];

      perSystem =
        {
          pkgs,
          lib,
          self',
          config,
          ...
        }:
        let
          node = pkgs.nodejs_26;

          # The build stamp in the bottom-right panel. Both come from git through the flake, so the output is a
          # pure function of the commit. A dirty tree builds as <rev>-dirty.
          commit = self.shortRev or self.dirtyShortRev or "dev";
          buildDate = self.lastModifiedDate or "19700101000000"; # YYYYMMDDHHMMSS (UTC); src/site.ts keeps the date part

          # Only what the site build reads. bake/original.png (the 7.5 MB photo), docs/ (the
          # handoff's reference screenshots) and tmp/ are not inputs; the baked layers are committed in src/assets.
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./package.json
              ./package-lock.json
              ./astro.config.mjs
              ./tsconfig.json
              ./vitest.config.ts
              ./src
              ./public
              ./tests
              ./scripts
              ./bake/scripts # text only (tests compare its I-5 trace with the page's); not bake/original.png
            ];
          };

          # Shared by the site and every check that needs node_modules. Dependencies come straight from
          # package-lock.json (each tarball checked against its integrity hash), so there is no npmDepsHash.
          npmPackage =
            args:
            pkgs.buildNpmPackage (
              {
                version = commit;
                inherit src;
                nodejs = node;
                npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
                npmConfigHook = pkgs.importNpmLock.npmConfigHook;
                env = {
                  ASTRO_TELEMETRY_DISABLED = "1";
                  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
                  LOGHRY_COMMIT = commit;
                  LOGHRY_BUILD_DATE = buildDate;
                };
              }
              // args
            );

          # Chromium (+ headless shell), Firefox and WebKit: verify.mjs runs every state in all three.
          # nixpkgs packages Playwright's WebKit and Firefox for Linux only; elsewhere use VERIFY_BROWSERS=chromium.
          playwrightBrowsers = pkgs.playwright-driver.browsers.override {
            withFirefox = pkgs.stdenv.hostPlatform.isLinux;
            withWebkit = pkgs.stdenv.hostPlatform.isLinux;
          };

          bakePython = pkgs.python3.withPackages (p: [
            p.numpy
            p.scipy
            p.pillow
          ]);
        in
        {
          _module.args = { inherit npmPackage; };

          # `npm run build` runs `prebuild` first: the unit tests under three time zones and the upkeep reminder.
          # So the package does not build unless the tests pass, here and on Cloudflare's builder alike.
          packages.default = npmPackage {
            pname = "loghry-org";
            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          };

          apps = {
            # nix run .#bake -> rebuild every image layer from bake/original.png into src/assets/sky (about 2
            # minutes); commit the result. Not part of any build.
            bake = {
              type = "app";
              program = lib.getExe (
                pkgs.writeShellApplication {
                  name = "loghry-bake";
                  runtimeInputs = [ bakePython ];
                  text = ''
                    [ -x bake/run.sh ] || { echo "run this from the repository root" >&2; exit 2; }
                    exec bake/run.sh "$@"
                  '';
                }
              );
            };

            # nix run .#deploy [dir] -> upload the Nix-built site (or dist/) to the loghry-org Cloudflare Pages project,
            # bypassing the git integration. Credentials come from the environment only.
            deploy = {
              type = "app";
              program = lib.getExe (
                pkgs.writeShellApplication {
                  name = "loghry-deploy";
                  runtimeInputs = [
                    pkgs.wrangler
                    pkgs.git
                  ];
                  text = ''
                    export WRANGLER_SEND_METRICS=false
                    : "''${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Cloudflare Pages: Edit)}"
                    : "''${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"

                    src="''${1:-}"
                    if [ -z "$src" ]; then
                      if [ -e result ]; then src=result; elif [ -d dist ]; then src=dist; else
                        echo "error: no build found; run 'nix build' (preferred) or 'npm run build'" >&2; exit 1
                      fi
                    fi
                    [ -f "$src/index.html" ] || { echo "error: $src/index.html not found" >&2; exit 1; }

                    # result/ is a read-only symlink into the store; wrangler wants a real, writable tree.
                    work=$(mktemp -d)
                    trap 'rm -rf "$work"' EXIT
                    cp -rL "$src" "$work/site"
                    chmod -R u+w "$work/site"

                    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)
                    commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)
                    dirty=false; git diff --quiet HEAD 2>/dev/null || dirty=true
                    echo "deploying $src -> Pages project loghry-org (branch $branch; only trunk is production)"
                    wrangler pages deploy "$work/site" --project-name loghry-org --branch "$branch" --commit-hash "$commit" --commit-dirty "$dirty"
                  '';
                }
              );
            };
          };

          devShells.default = devenv.lib.mkShell {
            inherit inputs pkgs;
            modules = [
              (
                { pkgs, ... }:
                {
                  languages.javascript = {
                    enable = true;
                    package = node;
                    npm.enable = true;
                    npm.install.enable = true;
                  };

                  packages = [
                    bakePython
                    pkgs.wrangler
                  ];

                  git-hooks.hooks.treefmt = {
                    enable = true;
                    package = config.treefmt.build.wrapper;
                  };

                  scripts.dev.exec = "npm run dev";
                  scripts.build.exec = "npm run build";
                  scripts.verify.exec = "npm run build && npm run verify";
                  # Bound to this machine's Tailscale address when there is one (tailnet only), else loopback.
                  scripts.demo.exec = ''
                    HOST="''${HOST:-$(tailscale ip -4 2>/dev/null | head -n1)}" npm run demo
                  '';
                  scripts.properties.exec = "npm run test:ui -- \"$@\"";

                  env = {
                    # Not playwright-driver.browsers-chromium: it omits the headless shell that the default headless
                    # chromium.launch() needs. Bombadil uses the same Chromium.
                    PLAYWRIGHT_BROWSERS_PATH = "${playwrightBrowsers}";
                    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
                    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
                    ASTRO_TELEMETRY_DISABLED = "1";
                  };

                  # Off NixOS (e.g. GitHub's Ubuntu runner) there is no /run/opengl-driver, so Nix-built WebKit finds no
                  # EGL driver and aborts ("Could not create EGL display"). Point libglvnd at nixpkgs' Mesa instead.
                  enterShell =
                    lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
                      if [ ! -e /run/opengl-driver ]; then
                        export __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json
                        export LIBGL_DRIVERS_PATH=${pkgs.mesa}/lib/dri
                        export GBM_BACKENDS_PATH=${pkgs.mesa}/lib/gbm
                      fi
                    ''
                    + ''
                      echo "loghry.org dev environment"
                      echo "  dev        - Astro dev server"
                      echo "  build      - unit tests (x3 time zones), upkeep, then dist/"
                      echo "  verify     - build, then static + Playwright acceptance checks"
                      echo "  demo       - build, then serve dist/ with production headers on :4329 (tailnet IP if any)"
                      echo "  properties - Bombadil property tests on dist/ (pass a time limit, e.g. 5m)"
                      echo "  nix flake check --impure - build, astro check, static checks, treefmt"
                    '';
                }
              )
            ];
          };
        };
    };
}
