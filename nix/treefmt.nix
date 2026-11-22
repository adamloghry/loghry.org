# Formatting for repo tooling only (nix, json, yaml), as in akl.dev. The handoff's sources keep their delivered
# formatting so the port stays comparable line by line with docs/handoff/; public/ is the deployed artefact.
{
  perSystem = _: {
    treefmt = {
      projectRootFile = "flake.nix";
      programs.nixfmt.enable = true;
      programs.prettier = {
        enable = true;
        includes = [
          "*.json"
          "*.yml"
          "*.yaml"
        ];
      };
      settings.excludes = [
        "public/**"
        "docs/handoff/**"
        "src/**"
        "package-lock.json"
        "flake.lock"
        "tmp/**"
      ];
    };
  };
}
