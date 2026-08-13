import { describe, expect, it } from 'vitest';
import {
  AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL,
  AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL,
  AmbassadorRateAuthorityRefuseError,
  ambassadorIfcPayLawIsPublished,
  ambassadorIfcPayLawStatusLine,
  ambassadorRevenueShareLawIsPublished,
  ambassadorRevenueShareLawStatusLine,
  parseAmbassadorIfcPayLawJson,
  parseAmbassadorRevenueShareLawJson,
  resolveAmbassadorIfcPayLaw,
  resolveAmbassadorRevenueShareLaw,
  UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
  UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW,
} from './ifc-pay-rate-law.js';

describe('ambassador IFC / revenue-share rate authority — refuse invent (D26-P1-C2)', () => {
  it('blank env → unpublished', () => {
    expect(parseAmbassadorIfcPayLawJson(undefined)).toEqual(UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW);
    expect(parseAmbassadorIfcPayLawJson('')).toEqual(UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW);
    expect(parseAmbassadorIfcPayLawJson('   ')).toEqual(UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW);
    expect(ambassadorIfcPayLawIsPublished(UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW)).toBe(false);
    expect(ambassadorIfcPayLawStatusLine(UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW)).toBe('published=0');
  });

  it('published:false JSON → unpublished', () => {
    expect(parseAmbassadorIfcPayLawJson('{"published":false}')).toEqual(UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW);
    expect(parseAmbassadorRevenueShareLawJson('{"published":false}')).toEqual(UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW);
  });

  it('published IFC law parses and resolves', () => {
    const law = parseAmbassadorIfcPayLawJson(
      JSON.stringify({
        published: true,
        sessionCredit: '12.50000000',
        asset: 'IFC',
        period: 'session',
      }),
    );
    expect(law.published).toBe(true);
    if (!law.published) throw new Error('expected published');
    expect(law.sessionCredit).toBe('12.50000000');
    expect(resolveAmbassadorIfcPayLaw({ law })).toEqual(law);
    expect(ambassadorIfcPayLawStatusLine(law)).toBe('published=1 period=session asset=IFC');
  });

  it('published revenue-share law parses and resolves', () => {
    const law = parseAmbassadorRevenueShareLawJson(
      JSON.stringify({
        published: true,
        shareOfFeeBps: 500,
        feeBasis: 'lobby_host_fees',
      }),
    );
    expect(law.published).toBe(true);
    if (!law.published) throw new Error('expected published');
    expect(law.shareOfFeeBps).toBe(500);
    expect(resolveAmbassadorRevenueShareLaw({ law })).toEqual(law);
    expect(ambassadorRevenueShareLawIsPublished(law)).toBe(true);
    expect(ambassadorRevenueShareLawStatusLine(law)).toBe('published=1 basis=lobby_host_fees bps=500');
  });

  it('request law wins over unpublished env', () => {
    const request = {
      published: true as const,
      sessionCredit: '3.00000000',
      asset: 'IFC',
      period: 'season',
    };
    expect(resolveAmbassadorIfcPayLaw({ requestLaw: request, law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW })).toEqual(request);
  });

  it('no request + unpublished → rates_unset residual', () => {
    expect(() => resolveAmbassadorIfcPayLaw({ law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW })).toThrow(AmbassadorRateAuthorityRefuseError);
    try {
      resolveAmbassadorIfcPayLaw({ law: UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW });
    } catch (err) {
      const e = err as AmbassadorRateAuthorityRefuseError;
      expect(e.code).toBe('academy.ambassador_pay.rates_unset');
      expect(e.residual).toBe(AMBASSADOR_IFC_RATE_AUTHORITY_RESIDUAL);
    }
    try {
      resolveAmbassadorRevenueShareLaw({ law: UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW });
    } catch (err) {
      const e = err as AmbassadorRateAuthorityRefuseError;
      expect(e.code).toBe('academy.ambassador_revenue_share.rates_unset');
      expect(e.residual).toBe(AMBASSADOR_REVENUE_SHARE_RATE_AUTHORITY_RESIDUAL);
    }
  });

  it('malformed / zero credit fails closed — does not invent', () => {
    expect(() => parseAmbassadorIfcPayLawJson('{not-json')).toThrow(AmbassadorRateAuthorityRefuseError);
    expect(() => parseAmbassadorIfcPayLawJson('{"published":true}')).toThrow(AmbassadorRateAuthorityRefuseError);
    expect(() =>
      parseAmbassadorIfcPayLawJson(JSON.stringify({ published: true, sessionCredit: '0', asset: 'IFC', period: 'session' })),
    ).toThrow(AmbassadorRateAuthorityRefuseError);
    expect(() => parseAmbassadorRevenueShareLawJson(JSON.stringify({ published: true, shareOfFeeBps: 10001, feeBasis: 'x' }))).toThrow(
      AmbassadorRateAuthorityRefuseError,
    );
  });
});
