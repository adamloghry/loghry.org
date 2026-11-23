import { defineConfig } from 'vitest/config';

// Only the unit tests: tmp/ (scratch, may hold a copy of the handoff) and tests/ui (Bombadil) are not vitest suites.
export default defineConfig({
  // Some tests sweep a whole year of the model; the CI builder (2 cores, inside nix build) is several times slower than a
  // workstation, so the 5 s default is too tight.
  test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 30000 },
});
