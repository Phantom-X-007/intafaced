import { beforeEach } from 'vitest';

/**
 * Vitest 3.2 throttles onTaskUpdate (100ms) then waits 60s for the parent ACK.
 * spawnSync Java (~90s) blocks the worker event loop, so the ACK never lands
 * and CI dies with `[vitest-worker]: Timeout calling "onTaskUpdate"` after
 * the roundtrip already passed. Yield past the throttle first.
 */
beforeEach(async () => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 250);
  });
});
