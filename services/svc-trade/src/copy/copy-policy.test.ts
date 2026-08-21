import { describe, expect, it } from 'vitest';
import { COPY_LAW_RESIDUAL } from './errors.js';
import { describeCopyPolicy } from './copy-policy.js';

describe('describeCopyPolicy', () => {
  it('states sovereign copy honesty without inventing §8 rates', () => {
    const p = describeCopyPolicy();
    expect(p.sovereignShape).toBe('sovereign');
    expect(p.pnlFeeForbidden).toBe(true);
    expect(p.rankingForbidden).toBe(true);
    expect(p.lawResidual).toBe(COPY_LAW_RESIDUAL);
    expect(p.inventsLeaderShareBps).toBe(false);
    expect(p.moneyViaLedgerClientOnly).toBe(true);
  });
});
