import { defineConfig } from 'vitest/config';

/**
 * ONE ANVIL, ONE FILE AT A TIME.
 *
 * On-chain suites share a single anvil. `evm_increaseTime` is process-global, so
 * a parallel LegacyVault / vesting / escrow file can elapse another suite's
 * inactivity window and surface as InSuccession / Unhealthy / empty debt in a
 * file the author did not touch.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    // Vitest 3 can still schedule files on multiple workers when this is unset.
    // One worker is what "one anvil, one file" actually means in CI.
    maxWorkers: 1,
  },
});
