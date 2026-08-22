import { describe, expect, it } from 'vitest';
import { futuresLadderPolicyGate, TRADE_FUTURES_LADDER_POLICY_ENV } from './futures-ladder-owner-gate.js';

const SAMPLE = JSON.stringify({
  tiers: [
    { uptoDepthBps: 10_000, maintenanceBps: 500 },
    { uptoDepthBps: Number.MAX_SAFE_INTEGER, maintenanceBps: 1_000 },
  ],
  marginCallBps: 11_000,
  targetBps: 12_000,
  maxTrancheBps: 2_500,
});

describe('futures ladder owner policy gate', () => {
  it('refuses when env is unset', () => {
    expect(futuresLadderPolicyGate({})).toMatchObject({ configured: false, reason: 'ladder_unset' });
  });

  it('parses owner ladder JSON without inventing defaults', () => {
    const gate = futuresLadderPolicyGate({ [TRADE_FUTURES_LADDER_POLICY_ENV]: SAMPLE });
    expect(gate.configured).toBe(true);
  });
});
