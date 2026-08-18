import { describe, expect, it } from 'vitest';
import { merchantKybMoneyGateRefusal, PAY_KYB_REQUIRED_CODE } from './merchant-kyb-money-gate.js';

describe('merchant KYB money gate (D26-P1-P10 Layer B)', () => {
  const base = {
    merchantId: '11111111-1111-4111-8111-111111111111',
    status: 'active',
  } as const;

  it('does not refuse none/pending under allow-sandbox (fixture path; no invent grantor)', () => {
    for (const kybStatus of ['none', 'pending'] as const) {
      expect(
        merchantKybMoneyGateRefusal({
          ...base,
          kybStatus,
          valueMovement: 'allow-sandbox',
        }),
        kybStatus,
      ).toBeNull();
    }
  });

  it('refuses rejected KYB under allow-sandbox — rejected cannot transact like approved', () => {
    const refuse = merchantKybMoneyGateRefusal({
      ...base,
      kybStatus: 'rejected',
      valueMovement: 'allow-sandbox',
    });
    expect(refuse).toMatchObject({
      code: PAY_KYB_REQUIRED_CODE,
      detail: { kybStatus: 'rejected' },
    });
  });

  it('refuses live-only when KYB is not approved — pay.kyb_required', () => {
    for (const kybStatus of ['none', 'pending', 'rejected'] as const) {
      const refuse = merchantKybMoneyGateRefusal({
        ...base,
        kybStatus,
        valueMovement: 'live-only',
      });
      expect(refuse, kybStatus).toMatchObject({
        code: PAY_KYB_REQUIRED_CODE,
        detail: { kybStatus },
      });
      expect(refuse?.message).toMatch(/approved KYB/);
    }
  });

  it('allows live-only when KYB is approved (still does not invent pay:* scopes)', () => {
    expect(
      merchantKybMoneyGateRefusal({
        ...base,
        kybStatus: 'approved',
        valueMovement: 'live-only',
      }),
    ).toBeNull();
  });
});
