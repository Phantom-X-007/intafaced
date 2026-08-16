import { describe, expect, it, vi } from 'vitest';
import { payout, proposePay } from './pay.js';

describe('svc-academy ambassadors/pay consumer', () => {
  it('unset env refuses without posting', async () => {
    const post = vi.fn();
    const proposed = proposePay({ kind: 'fee_share', ambassadorUserId: 'amb-1' }, { env: {}, ledger: { post } });
    expect(proposed.code).toBe('academy.ambassador_rate_unset');
    expect(proposed.ledgerPosted).toBe(false);
    const live = await payout({ kind: 'ifc_pay', ambassadorUserId: 'amb-1' }, { env: {}, ledger: { post } });
    expect(live.code).toBe('academy.ambassador_rate_unset');
    expect(post).not.toHaveBeenCalled();
  });

  it('does not invent 0 bps as free when env is missing', () => {
    const result = proposePay({ kind: 'fee_share', ambassadorUserId: 'amb-1' }, { env: {} });
    expect(result.ownerShareBps).toBeNull();
    expect(result.ok).toBe(false);
  });
});
