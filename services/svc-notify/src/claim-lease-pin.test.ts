/**
 * Unit card — claim lease default stays under bus ack_wait
 * 1. Promise: channel-store DEFAULT_CLAIM_LEASE_MS under 30s ack_wait
 * 2. Break: lease ≥ ack_wait → redelivery always naks while holder lives
 * 3. Done bar: DEFAULT_CLAIM_LEASE_MS === 15_000 and < 30_000
 * 4. Class N
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CLAIM_LEASE_MS } from './channel-store.js';

/** JetStream bus ack_wait — packages/events jetstream-bus (documented in channel-store). */
const BUS_ACK_WAIT_MS = 30_000;

describe('delivery claim lease default pin', () => {
  it('defaults to 15s and stays strictly under bus ack_wait', () => {
    expect(DEFAULT_CLAIM_LEASE_MS).toBe(15_000);
    expect(DEFAULT_CLAIM_LEASE_MS).toBeLessThan(BUS_ACK_WAIT_MS);
  });
});
