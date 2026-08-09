/**
 * Unit card — VERIFY_TTL and GATEWAY_TIMEOUT defaults are product law
 * 1. Promise: README Environment — NOTIFY_VERIFY_TTL_MINUTES default 15;
 *    NOTIFY_GATEWAY_TIMEOUT_MS default 5000
 * 2. Break: longer TTL multiplies brute-force window on 6-digit codes;
 *    longer gateway budget collides with bus ack_wait / claim lease
 * 3. Done bar: schema defaults 15 and 5000; TTL 1–120; timeout 250–30000
 * 4. Class N
 * 5. Paths: services/svc-notify/**
 * 6. RED pin
 * 7. Collision: none (open PRs: none on wall)
 */

import { beforeAll, describe, expect, it } from 'vitest';

const BASE = {
  DATABASE_URL: 'postgres://svc_notify:svc_notify@localhost:5432/intafaced_notify_test',
  EDGE_PRINCIPAL_SECRET: 'e'.repeat(40),
  SERVICE_NAME: 'svc-notify',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let envSchema: any;

beforeAll(async () => {
  Object.assign(process.env, BASE);
  ({ envSchema } = await import('./env.js'));
});

describe('NOTIFY_VERIFY_TTL_MINUTES default pin', () => {
  it('defaults to 15 minutes when unset', () => {
    const result = envSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_VERIFY_TTL_MINUTES).toBe(15);
  });

  it('refuses outside 1–120', () => {
    expect(envSchema.safeParse({ ...BASE, NOTIFY_VERIFY_TTL_MINUTES: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, NOTIFY_VERIFY_TTL_MINUTES: '121' }).success).toBe(false);
  });
});

describe('NOTIFY_GATEWAY_TIMEOUT_MS default pin', () => {
  it('defaults to 5000 when unset', () => {
    const result = envSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_GATEWAY_TIMEOUT_MS).toBe(5_000);
  });

  it('refuses outside 250–30000', () => {
    expect(envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: '100' }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: '30001' }).success).toBe(false);
  });

  it('stays strictly under bus ack_wait (30s) at the default', () => {
    // Claim lease and redelivery math assume gateway budget << ack_wait.
    const result = envSchema.safeParse({ ...BASE });
    expect(result.data.NOTIFY_GATEWAY_TIMEOUT_MS).toBeLessThan(30_000);
  });
});
