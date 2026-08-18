import { describe, expect, it } from 'vitest';
import { FORBIDDEN_SERVICE_CREDENTIALS, SVC_WS_OWN_ENV_KEYS } from './env.js';

/**
 * Credential-isolation pin for svc-ws.
 *
 * This process accepts anonymous public sockets. Holding S2S / principal /
 * database secrets would collapse the blast-radius argument in the README.
 * Optional `JWT_ACCESS_SECRET` is deliberate and only for `/private/stream`.
 */
describe('svc-ws credential isolation', () => {
  it('documents the forbidden service credentials contract', () => {
    expect([...FORBIDDEN_SERVICE_CREDENTIALS]).toEqual(['INTERNAL_SERVICE_SECRET', 'EDGE_PRINCIPAL_SECRET', 'DATABASE_URL']);
  });

  it('does not declare forbidden credentials on the svc-ws own env shape', () => {
    const own = new Set<string>(SVC_WS_OWN_ENV_KEYS);
    for (const key of FORBIDDEN_SERVICE_CREDENTIALS) {
      expect(own.has(key)).toBe(false);
    }
  });

  it('loads without forbidden keys present in process.env (schema does not require them)', async () => {
    // env.ts already loadEnv'd at import with whatever process.env has.
    // Assert the exported env object never grew those fields even if they were set.
    const { env } = await import('./env.js');
    for (const key of FORBIDDEN_SERVICE_CREDENTIALS) {
      expect(Object.prototype.hasOwnProperty.call(env, key)).toBe(false);
    }
    // Optional private-stream secret may or may not be set; public path must still exist.
    expect(typeof env.MATCHING_URL).toBe('string');
    expect(typeof env.TRADE_URL).toBe('string');
  });
});
