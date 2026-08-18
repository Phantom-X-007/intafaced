import { describe, expect, it } from 'vitest';
import {
  MERCHANT_PAY_SCOPE_GRANT_RESIDUAL,
  MerchantPayScopeGrantError,
  assertMerchantPayGrantPathAllowed,
  issueMerchantPayScopesViaGrantPath,
} from './merchant-pay-grant-path.js';

describe('merchant pay grant path call site (D26-P1-P10 Layer A)', () => {
  it('surfaces refuse-closed grant — approved KYB does not invent pay:write', () => {
    expect(() =>
      issueMerchantPayScopesViaGrantPath({
        merchantId: '11111111-1111-4111-8111-111111111111',
        scopes: ['pay:write'],
        kybStatus: 'approved',
        actorUserId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow(MerchantPayScopeGrantError);

    try {
      assertMerchantPayGrantPathAllowed({
        merchantId: '11111111-1111-4111-8111-111111111111',
        scopes: ['pay:read', 'pay:write'],
        kybStatus: 'approved',
      });
      expect.unreachable('must refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(MerchantPayScopeGrantError);
      const e = err as MerchantPayScopeGrantError;
      expect(e.code).toBe('auth.merchant_pay_scope_grant_unpublished');
      expect(e.residual).toBe(MERCHANT_PAY_SCOPE_GRANT_RESIDUAL);
    }
  });
});
