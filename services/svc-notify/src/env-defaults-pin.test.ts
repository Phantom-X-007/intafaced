/**
 * Unit card — VERIFY_TTL is owner-published; GATEWAY_TIMEOUT default is product law
 * 1. Promise: README Environment — NOTIFY_VERIFY_TTL_MINUTES blank is unpublished
 *    (never 15); NOTIFY_GATEWAY_TIMEOUT_MS default 5000
 * 2. Break: invented 15 multiplies a brute-force window nobody published;
 *    longer gateway budget collides with bus ack_wait / claim lease
 * 3. Done bar: TTL unset/blank → undefined; explicit 15 allowed; 1–120;
 *    timeout schema defaults 5000; timeout 250–25000
 *    (max = claim-lease ceiling so lease always covers one attempt)
 * 4. Class N
 * 5. Paths: services/svc-notify/**
 * 6. RED pin
 * 7. Collision: none (open PRs: none on wall)
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_GATEWAY_TIMEOUT_MS, claimLeaseMsFromGatewayTimeout } from './channel-store.js';

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

describe('NOTIFY_VERIFY_TTL_MINUTES unpublished pin', () => {
  it('unset is unpublished — never 15', () => {
    const result = envSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_VERIFY_TTL_MINUTES).toBeUndefined();
  });

  it('blank is unpublished', () => {
    const result = envSchema.safeParse({ ...BASE, NOTIFY_VERIFY_TTL_MINUTES: '' });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_VERIFY_TTL_MINUTES).toBeUndefined();
  });

  it('owner-explicit 15 is allowed', () => {
    const result = envSchema.safeParse({ ...BASE, NOTIFY_VERIFY_TTL_MINUTES: '15' });
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

  it('refuses outside 250–MAX_GATEWAY_TIMEOUT_MS (not bus ack_wait)', () => {
    expect(envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: '100' }).success).toBe(false);
    // 30s used to be legal and produced lease 25s < timeout — multi-replica double-send.
    expect(envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: '30000' }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: String(MAX_GATEWAY_TIMEOUT_MS + 1) }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: String(MAX_GATEWAY_TIMEOUT_MS) }).success).toBe(true);
  });

  it('stays at or under the claim-lease ceiling so one attempt is always covered', () => {
    const result = envSchema.safeParse({ ...BASE, NOTIFY_GATEWAY_TIMEOUT_MS: String(MAX_GATEWAY_TIMEOUT_MS) });
    expect(result.success).toBe(true);
    const timeout = result.data.NOTIFY_GATEWAY_TIMEOUT_MS as number;
    expect(timeout).toBeLessThanOrEqual(MAX_GATEWAY_TIMEOUT_MS);
    expect(claimLeaseMsFromGatewayTimeout(timeout)).toBeGreaterThanOrEqual(timeout);
  });
});
