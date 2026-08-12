import { describe, expect, it } from 'vitest';
import { SESSION_SCOPES, WITHHELD_FROM_SESSION } from './scopes.js';
import {
  MERCHANT_PAY_SCOPE_GRANT_RESIDUAL,
  MERCHANT_PAY_SCOPES,
  MerchantPayScopeGrantError,
  assertMerchantPayScopeGrantAllowed,
  isMerchantPayScope,
} from './merchant-pay-scope-grant.js';

describe('merchant pay scope grant shape (D26-P0-08)', () => {
  it('keeps all four pay:* scopes out of ordinary sessions', () => {
    for (const scope of MERCHANT_PAY_SCOPES) {
      expect(SESSION_SCOPES).not.toContain(scope);
      expect(WITHHELD_FROM_SESSION[scope]).toMatch(/merchant/i);
    }
  });

  it('refuses grant when law is unpublished — including kybStatus approved', () => {
    expect(() =>
      assertMerchantPayScopeGrantAllowed({
        merchantId: '11111111-1111-4111-8111-111111111111',
        scopes: ['pay:write'],
        kybStatus: 'approved',
        actorUserId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow(MerchantPayScopeGrantError);

    try {
      assertMerchantPayScopeGrantAllowed({
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
      expect(MERCHANT_PAY_SCOPE_GRANT_RESIDUAL).toContain('DIRECTION §8');
      expect(MERCHANT_PAY_SCOPE_GRANT_RESIDUAL).toMatch(/never invent/i);
    }
  });

  it('refuses unknown or empty scope lists without inventing a grant', () => {
    expect(() =>
      assertMerchantPayScopeGrantAllowed({
        merchantId: '11111111-1111-4111-8111-111111111111',
        scopes: [],
      }),
    ).toThrow(/at least one/);

    expect(() =>
      assertMerchantPayScopeGrantAllowed({
        merchantId: '11111111-1111-4111-8111-111111111111',
        scopes: ['trade:write'],
      }),
    ).toThrow(/not a merchant acquiring/);
  });

  it('identifies merchant pay scopes', () => {
    expect(isMerchantPayScope('pay:write')).toBe(true);
    expect(isMerchantPayScope('trade:write')).toBe(false);
  });
});
