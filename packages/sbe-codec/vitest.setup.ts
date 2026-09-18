import { beforeEach } from 'vitest';

/**
 * Vitest 3.2 throttles onTaskUpdate (100ms) then waits 60s for the parent ACK.
 * Java encode is async (execFile) so the worker can ACK during the ~90s JVM;
 * this yield still lets the first ACK land before toolchain spawnSync.
 */
beforeEach(async () => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 250);
  });
});
