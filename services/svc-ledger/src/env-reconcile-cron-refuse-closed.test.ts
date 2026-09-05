/**
 * Unit card — svc-ledger RECONCILE_CRON_MINUTES unset refuse (no invented 60)
 *
 * 1. Promise: unset / blank RECONCILE_CRON_MINUTES refuses boot (never invent
 *    60). Owner-explicit 60 is a published cadence.
 * 2. Break: env.ts `.default(60)` / compose `:-60` makes a blank host env look
 *    published as an hourly snapshot interval nobody chose. Empty string must
 *    not coerce to 0 (0 is not a legal cadence).
 * 3. Done bar: production env.ts loadEnv (not a forked slice) refuses unset,
 *    blank, whitespace, and 0; explicit 60 parses; source has no `.default(60)`.
 * 4. Class N
 * 5. Paths: env.ts via loadEnv at import (same as boot)
 * 6. RED: git-default 60 returns, or unset/blank parses as 60 or 0
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 's'.repeat(32);

/** Minimum boot env so assertions are about reconcile cadence. */
const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  INTERNAL_SERVICE_SECRET: SECRET,
  JWT_ACCESS_SECRET: SECRET,
  RECONCILE_CRON_MINUTES: '60',
};

/**
 * Load production env.ts the way the process does.
 *
 * `vi.resetModules` + explicit clears are load-bearing: env.ts calls
 * `loadEnv(process.env)` at import. A forked Zod slice would stay green if
 * production `.default(60)` returned.
 */
async function loadWith(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RECONCILE_CRON_MINUTES', undefined);
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  const module = await import('./env.js');
  return module.env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const CRON_SHAPE =
  /RECONCILE_CRON_MINUTES:\s*z\.preprocess\(\s*\(v\) => \(v === undefined \|\| \(typeof v === 'string' && v\.trim\(\) === ''\) \? undefined : v\),\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\),\s*\)/;

describe('svc-ledger RECONCILE_CRON_MINUTES refuse-closed', () => {
  it('env.ts keeps the refuse-closed shape production loadEnv parses', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).toMatch(CRON_SHAPE);
    expect(envTs).not.toMatch(/RECONCILE_CRON_MINUTES:[\s\S]{0,400}\.default\(60\)/);
  });

  it('unset RECONCILE_CRON_MINUTES refuses (no invent 60)', async () => {
    await expect(loadWith({ RECONCILE_CRON_MINUTES: undefined })).rejects.toThrow(/RECONCILE_CRON_MINUTES/);
  });

  it('blank RECONCILE_CRON_MINUTES refuses (empty is not 0)', async () => {
    await expect(loadWith({ RECONCILE_CRON_MINUTES: '' })).rejects.toThrow(/RECONCILE_CRON_MINUTES/);
  });

  it('whitespace RECONCILE_CRON_MINUTES refuses', async () => {
    await expect(loadWith({ RECONCILE_CRON_MINUTES: '   ' })).rejects.toThrow(/RECONCILE_CRON_MINUTES/);
  });

  it('explicit 0 refuses (0 is not a legal cadence)', async () => {
    await expect(loadWith({ RECONCILE_CRON_MINUTES: '0' })).rejects.toThrow(/RECONCILE_CRON_MINUTES/);
  });

  it('explicit 60 is owner-published (not invented)', async () => {
    const parsed = await loadWith({ RECONCILE_CRON_MINUTES: '60' });
    expect(parsed.RECONCILE_CRON_MINUTES).toBe(60);
  });
});
