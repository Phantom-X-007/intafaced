import { defineConfig } from 'vitest/config';

/**
 * These tests talk to a RUNNING FLEET. That changes three defaults.
 *
 * `fileParallelism: false` — every file registers users, seeds a market and
 * moves value in one shared Postgres. Running them concurrently would make a
 * failure a question about ordering rather than about the platform, which is
 * the fastest way to teach a team to ignore an e2e suite.
 *
 * The timeouts are generous because a cold fleet has a JIT, a connection pool
 * and a matching engine to warm up, and a flaky timeout is indistinguishable
 * from a real regression at 2am.
 *
 * No retries, deliberately. A retried e2e is a test that hides the exact class
 * of bug — a lost event, a race on a hold — that only an e2e can find.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    retry: 0,
    reporters: ['verbose'],
  },
});
