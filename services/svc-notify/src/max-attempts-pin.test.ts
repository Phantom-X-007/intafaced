/**
 * Unit card — max delivery attempts default is 3 (at or below bus maxDeliver 5)
 * 1. Promise: README NOTIFY_MAX_DELIVERY_ATTEMPTS default 3
 * 2. Break: default 5 burns bus budget; default 1 abandons too early
 * 3. Done bar: schema default === 3; min 1 max 5
 * 4. Class N
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

describe('NOTIFY_MAX_DELIVERY_ATTEMPTS default pin', () => {
  it('defaults to 3 when unset', () => {
    const result = envSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_MAX_DELIVERY_ATTEMPTS).toBe(3);
  });

  it('refuses a default outside 1–5', () => {
    expect(envSchema.safeParse({ ...BASE, NOTIFY_MAX_DELIVERY_ATTEMPTS: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, NOTIFY_MAX_DELIVERY_ATTEMPTS: '6' }).success).toBe(false);
  });
});
