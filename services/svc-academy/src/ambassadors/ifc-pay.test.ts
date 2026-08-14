import { describe, expect, it } from 'vitest';
import {
  AMBASSADOR_IFC_PAY_RECIPE_RESIDUAL,
  AMBASSADOR_IFC_PAY_RESIDUAL,
  AMBASSADOR_REVENUE_SHARE_RESIDUAL,
  AMBASSADOR_RESIDENCY_GATE_RESIDUAL,
  AmbassadorPayRefuseError,
  ambassadorPayPlaneIsDark,
  ambassadorPayPlaneStatus,
  ambassadorPayRefuseExportHeader,
  ambassadorPayRefuseExportLine,
  ambassadorPayResidualIsHonest,
  ambassadorPayStatusLine,
  attemptAmbassadorPay,
  attemptResidencyIfcPay,
  ambassadorPayLooksPayable,
  decidePublicAmbassadorPayQuote,
  decidePublicResidencyPayQuote,
  refuseAmbassadorIfcPay,
  refuseAmbassadorPayAttempt,
  refuseAmbassadorRevenueShare,
  tryRefuseAmbassadorPay,
} from './ifc-pay.js';
import {
  AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
  parseAmbassadorIfcPayLawJson,
  UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
  UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW,
} from './ifc-pay-rate-law.js';

const BENEFICIARY = '11111111-1111-4111-8111-111111111111';

const publishedIfc = parseAmbassadorIfcPayLawJson(
  JSON.stringify({ published: true, sessionCredit: '10.00000000', asset: 'IFC', period: 'session' }),
);

const publishedShare = {
  published: true as const,
  shareOfFeeBps: 250,
  feeBasis: 'lobby_host_fees',
};

describe('ambassador IFC pay / revenue share — Class M refuse-closed', () => {
  it('refuses IFC pay without inventing rates', () => {
    expect(() => refuseAmbassadorIfcPay()).toThrow(AmbassadorPayRefuseError);
    try {
      refuseAmbassadorIfcPay();
    } catch (err) {
      expect(err).toBeInstanceOf(AmbassadorPayRefuseError);
      const e = err as AmbassadorPayRefuseError;
      expect(e.code).toBe('academy.ambassador_pay.rates_unset');
      expect(e.kind).toBe('ifc_pay');
      expect(e.residual).toBe(AMBASSADOR_IFC_PAY_RESIDUAL);
      expect(ambassadorPayResidualIsHonest(e.residual)).toBe(true);
      expect(JSON.stringify(e)).not.toMatch(/\d+\.\d+/);
    }
  });

  it('refuses revenue share without inventing fee %', () => {
    expect(() => refuseAmbassadorRevenueShare()).toThrow(AmbassadorPayRefuseError);
    try {
      refuseAmbassadorRevenueShare();
    } catch (err) {
      const e = err as AmbassadorPayRefuseError;
      expect(e.code).toBe('academy.ambassador_revenue_share.rates_unset');
      expect(e.kind).toBe('revenue_share');
      expect(e.residual).toBe(AMBASSADOR_REVENUE_SHARE_RESIDUAL);
      expect(ambassadorPayResidualIsHonest(e.residual)).toBe(true);
    }
  });

  it('legacy dry-run without law also refuses — no invented simulation amounts', () => {
    expect(() => refuseAmbassadorPayAttempt({ kind: 'ifc_pay', dryRun: true })).toThrow(AmbassadorPayRefuseError);
    expect(() => refuseAmbassadorPayAttempt({ kind: 'revenue_share', dryRun: true })).toThrow(AmbassadorPayRefuseError);
  });

  it('pay plane status is dark for settlement (never invent settlement enabled)', () => {
    const s = ambassadorPayPlaneStatus();
    expect(s.ifcPayEnabled).toBe(false);
    expect(s.revenueShareEnabled).toBe(false);
    expect(s.ifcRateAuthorityPublished).toBe(false);
    expect(s.ifcPayQuoteEnabled).toBe(false);
    expect(s.classM).toBe(true);
    expect(ambassadorPayPlaneIsDark(s)).toBe(true);
    expect(ambassadorPayStatusLine(s)).toBe('ifcPay=0 revenueShare=0 ifcAuth=0 shareAuth=0 classM=1');
  });

  it('tryRefuse returns result shape without amounts', () => {
    const r = tryRefuseAmbassadorPay('ifc_pay');
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('ifc_pay');
    expect(r.code).toBe('academy.ambassador_pay.rates_unset');
    expect(ambassadorPayRefuseExportHeader()).toBe('kind,code');
    expect(ambassadorPayRefuseExportLine(r)).toBe('ifc_pay,academy.ambassador_pay.rates_unset');
    expect(Object.keys(r).sort()).toEqual(['code', 'kind', 'message', 'ok', 'residual']);
  });

  it('residuals name Class M / DIRECTION + no invent', () => {
    expect(ambassadorPayResidualIsHonest(AMBASSADOR_IFC_PAY_RESIDUAL)).toBe(true);
    expect(ambassadorPayResidualIsHonest(AMBASSADOR_REVENUE_SHARE_RESIDUAL)).toBe(true);
    expect(ambassadorPayResidualIsHonest(AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL)).toBe(true);
    expect(ambassadorPayResidualIsHonest('ok to pay')).toBe(false);
  });
});

describe('ambassador pay under rate authority — product path (D26-P1-C2)', () => {
  it('unpublished law → rates_unset on attempt', () => {
    expect(() =>
      attemptAmbassadorPay({
        kind: 'ifc_pay',
        law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
        beneficiaryId: BENEFICIARY,
        dryRun: true,
      }),
    ).toThrow(AmbassadorPayRefuseError);
    try {
      attemptAmbassadorPay({
        kind: 'ifc_pay',
        law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
        beneficiaryId: BENEFICIARY,
        dryRun: true,
      });
    } catch (err) {
      const e = err as AmbassadorPayRefuseError;
      expect(e.code).toBe('academy.ambassador_pay.rates_unset');
      expect(e.residual).toBe(AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL);
    }
  });

  it('published IFC law + dryRun → quote from authority only', () => {
    const quote = attemptAmbassadorPay({
      kind: 'ifc_pay',
      law: publishedIfc,
      beneficiaryId: BENEFICIARY,
      dryRun: true,
      residencyStatus: 'accepted',
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok || quote.kind !== 'ifc_pay') throw new Error('expected ifc quote');
    expect(quote.sessionCredit).toBe('10.00000000');
    expect(quote.asset).toBe('IFC');
    expect(quote.authority).toBe('owner_published');
    expect(quote.settlement).toBe('refuse_recipe_unset');
  });

  it('published IFC law + live settle → recipe_unset (no invent settlement)', () => {
    expect(() =>
      attemptAmbassadorPay({
        kind: 'ifc_pay',
        law: publishedIfc,
        beneficiaryId: BENEFICIARY,
        dryRun: false,
        residencyStatus: 'accepted',
      }),
    ).toThrow(AmbassadorPayRefuseError);
    try {
      attemptAmbassadorPay({
        kind: 'ifc_pay',
        law: publishedIfc,
        beneficiaryId: BENEFICIARY,
        dryRun: false,
      });
    } catch (err) {
      const e = err as AmbassadorPayRefuseError;
      expect(e.code).toBe('academy.ambassador_pay.recipe_unset');
      expect(e.residual).toBe(AMBASSADOR_IFC_PAY_RECIPE_RESIDUAL);
    }
  });

  it('published revenue-share + dryRun → quote; plane shows authority', () => {
    const quote = attemptAmbassadorPay({
      kind: 'revenue_share',
      law: publishedShare,
      beneficiaryId: BENEFICIARY,
      dryRun: true,
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok || quote.kind !== 'revenue_share') throw new Error('expected share quote');
    expect(quote.shareOfFeeBps).toBe(250);
    expect(quote.feeBasis).toBe('lobby_host_fees');

    const plane = ambassadorPayPlaneStatus({ ifc: publishedIfc, revenueShare: publishedShare });
    expect(plane.ifcRateAuthorityPublished).toBe(true);
    expect(plane.revenueShareRateAuthorityPublished).toBe(true);
    expect(plane.ifcPayQuoteEnabled).toBe(true);
    expect(plane.ifcPayEnabled).toBe(false);
    expect(ambassadorPayPlaneIsDark(plane)).toBe(true);
    expect(ambassadorPayStatusLine(plane)).toBe('ifcPay=0 revenueShare=0 ifcAuth=1 shareAuth=1 classM=1');
  });

  it('residency gate: applied/rejected refuse; accepted quotes', () => {
    expect(() =>
      attemptResidencyIfcPay({
        law: publishedIfc,
        beneficiaryId: BENEFICIARY,
        residencyStatus: 'applied',
        dryRun: true,
      }),
    ).toThrow(AmbassadorPayRefuseError);
    try {
      attemptResidencyIfcPay({
        law: publishedIfc,
        beneficiaryId: BENEFICIARY,
        residencyStatus: 'rejected',
      });
    } catch (err) {
      const e = err as AmbassadorPayRefuseError;
      expect(e.code).toBe('academy.ambassador_pay.residency_not_accepted');
      expect(e.residual).toBe(AMBASSADOR_RESIDENCY_GATE_RESIDUAL);
    }

    const quote = attemptResidencyIfcPay({
      law: publishedIfc,
      beneficiaryId: BENEFICIARY,
      residencyStatus: 'accepted',
    });
    expect(quote.ok).toBe(true);
    expect(quote.residencyStatus).toBe('accepted');
    expect(quote.sessionCredit).toBe('10.00000000');
  });

  it('unpublished share law refuses even on dryRun', () => {
    expect(() =>
      attemptAmbassadorPay({
        kind: 'revenue_share',
        law: UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW,
        beneficiaryId: BENEFICIARY,
        dryRun: true,
      }),
    ).toThrow(AmbassadorPayRefuseError);
  });
});

describe('public IFC / residency doors — unset rates never look payable', () => {
  it('unset IFC quote is typed refuse without magnitudes', () => {
    const q = decidePublicAmbassadorPayQuote({ kind: 'ifc_pay', law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW });
    expect(q.status).toBe('refuse');
    expect(q.code).toBe('academy.ambassador_pay.rates_unset');
    expect(q.reason).toBe('unset');
    expect(ambassadorPayLooksPayable(q)).toBe(false);
    expect(JSON.stringify(q)).not.toMatch(/sessionCredit/);
  });

  it('accepted residency + unset rates is not payable', () => {
    const q = decidePublicResidencyPayQuote({
      law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
      residencyStatus: 'accepted',
    });
    expect(q.kind).toBe('residency');
    expect(q.code).toBe('academy.ambassador_pay.rates_unset');
    expect(ambassadorPayLooksPayable(q)).toBe(false);
  });

  it('per-call invent on public door refuses without quoting', () => {
    const q = decidePublicAmbassadorPayQuote({
      kind: 'ifc_pay',
      law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
      requestLaw: publishedIfc,
    });
    expect(q.code).toBe('academy.ambassador_pay.invent_refused');
    expect(ambassadorPayLooksPayable(q)).toBe(false);
  });

  it('fails closed if an unset quote were marked payable', () => {
    const fake = { status: 'ok', ok: true, payable: true, sessionCredit: '1.00' };
    expect(ambassadorPayLooksPayable(fake)).toBe(true);
  });
});
