import { describe, expect, it } from 'vitest';
import { decideSponsorship } from './paymaster-policy.js';

describe('paymaster sponsorship policy (S-A10)', () => {
  const policy = {
    allowlist: new Set(['0xabc0000000000000000000000000000000000001']),
    permittedSelectors: new Set(['0x12345678']),
    maxGasPerUserOp: 500_000n,
    fundingConfigured: true,
  };

  it('allows an allowlisted sender under gas cap', () => {
    expect(
      decideSponsorship(policy, {
        sender: '0xAbC0000000000000000000000000000000000001',
        callSelector: '0x12345678',
        gasLimit: 100_000n,
      }),
    ).toEqual({ allow: true, maxGas: 500_000n });
  });

  it('refuses when funding is not configured (Nitro half)', () => {
    expect(
      decideSponsorship(
        { ...policy, fundingConfigured: false },
        { sender: '0xabc0000000000000000000000000000000000001', callSelector: '0x12345678', gasLimit: 1n },
      ),
    ).toEqual({ allow: false, reason: 'funding_unconfigured' });
  });

  it('refuses abuse — unknown selector', () => {
    expect(
      decideSponsorship(policy, {
        sender: '0xabc0000000000000000000000000000000000001',
        callSelector: '0xdeadbeef',
        gasLimit: 1n,
      }),
    ).toEqual({ allow: false, reason: 'op_not_permitted' });
  });
});
