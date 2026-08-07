import { describe, expect, it } from 'vitest';
import {
  AMBASSADOR_IFC_PAY_RESIDUAL,
  AMBASSADOR_REVENUE_SHARE_RESIDUAL,
  AmbassadorPayRefuseError,
  ambassadorPayPlaneIsDark,
  ambassadorPayPlaneStatus,
  ambassadorPayRefuseExportHeader,
  ambassadorPayRefuseExportLine,
  ambassadorPayResidualIsHonest,
  ambassadorPayStatusLine,
  refuseAmbassadorIfcPay,
  refuseAmbassadorPayAttempt,
  refuseAmbassadorRevenueShare,
  tryRefuseAmbassadorPay,
} from './ifc-pay.js';

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
      expect(JSON.stringify(e)).not.toMatch(/\d+\.\d+/); // no invented decimal amount
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

  it('dry-run also refuses — no invented simulation amounts', () => {
    expect(() => refuseAmbassadorPayAttempt({ kind: 'ifc_pay', dryRun: true })).toThrow(AmbassadorPayRefuseError);
    expect(() => refuseAmbassadorPayAttempt({ kind: 'revenue_share', dryRun: true })).toThrow(AmbassadorPayRefuseError);
  });

  it('pay plane status is dark (never invent enabled)', () => {
    const s = ambassadorPayPlaneStatus();
    expect(s.ifcPayEnabled).toBe(false);
    expect(s.revenueShareEnabled).toBe(false);
    expect(s.classM).toBe(true);
    expect(ambassadorPayPlaneIsDark(s)).toBe(true);
    expect(ambassadorPayStatusLine(s)).toBe('ifcPay=0 revenueShare=0 classM=1');
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

  it('residuals name Class M + no invent', () => {
    expect(ambassadorPayResidualIsHonest(AMBASSADOR_IFC_PAY_RESIDUAL)).toBe(true);
    expect(ambassadorPayResidualIsHonest(AMBASSADOR_REVENUE_SHARE_RESIDUAL)).toBe(true);
    expect(ambassadorPayResidualIsHonest('ok to pay')).toBe(false);
  });
});
