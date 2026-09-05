/**
 * Unit card — IDENTITY_MAX_SUB_ACCOUNTS refuse-closed
 *
 * 1. Promise: blank / unset is unpublished (undefined). Owner-explicit 25
 *    parses as 25. Garbage / 0 / over-max refuse boot. env.ts has no .default(25).
 * 2. Break: z.coerce.number().default(25) makes blank look published.
 * 3. Done bar: production env.ts loadEnv (not a forked slice) + source pin.
 * 4. Class M
 * 5. Paths: env.ts via loadEnv at import (same as boot)
 * 6. RED: unset parses as 25, or .default(25) returns
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 's'.repeat(32);

const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  EDGE_PRINCIPAL_SECRET: SECRET,
  INTERNAL_SERVICE_SECRET: SECRET,
  JWT_ACCESS_SECRET: SECRET,
};

async function loadWith(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('IDENTITY_MAX_SUB_ACCOUNTS', undefined);
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  const module = await import('./env.js');
  return module.env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IDENTITY_MAX_SUB_ACCOUNTS refuse-closed', () => {
  it('env.ts does not git-default 25', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).not.toMatch(/IDENTITY_MAX_SUB_ACCOUNTS:[\s\S]{0,400}\.default\(25\)/);
    expect(envTs).not.toMatch(/DEFAULT_MAX_SUB_ACCOUNTS/);
  });

  it('unset is unpublished (not 25)', async () => {
    const parsed = await loadWith({});
    expect(parsed.IDENTITY_MAX_SUB_ACCOUNTS).toBeUndefined();
  });

  it('blank is unpublished (not 25)', async () => {
    const parsed = await loadWith({ IDENTITY_MAX_SUB_ACCOUNTS: '' });
    expect(parsed.IDENTITY_MAX_SUB_ACCOUNTS).toBeUndefined();
  });

  it('whitespace is unpublished (not 25)', async () => {
    const parsed = await loadWith({ IDENTITY_MAX_SUB_ACCOUNTS: '   ' });
    expect(parsed.IDENTITY_MAX_SUB_ACCOUNTS).toBeUndefined();
  });

  it('owner-explicit 25 is allowed', async () => {
    const parsed = await loadWith({ IDENTITY_MAX_SUB_ACCOUNTS: '25' });
    expect(parsed.IDENTITY_MAX_SUB_ACCOUNTS).toBe(25);
  });

  it('garbage refuses boot (does not invent a count)', async () => {
    await expect(loadWith({ IDENTITY_MAX_SUB_ACCOUNTS: 'garbage' })).rejects.toThrow(/IDENTITY_MAX_SUB_ACCOUNTS/);
  });

  it('zero refuses boot (not a published cap)', async () => {
    await expect(loadWith({ IDENTITY_MAX_SUB_ACCOUNTS: '0' })).rejects.toThrow(/IDENTITY_MAX_SUB_ACCOUNTS/);
  });
});
