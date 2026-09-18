import { defineConfig } from 'vitest/config';

/**
 * Linked Java roundtrip is ~90s. Vitest 3.2 birpc waits 60s for onTaskUpdate
 * ACK and does not take testTimeout (vitest#8164). Java encode is async spawn
 * so the worker can ACK; these timeouts cover the body and worker teardown.
 */
export default defineConfig({
  test: {
    testTimeout: 180_000,
    hookTimeout: 180_000,
    teardownTimeout: 180_000,
    setupFiles: ['./vitest.setup.ts'],
  },
});
