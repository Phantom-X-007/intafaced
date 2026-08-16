/**
 * D26-P1-C2 public door — IFC pay / revenue share refuse unpublished rates by name.
 *
 * Unit files (ifc-pay.test.ts) prove the functions. This file crosses the
 * mounted tRPC caller so an operator path cannot return 200 + invented IFC
 * while ambassadors/** stays green.
 *
 * Break class: unset rates that still pay · invented bps on the public quote ·
 * mutation reject without academy.ambassador_*.rates_unset / invent_refused.
 *
 * Leverage: createAcademyRouter + createEdgeContext (Phase A S-ACADEMY).
 * No router.ts edit — doors already wired; this is the ambassadors proof.
 */
import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import type { AcademyService } from '../academy-service.js';
import { createAcademyRouter } from '../router.js';
import {
  ambassadorPayLooksPayable,
  ambassadorPayRefuseCodeFromUnknown,
  decidePublicAmbassadorPayQuote,
  unsetRatesPublicDoorHolds,
} from './ifc-pay.js';
import { UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW, UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW } from './ifc-pay-rate-law.js';

const SECRET = 'an-academy-ambassadors-public-door-edge-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const BENEFICIARY = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-academy' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['academy:read', 'academy:write', 'admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-amb-pay-door',
  });
}

function caller(payLaws?: Parameters<typeof createAcademyRouter>[1]) {
  return createAcademyRouter({} as AcademyService, payLaws).createCaller(signed());
}

describe('ambassador IFC public door — unpublished rates refuse by name (D26-P1-C2)', () => {
  it('ambassadorPayQuote refuses unset IFC without magnitudes', async () => {
    const quote = await caller().ambassadorPayQuote({ kind: 'ifc_pay' });
    expect(quote.code).toBe('academy.ambassador_pay.rates_unset');
    expect(unsetRatesPublicDoorHolds(quote)).toBe(true);
    expect(quote).not.toHaveProperty('shareOfFeeBps');
    expect(quote).not.toHaveProperty('sessionCredit');
    expect(JSON.stringify(quote)).not.toMatch(/bps/i);
  });

  it('ambassadorPayQuote refuses unset revenue share by name', async () => {
    const quote = await caller().ambassadorPayQuote({ kind: 'revenue_share' });
    expect(quote.code).toBe('academy.ambassador_revenue_share.rates_unset');
    expect(unsetRatesPublicDoorHolds(quote)).toBe(true);
    expect(quote).not.toHaveProperty('shareOfFeeBps');
  });

  it('residencyPayQuote refuses unset rates even when residency is accepted', async () => {
    const quote = await caller().residencyPayQuote({ residencyStatus: 'accepted' });
    expect(quote.code).toBe('academy.ambassador_pay.rates_unset');
    expect(quote.payable).toBe(false);
    expect(ambassadorPayLooksPayable(quote)).toBe(false);
  });

  it('ambassadorIfcPay mutation refuses unset — named code, not a pay', async () => {
    try {
      await caller().ambassadorIfcPay({ beneficiaryId: BENEFICIARY, dryRun: true });
      expect.fail('unset IFC pay must not resolve');
    } catch (err) {
      expect(ambassadorPayRefuseCodeFromUnknown(err)).toBe('academy.ambassador_pay.rates_unset');
      expect(JSON.stringify(err)).not.toMatch(/shareOfFeeBps/);
    }
  });

  it('ambassadorRevenueShare mutation refuses unset — named code', async () => {
    try {
      await caller().ambassadorRevenueShare({ beneficiaryId: BENEFICIARY, dryRun: true });
      expect.fail('unset revenue share must not resolve');
    } catch (err) {
      expect(ambassadorPayRefuseCodeFromUnknown(err)).toBe('academy.ambassador_revenue_share.rates_unset');
    }
  });

  it('per-call invented rates on the public quote door are invent_refused', () => {
    const q = decidePublicAmbassadorPayQuote({
      kind: 'ifc_pay',
      law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
      requestLaw: {
        published: true,
        sessionCredit: '99.00000000',
        asset: 'IFC',
        period: 'invented',
      },
    });
    expect(q.code).toBe('academy.ambassador_pay.invent_refused');
    expect(unsetRatesPublicDoorHolds(q)).toBe(true);
    expect(ambassadorPayLooksPayable(q)).toBe(false);
  });

  it('fails if an unset public quote were marked payable (invent IFC)', () => {
    const fakePay = {
      status: 'ok' as const,
      ok: true as const,
      payable: true as const,
      inventedIfc: false as const,
      kind: 'ifc_pay' as const,
      code: 'academy.ambassador_pay.rates_unset' as const,
      reason: 'unset' as const,
      rateAuthorityPublished: false,
      residual: 'leaked',
      message: 'would pay',
      shareOfFeeBps: 250,
    };
    expect(ambassadorPayLooksPayable(fakePay)).toBe(true);
    expect(unsetRatesPublicDoorHolds(fakePay as never)).toBe(false);
  });

  it('unpublished injected laws still refuse — never a default bps pay', async () => {
    const c = caller({
      ifcPayLaw: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
      revenueShareLaw: UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW,
    });
    const ifc = await c.ambassadorPayQuote({ kind: 'ifc_pay' });
    const share = await c.ambassadorPayQuote({ kind: 'revenue_share' });
    expect(ifc.code).toBe('academy.ambassador_pay.rates_unset');
    expect(share.code).toBe('academy.ambassador_revenue_share.rates_unset');
    expect(unsetRatesPublicDoorHolds(ifc)).toBe(true);
    expect(unsetRatesPublicDoorHolds(share)).toBe(true);
  });
});
