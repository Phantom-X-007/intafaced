/**
 * Unit card — dispatch wiring refuses unpublished max delivery attempts (never invent 3)
 *
 * 1. Promise: blank / omitted attempts throws notify.max_delivery_attempts_unset
 *    before a claim. Owner-explicit 3 still publishes.
 * 2. Break: `?? 3` publishes a retry ceiling nobody set.
 * 3. Done bar: unset throws NotifyMaxDeliveryAttemptsUnsetError; 3 is allowed
 * 4. Class N
 * 5. Paths: services/svc-notify/src/max-delivery-attempts.ts
 */
import { describe, expect, it } from 'vitest';
import {
  NotifyMaxDeliveryAttemptsUnsetError,
  NOTIFY_MAX_DELIVERY_ATTEMPTS_UNSET,
  publishedMaxDeliveryAttempts,
} from './max-delivery-attempts.js';

describe('publishedMaxDeliveryAttempts', () => {
  it('refuses unset / blank / out of 1..5 — never 3', () => {
    expect(() => publishedMaxDeliveryAttempts(undefined)).toThrow(NotifyMaxDeliveryAttemptsUnsetError);
    expect(() => publishedMaxDeliveryAttempts(null)).toThrow(NotifyMaxDeliveryAttemptsUnsetError);
    expect(() => publishedMaxDeliveryAttempts(0)).toThrow(NotifyMaxDeliveryAttemptsUnsetError);
    expect(() => publishedMaxDeliveryAttempts(6)).toThrow(NotifyMaxDeliveryAttemptsUnsetError);
    expect(() => publishedMaxDeliveryAttempts(3.5)).toThrow(NotifyMaxDeliveryAttemptsUnsetError);
    try {
      publishedMaxDeliveryAttempts(undefined);
    } catch (err) {
      expect(err).toBeInstanceOf(NotifyMaxDeliveryAttemptsUnsetError);
      expect((err as NotifyMaxDeliveryAttemptsUnsetError).code).toBe(NOTIFY_MAX_DELIVERY_ATTEMPTS_UNSET);
    }
  });

  it('owner-explicit 3 is allowed', () => {
    expect(publishedMaxDeliveryAttempts(3)).toBe(3);
  });
});
