import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * THE BOOT-TIME TRAP.
 *
 * `docker-compose.apps.yml` declares the card renderer the way compose declares
 * every optional knob:
 *
 *     BLUEPRINT_CARD_RENDERER_URL: ${BLUEPRINT_CARD_RENDERER_URL:-}
 *
 * That does not leave the variable absent — it sets it to the EMPTY STRING.
 * `loadEnv` hands `process.env` to zod untouched, and `env.ts` is evaluated at
 * import time, so against a plain `z.string().url().optional()` an unset
 * renderer would not mean "this deployment has no renderer". It would mean
 * svc-blueprint crash-loops on an invalid URL — taking onboarding down over a
 * share-image rail that is optional by design.
 *
 * These tests load the REAL schema, the way the process does, rather than the
 * helper in isolation: what has to be true is that the service BOOTS, not that
 * a regex works.
 */

/** The minimum a boot needs, so the assertions below are about the renderer. */
const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  DATABASE_POOL_MAX: '10',
  EDGE_PRINCIPAL_SECRET: 'an-edge-principal-secret-long-enough-for-the-schema',
  // Renderer tests are not the engine mill — mock omits the unpublished URL.
  BLUEPRINT_ENGINE_MODE: 'mock',
};

/**
 * Load `env.ts` fresh under a given environment.
 *
 * `vi.unstubAllEnvs` and the explicit clear are load-bearing, not tidiness.
 * Vitest's `unstubEnvs` option is off by default, so a `stubEnv` from one test
 * survives into the next: without this, "boots with the variable absent" would
 * silently inherit the empty string the case before it stubbed in, and pass
 * while testing the wrong thing. The clear also covers a developer whose own
 * shell exports the variable.
 */
async function loadWith(overrides: Record<string, string>): Promise<{ BLUEPRINT_CARD_RENDERER_URL?: string }> {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BLUEPRINT_CARD_RENDERER_URL', undefined);
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) vi.stubEnv(key, value);
  const module = await import('./env.js');
  return module.env as { BLUEPRINT_CARD_RENDERER_URL?: string };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('BLUEPRINT_CARD_RENDERER_URL — an unset compose variable must not kill the service', () => {
  it('boots with the variable set to the empty string, and reports no renderer', async () => {
    // The exact shape compose produces. This is the assertion that keeps the
    // fleet up.
    const env = await loadWith({ BLUEPRINT_CARD_RENDERER_URL: '' });
    expect(env.BLUEPRINT_CARD_RENDERER_URL).toBeUndefined();
  });

  it('boots with the variable absent entirely', async () => {
    const env = await loadWith({});
    expect(env.BLUEPRINT_CARD_RENDERER_URL).toBeUndefined();
  });

  it('accepts a real renderer URL', async () => {
    const env = await loadWith({ BLUEPRINT_CARD_RENDERER_URL: 'https://renderer.internal/v1' });
    expect(env.BLUEPRINT_CARD_RENDERER_URL).toBe('https://renderer.internal/v1');
  });

  it('really clears the variable between cases, so the two above are different tests', async () => {
    // Guards the guard. If `loadWith` ever stops clearing, the "absent
    // entirely" case degrades into a second copy of the empty-string case and
    // nothing fails — the quietest way a suite loses a test.
    await loadWith({ BLUEPRINT_CARD_RENDERER_URL: 'https://renderer.internal/v1' });
    expect(process.env.BLUEPRINT_CARD_RENDERER_URL).toBe('https://renderer.internal/v1');

    await loadWith({});
    expect(process.env.BLUEPRINT_CARD_RENDERER_URL).toBeUndefined();
  });

  it('STILL refuses to boot on a malformed URL', async () => {
    // The half that must not be lost to the leniency above. A typo'd host is a
    // misconfiguration an operator needs to hear about at startup — not one
    // that silently degrades to "no renderer" and quietly stops rendering.
    await expect(loadWith({ BLUEPRINT_CARD_RENDERER_URL: 'renderer.internal' })).rejects.toThrow(/BLUEPRINT_CARD_RENDERER_URL/);
  });
});
