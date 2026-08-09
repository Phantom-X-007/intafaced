import { describe, expect, it } from 'vitest';
import { TargetRateLimiter } from './target-rate-limit.js';

describe('TargetRateLimiter', () => {
  it('allows up to max takes then refuses until the window slides', () => {
    const clock = { now: 1_000_000 };
    const limiter = new TargetRateLimiter({
      register: { max: 2, windowMs: 10_000 },
      verify: { max: 2, windowMs: 10_000 },
      now: () => clock.now,
    });

    expect(limiter.tryTake('u1', 'email', 'register')).toBe(true);
    expect(limiter.tryTake('u1', 'email', 'register')).toBe(true);
    expect(limiter.tryTake('u1', 'email', 'register')).toBe(false);

    // Different channel and different op are independent buckets.
    expect(limiter.tryTake('u1', 'sms', 'register')).toBe(true);
    expect(limiter.tryTake('u1', 'email', 'verify')).toBe(true);

    // Past the window the oldest hits drop.
    clock.now += 10_001;
    expect(limiter.tryTake('u1', 'email', 'register')).toBe(true);
  });

  it('keys per user — one user cannot spend another’s budget', () => {
    const limiter = new TargetRateLimiter({
      register: { max: 1, windowMs: 60_000 },
      verify: { max: 1, windowMs: 60_000 },
    });
    expect(limiter.tryTake('u1', 'email', 'register')).toBe(true);
    expect(limiter.tryTake('u1', 'email', 'register')).toBe(false);
    expect(limiter.tryTake('u2', 'email', 'register')).toBe(true);
  });
});
