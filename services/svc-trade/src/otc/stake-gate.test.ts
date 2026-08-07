import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { assertOtcStakeGate, otcStakeGate } from './stake-gate.js';
import { OtcError } from './errors.js';

describe('otcStakeGate', () => {
  it('ok when stake >= min', () => {
    const r = otcStakeGate({ stake: parseAmount('1000'), minStake: parseAmount('1000') });
    expect(r.status).toBe('ok');
  });

  it('refuse below min — never invent pass', () => {
    const r = otcStakeGate({ stake: parseAmount('999'), minStake: parseAmount('1000') });
    expect(r.status).toBe('refuse');
    expect(() => assertOtcStakeGate(r)).toThrow(OtcError);
  });
});
