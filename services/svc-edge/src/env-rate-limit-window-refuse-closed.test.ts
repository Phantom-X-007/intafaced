/**
 * Unit card — svc-edge EDGE_RATE_LIMIT_WINDOW_MS unset refuse (no invented 60000)
 *
 * 1. Promise: unset / blank EDGE_RATE_LIMIT_WINDOW_MS refuses boot (never invent
 *    60000). Owner-explicit 60000 is a published window. Pair with MAX: both
 *    required, neither invented.
 * 2. Break: env.ts `.default(60_000)` / compose `:-60000` makes a blank host
 *    env look published as a 60s stuffing interval next to a refuse-closed max.
 * 3. Done bar: production env.ts loadEnv (not a forked slice) refuses unset
 *    and blank; explicit 60000 parses; source has no `.default(60_000)`.
 * 4. Class N
 * 5. Paths: env.ts via loadEnv at import (same as boot)
 * 6. RED: git-default 60000 returns, or unset/blank parses as 60000
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 's'.repeat(32);

/** Minimum boot env so assertions are about the throttle window. */
const BASE_ENV = {
  JWT_ACCESS_SECRET: SECRET,
  EDGE_PRINCIPAL_SECRET: SECRET,
  EDGE_RATE_LIMIT_MAX: '300',
  EDGE_RATE_LIMIT_WINDOW_MS: '60000',
};

/**
 * Load production env.ts the way the process does.
 *
 * `vi.resetModules` + explicit clears are load-bearing: env.ts calls
 * `loadEnv(process.env)` at import. A forked Zod slice would stay green if
 * production `.default(60_000)` returned.
 */
async function loadWith(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('EDGE_RATE_LIMIT_MAX', undefined);
  vi.stubEnv('EDGE_RATE_LIMIT_WINDOW_MS', undefined);
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  const module = await import('./env.js');
  return module.env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('svc-edge EDGE_RATE_LIMIT_WINDOW_MS refuse-closed', () => {
  it('env.ts keeps the refuse-closed shape production loadEnv parses', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).toMatch(/EDGE_RATE_LIMIT_WINDOW_MS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1000\)\.max\(3_600_000\),/);
    expect(envTs).not.toMatch(/EDGE_RATE_LIMIT_WINDOW_MS:[^\n]*?\.default\(/);
  });

  it('unset EDGE_RATE_LIMIT_WINDOW_MS refuses (no invent 60000)', async () => {
    await expect(loadWith({ EDGE_RATE_LIMIT_WINDOW_MS: undefined })).rejects.toThrow(/EDGE_RATE_LIMIT_WINDOW_MS/);
  });

  it('blank EDGE_RATE_LIMIT_WINDOW_MS refuses', async () => {
    await expect(loadWith({ EDGE_RATE_LIMIT_WINDOW_MS: '' })).rejects.toThrow(/EDGE_RATE_LIMIT_WINDOW_MS/);
  });

  it('explicit 60000 is owner-published (not invented)', async () => {
    const parsed = await loadWith({ EDGE_RATE_LIMIT_WINDOW_MS: '60000' });
    expect(parsed.EDGE_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});
