/**
 * Unit card — config DATABASE_POOL_MAX unset refuse (no invented 10)
 *
 * 1. Promise: unset / blank DATABASE_POOL_MAX refuses boot (never invent 10).
 *    Owner-explicit 10 is a published pool size.
 * 2. Break: env.ts `.default(10)` / compose `:-10` makes a blank host env look
 *    published as a pool size nobody chose. Empty string must not coerce to 0
 *    (0 is not a legal pool).
 * 3. Done bar: production postgresEnvSchema via loadEnv (not a forked slice)
 *    refuses unset, blank, whitespace, and 0; explicit 10 parses; source has
 *    no `.default(10)`.
 * 4. Class N
 * 5. Paths: env.ts postgresEnvSchema via loadEnv (same schema services merge)
 * 6. RED: git-default 10 returns, or unset/blank parses as 10 or 0
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv, postgresEnvSchema, serviceEnvSchema } from './env.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const BASE_PG = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  DATABASE_POOL_MAX: '10',
};

const POOL_SHAPE =
  /DATABASE_POOL_MAX:\s*z\.preprocess\(\s*\(v\) => \(v === undefined \|\| \(typeof v === 'string' && v\.trim\(\) === ''\) \? undefined : v\),\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\),\s*\)/;

describe('config DATABASE_POOL_MAX refuse-closed', () => {
  it('env.ts keeps the refuse-closed shape production loadEnv parses', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).toMatch(POOL_SHAPE);
    expect(envTs).not.toMatch(/DATABASE_POOL_MAX:[\s\S]{0,400}\.default\(10\)/);
  });

  it('unset DATABASE_POOL_MAX refuses (no invent 10)', () => {
    try {
      loadEnv(postgresEnvSchema, { DATABASE_URL: BASE_PG.DATABASE_URL });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).issues.some((i) => i.startsWith('DATABASE_POOL_MAX'))).toBe(true);
    }
  });

  it('blank DATABASE_POOL_MAX refuses (empty is not 0)', () => {
    expect(() => loadEnv(postgresEnvSchema, { ...BASE_PG, DATABASE_POOL_MAX: '' })).toThrow(EnvError);
  });

  it('whitespace DATABASE_POOL_MAX refuses', () => {
    expect(() => loadEnv(postgresEnvSchema, { ...BASE_PG, DATABASE_POOL_MAX: '   ' })).toThrow(EnvError);
  });

  it('explicit 0 refuses (0 is not a legal pool)', () => {
    expect(() => loadEnv(postgresEnvSchema, { ...BASE_PG, DATABASE_POOL_MAX: '0' })).toThrow(EnvError);
  });

  it('explicit 10 is owner-published (not invented)', () => {
    const parsed = loadEnv(postgresEnvSchema, BASE_PG);
    expect(parsed.DATABASE_POOL_MAX).toBe(10);
  });

  it('serviceEnvSchema merge also refuses unset pool (boot path)', () => {
    try {
      loadEnv(serviceEnvSchema, {
        SERVICE_NAME: 'svc-ledger',
        DATABASE_URL: BASE_PG.DATABASE_URL,
      });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).issues.some((i) => i.startsWith('DATABASE_POOL_MAX'))).toBe(true);
    }
  });
});
