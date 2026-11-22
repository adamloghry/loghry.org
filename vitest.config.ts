import { defineConfig } from 'vitest/config';

// Only the unit tests: tmp/ (scratch, may hold a copy of the handoff) and tests/ui (Bombadil) are not vitest suites.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});
