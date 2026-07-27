import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv, redactEnv, serviceEnvSchema, authEnvSchema } from './env.js';

const validServiceEnv = {
  SERVICE_NAME: 'svc-ledger',
  DATABASE_URL: 'postgres://svc_ledger:svc_ledger@localhost:5432/intafaced',
};

describe('loadEnv', () => {
  it('applies defaults for everything not supplied', () => {
    const env = loadEnv(serviceEnvSchema, validServiceEnv);
    expect(env.APP_ENV).toBe('dev');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.NATS_URL).toBe('nats://localhost:4222');
    expect(env.HTTP_PORT).toBe(3000);
  });

  it('coerces numeric and boolean strings', () => {
    const env = loadEnv(serviceEnvSchema, { ...validServiceEnv, HTTP_PORT: '8080', DATABASE_SSL: 'true' });
    expect(env.HTTP_PORT).toBe(8080);
    expect(env.DATABASE_SSL).toBe(true);
  });

  it('reports every problem in one throw', () => {
    try {
      loadEnv(serviceEnvSchema, { SERVICE_NAME: 'svc-x', DATABASE_URL: 'not-a-url', HTTP_PORT: '99999' });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const issues = (e as EnvError).issues;
      expect(issues.some((i) => i.startsWith('DATABASE_URL'))).toBe(true);
      expect(issues.some((i) => i.startsWith('HTTP_PORT'))).toBe(true);
    }
  });

  it('refuses a weak JWT signing key', () => {
    expect(() => loadEnv(authEnvSchema, { JWT_ACCESS_SECRET: 'short' })).toThrow(EnvError);
    expect(() => loadEnv(authEnvSchema, { JWT_ACCESS_SECRET: 'a'.repeat(32) })).not.toThrow();
  });
});

describe('redactEnv', () => {
  it('hides secrets, connection strings and keys', () => {
    const out = redactEnv({
      SERVICE_NAME: 'svc-ledger',
      DATABASE_URL: 'postgres://user:pw@host/db',
      JWT_ACCESS_SECRET: 'super-secret',
      ISSUER_API_KEY: 'k-123',
      HTTP_PORT: 3000,
    });
    expect(out.SERVICE_NAME).toBe('svc-ledger');
    expect(out.HTTP_PORT).toBe(3000);
    expect(out.DATABASE_URL).toBe('«redacted»');
    expect(out.JWT_ACCESS_SECRET).toBe('«redacted»');
    expect(out.ISSUER_API_KEY).toBe('«redacted»');
  });
});
