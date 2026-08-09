/**
 * Unit card — claim lease default stays under bus ack_wait AND covers attempt
 * 1. Promise: channel-store DEFAULT_CLAIM_LEASE_MS under 30s ack_wait;
 *    production `claimLeaseMsFromGatewayTimeout` never reaches ack_wait;
 *    every legal gateway timeout has lease ≥ timeout (one attempt covered)
 * 2. Break: lease ≥ ack_wait → redelivery always naks while holder lives;
 *    timeout×2 at a 30s env ceiling used to produce lease 25s < timeout
 *    → replica reclaim mid-POST → double free SMS
 * 3. Done bar: DEFAULT 15s; formula min(timeout×2, MAX_GATEWAY_TIMEOUT_MS);
 *    env max = MAX_GATEWAY_TIMEOUT_MS so lease always covers one attempt
 * 4. Class N
 */

import { describe, expect, it } from 'vitest';
import { BUS_ACK_WAIT_MS, claimLeaseMsFromGatewayTimeout, DEFAULT_CLAIM_LEASE_MS, MAX_GATEWAY_TIMEOUT_MS } from './channel-store.js';

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

  it('clamps when gateway timeout is raised toward the allowed ceiling', () => {
    // Without the clamp: MAX * 2 would meet or exceed ack_wait.
    expect(claimLeaseMsFromGatewayTimeout(MAX_GATEWAY_TIMEOUT_MS)).toBe(MAX_GATEWAY_TIMEOUT_MS);
    expect(claimLeaseMsFromGatewayTimeout(MAX_GATEWAY_TIMEOUT_MS)).toBeLessThan(BUS_ACK_WAIT_MS);
    expect(claimLeaseMsFromGatewayTimeout(20_000)).toBe(MAX_GATEWAY_TIMEOUT_MS);
  });

  it('every legal timeout gets a lease that outlasts one full attempt', () => {
    // The multi-replica double-send residual: env once allowed 30s while lease
    // capped at 25s. Cap and formula must stay paired.
    for (const timeout of [250, 5_000, 12_500, 20_000, MAX_GATEWAY_TIMEOUT_MS]) {
      const lease = claimLeaseMsFromGatewayTimeout(timeout);
      expect(lease).toBeGreaterThanOrEqual(timeout);
      expect(lease).toBeLessThan(BUS_ACK_WAIT_MS);
    }
  });

  it('MAX_GATEWAY_TIMEOUT_MS is the claim-lease ceiling, not bus ack_wait', () => {
    expect(MAX_GATEWAY_TIMEOUT_MS).toBe(25_000);
    expect(MAX_GATEWAY_TIMEOUT_MS).toBeLessThan(BUS_ACK_WAIT_MS);
  });
});
