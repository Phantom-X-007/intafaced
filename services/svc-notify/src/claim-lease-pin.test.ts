/**
 * Unit card — claim lease default stays under bus ack_wait
 * 1. Promise: channel-store DEFAULT_CLAIM_LEASE_MS under 30s ack_wait;
 *    production `claimLeaseMsFromGatewayTimeout` never reaches ack_wait
 * 2. Break: lease ≥ ack_wait → redelivery always naks while holder lives;
 *    timeout×2 at the 30s ceiling used to produce a 60s lease
 * 3. Done bar: DEFAULT 15s; production formula min(timeout×2, ack_wait−slack)
 * 4. Class N
 */

import { describe, expect, it } from 'vitest';
import { BUS_ACK_WAIT_MS, CLAIM_LEASE_ACK_SLACK_MS, claimLeaseMsFromGatewayTimeout, DEFAULT_CLAIM_LEASE_MS } from './channel-store.js';

describe('delivery claim lease default pin', () => {
  it('defaults to 15s and stays strictly under bus ack_wait', () => {
    expect(DEFAULT_CLAIM_LEASE_MS).toBe(15_000);
    expect(DEFAULT_CLAIM_LEASE_MS).toBeLessThan(BUS_ACK_WAIT_MS);
  });

  it('production formula outlasts one default attempt and stays under ack_wait', () => {
    // Default gateway timeout is 5s → lease 10s.
    expect(claimLeaseMsFromGatewayTimeout(5_000)).toBe(10_000);
    expect(claimLeaseMsFromGatewayTimeout(5_000)).toBeLessThan(BUS_ACK_WAIT_MS);
  });

  it('clamps when gateway timeout is raised toward the 30s ceiling', () => {
    const ceiling = BUS_ACK_WAIT_MS - CLAIM_LEASE_ACK_SLACK_MS;
    // Without the clamp: 30_000 * 2 = 60_000 ≥ ack_wait.
    expect(claimLeaseMsFromGatewayTimeout(30_000)).toBe(ceiling);
    expect(claimLeaseMsFromGatewayTimeout(30_000)).toBeLessThan(BUS_ACK_WAIT_MS);
    expect(claimLeaseMsFromGatewayTimeout(20_000)).toBe(ceiling);
  });
});
