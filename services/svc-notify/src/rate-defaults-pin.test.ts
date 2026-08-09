/**
 * Unit card — register/verify rate defaults are product law
 * 1. Promise: README 3 registers / 10 verifies per 15 minutes
 * 2. Break: casual raise of max silently multiplies SMS bill
 * 3. Done bar: DEFAULT_REGISTER_LIMIT.max===3; VERIFY===10; window 15m
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED pin
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_REGISTER_LIMIT, DEFAULT_VERIFY_LIMIT } from './target-rate-limit.js';

describe('register/verify rate defaults — product law pin', () => {
  it('caps registers at 3 per 15 minutes', () => {
    expect(DEFAULT_REGISTER_LIMIT.max).toBe(3);
    expect(DEFAULT_REGISTER_LIMIT.windowMs).toBe(15 * 60_000);
  });

  it('caps verifies at 10 per 15 minutes', () => {
    expect(DEFAULT_VERIFY_LIMIT.max).toBe(10);
    expect(DEFAULT_VERIFY_LIMIT.windowMs).toBe(15 * 60_000);
  });
});
