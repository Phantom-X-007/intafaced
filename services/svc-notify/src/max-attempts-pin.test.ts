/**
 * Unit card — max delivery attempts is owner-published; blank refuses
 * 1. Promise: README NOTIFY_MAX_DELIVERY_ATTEMPTS blank is unpublished
 *    (never 3). Owner may set 3 explicitly.
 * 2. Break: invented 3 publishes a retry ceiling nobody set
 * 3. Done bar: unset/blank → undefined; explicit 3 allowed; 1–5
 * 4. Class N
 * 5. Paths: services/svc-notify/src/env.ts
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

describe('NOTIFY_MAX_DELIVERY_ATTEMPTS unpublished pin', () => {
  it('unset is unpublished — never 3', () => {
    const result = envSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_MAX_DELIVERY_ATTEMPTS).toBeUndefined();
  });

  it('blank is unpublished', () => {
    const result = envSchema.safeParse({ ...BASE, NOTIFY_MAX_DELIVERY_ATTEMPTS: '' });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_MAX_DELIVERY_ATTEMPTS).toBeUndefined();
  });

  it('owner-explicit 3 is allowed', () => {
    const result = envSchema.safeParse({ ...BASE, NOTIFY_MAX_DELIVERY_ATTEMPTS: '3' });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_MAX_DELIVERY_ATTEMPTS).toBe(3);
  });

  it('refuses a default outside 1–5', () => {
    expect(envSchema.safeParse({ ...BASE, NOTIFY_MAX_DELIVERY_ATTEMPTS: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ ...BASE, NOTIFY_MAX_DELIVERY_ATTEMPTS: '6' }).success).toBe(false);
  });
});
