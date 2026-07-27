import { describe, expect, it } from 'vitest';
import { drizzleConfig, MIGRATION_CONVENTION } from './migrate.js';
import { isSerializationFailure } from './connection.js';

describe('drizzleConfig', () => {
  it('confines a service to its own Postgres schema', () => {
    const config = drizzleConfig({ schema: 'ledger' });
    expect(config.schemaFilter).toEqual(['ledger']);
    expect(config.dialect).toBe('postgresql');
  });

  it('defaults to the service role rather than a superuser', () => {
    const config = drizzleConfig({ schema: 'trade', url: undefined });
    const url = (config.dbCredentials as { url: string }).url;
    // Only meaningful when DATABASE_URL is unset, which is the case in CI.
    if (!process.env.DATABASE_URL) {
      expect(url).toContain('svc_trade');
    }
  });

  it('lets a service override paths without touching schema isolation', () => {
    const config = drizzleConfig({ schema: 'pay', schemaPath: './src/db/tables.ts', out: './migrations' });
    expect(config.schema).toBe('./src/db/tables.ts');
    expect(config.out).toBe('./migrations');
    expect(config.schemaFilter).toEqual(['pay']);
  });

  it('declares the reversible-migration convention CI checks for', () => {
    expect(MIGRATION_CONVENTION.downSuffix).toBe('.down.sql');
  });
});

describe('serialization failures', () => {
  it('recognises the codes worth retrying', () => {
    expect(isSerializationFailure({ code: '40001' })).toBe(true); // serialization_failure
    expect(isSerializationFailure({ code: '40P01' })).toBe(true); // deadlock_detected
  });

  it('does not retry a genuine constraint violation', () => {
    expect(isSerializationFailure({ code: '23505' })).toBe(false); // unique_violation
    expect(isSerializationFailure({ code: '23514' })).toBe(false); // check_violation
    expect(isSerializationFailure(new Error('boom'))).toBe(false);
    expect(isSerializationFailure(null)).toBe(false);
    expect(isSerializationFailure(undefined)).toBe(false);
  });
});
