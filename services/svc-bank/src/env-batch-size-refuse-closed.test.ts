/**
 * Unit card — svc-bank TRANSFER_BATCH_SIZE / LOAN_SWEEP_BATCH_SIZE unset refuse
 *
 * 1. Promise: unset / blank TRANSFER_BATCH_SIZE refuses boot (never invent
 *    200). Unset / blank LOAN_SWEEP_BATCH_SIZE refuses boot (never invent 500).
 *    Owner-explicit 200 / 500 are published ceilings.
 * 2. Break: env.ts `.default(200)` / `.default(500)` / compose `:-200` /
 *    `:-500` makes a blank host env look published as a job batch ceiling
 *    nobody chose. Empty string must not coerce to 0 (0 is not a legal batch).
 * 3. Done bar: production env.ts loadEnv (not a forked slice) refuses unset,
 *    blank, whitespace, and 0; explicit 200 / 500 parse; source has no
 *    `.default(200)` / `.default(500)`.
 * 4. Class N
 * 5. Paths: env.ts via loadEnv at import (same as boot)
 * 6. RED: git-default 200/500 returns, or unset/blank parses as 200/500 or 0
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 's'.repeat(32);

/** Minimum boot env so assertions are about batch ceilings. */
const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  EDGE_PRINCIPAL_SECRET: SECRET,
  INTERNAL_SERVICE_SECRET: SECRET,
  LOAN_QUOTE_ASSET_ID: 'X',
  TRANSFER_BATCH_SIZE: '200',
  LOAN_SWEEP_BATCH_SIZE: '500',
};

/**
 * Load production env.ts the way the process does.
 *
 * `vi.resetModules` + explicit clears are load-bearing: env.ts calls
 * `loadEnv(process.env)` at import. A forked Zod slice would stay green if
 * production `.default(200)` / `.default(500)` returned.
 */
async function loadWith(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TRANSFER_BATCH_SIZE', undefined);
  vi.stubEnv('LOAN_SWEEP_BATCH_SIZE', undefined);
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    vi.stubEnv(key, value);
  }
  const module = await import('./env.js');
  return module.env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const TRANSFER_SHAPE =
  /TRANSFER_BATCH_SIZE:\s*z\.preprocess\(\s*\(v\) => \(v === undefined \|\| \(typeof v === 'string' && v\.trim\(\) === ''\) \? undefined : v\),\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(10_000\),\s*\)/;
const SWEEP_SHAPE =
  /LOAN_SWEEP_BATCH_SIZE:\s*z\.preprocess\(\s*\(v\) => \(v === undefined \|\| \(typeof v === 'string' && v\.trim\(\) === ''\) \? undefined : v\),\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(10_000\),\s*\)/;

describe('svc-bank TRANSFER_BATCH_SIZE refuse-closed', () => {
  it('env.ts keeps the refuse-closed shape production loadEnv parses', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).toMatch(TRANSFER_SHAPE);
    expect(envTs).not.toMatch(/TRANSFER_BATCH_SIZE:[\s\S]{0,400}\.default\(200\)/);
  });

  it('unset TRANSFER_BATCH_SIZE refuses (no invent 200)', async () => {
    await expect(loadWith({ TRANSFER_BATCH_SIZE: undefined })).rejects.toThrow(/TRANSFER_BATCH_SIZE/);
  });

  it('blank TRANSFER_BATCH_SIZE refuses (empty is not 0)', async () => {
    await expect(loadWith({ TRANSFER_BATCH_SIZE: '' })).rejects.toThrow(/TRANSFER_BATCH_SIZE/);
  });

  it('whitespace TRANSFER_BATCH_SIZE refuses', async () => {
    await expect(loadWith({ TRANSFER_BATCH_SIZE: '   ' })).rejects.toThrow(/TRANSFER_BATCH_SIZE/);
  });

  it('explicit 0 refuses (kill-switch is SCHEDULED_TRANSFERS_ENABLED)', async () => {
    await expect(loadWith({ TRANSFER_BATCH_SIZE: '0' })).rejects.toThrow(/TRANSFER_BATCH_SIZE/);
  });

  it('explicit 200 is owner-published (not invented)', async () => {
    const parsed = await loadWith({ TRANSFER_BATCH_SIZE: '200' });
    expect(parsed.TRANSFER_BATCH_SIZE).toBe(200);
  });
});

describe('svc-bank LOAN_SWEEP_BATCH_SIZE refuse-closed', () => {
  it('env.ts keeps the refuse-closed shape production loadEnv parses', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).toMatch(SWEEP_SHAPE);
    expect(envTs).not.toMatch(/LOAN_SWEEP_BATCH_SIZE:[\s\S]{0,400}\.default\(500\)/);
  });

  it('unset LOAN_SWEEP_BATCH_SIZE refuses (no invent 500)', async () => {
    await expect(loadWith({ LOAN_SWEEP_BATCH_SIZE: undefined })).rejects.toThrow(/LOAN_SWEEP_BATCH_SIZE/);
  });

  it('blank LOAN_SWEEP_BATCH_SIZE refuses (empty is not 0)', async () => {
    await expect(loadWith({ LOAN_SWEEP_BATCH_SIZE: '' })).rejects.toThrow(/LOAN_SWEEP_BATCH_SIZE/);
  });

  it('whitespace LOAN_SWEEP_BATCH_SIZE refuses', async () => {
    await expect(loadWith({ LOAN_SWEEP_BATCH_SIZE: '   ' })).rejects.toThrow(/LOAN_SWEEP_BATCH_SIZE/);
  });

  it('explicit 0 refuses (kill-switch is LOAN_RISK_SWEEP_ENABLED)', async () => {
    await expect(loadWith({ LOAN_SWEEP_BATCH_SIZE: '0' })).rejects.toThrow(/LOAN_SWEEP_BATCH_SIZE/);
  });

  it('explicit 500 is owner-published (not invented)', async () => {
    const parsed = await loadWith({ LOAN_SWEEP_BATCH_SIZE: '500' });
    expect(parsed.LOAN_SWEEP_BATCH_SIZE).toBe(500);
  });
});
