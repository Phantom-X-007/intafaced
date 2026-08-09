/**
 * Unit card — stuck-pending grace is bus maxDeliver × ack_wait
 * 1. Promise: channel-store STUCK_PENDING_GRACE_MS = 5 × 30_000 (README reaper arm 2)
 * 2. Break: shorter grace abandons while bus may still redeliver; longer leaves
 *    margin alerts reading "pending" after the bus has parked the message
 * 3. Done bar: STUCK_PENDING_GRACE_MS === 150_000
 * 4. Class N
 * 5. Paths: services/svc-notify/**
 * 6. RED pin
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { STUCK_PENDING_GRACE_MS } from './channel-store.js';

/** JetStream bus defaults — packages/events (maxDeliver 5, ack_wait 30s). */
const BUS_MAX_DELIVER = 5;
const BUS_ACK_WAIT_MS = 30_000;

describe('stuck-pending grace pin', () => {
  it('is bus maxDeliver × ack_wait (150s)', () => {
    expect(STUCK_PENDING_GRACE_MS).toBe(BUS_MAX_DELIVER * BUS_ACK_WAIT_MS);
    expect(STUCK_PENDING_GRACE_MS).toBe(150_000);
  });
});
