import { describe, expect, it } from 'vitest';
import {
  copyLawResidual,
  copyLawStatusLine,
  parseCopyFeeShareLawJson,
  parseCopyJurisdictionLawJson,
  requirePublishedCopyFeeShareLaw,
  requirePublishedCopyJurisdictionLaw,
  UNPUBLISHED_COPY_FEE_SHARE_LAW,
  UNPUBLISHED_COPY_JURISDICTION_LAW,
} from './fee-share-law.js';
import { COPY_FEE_SHARE_RESIDUAL, COPY_JURISDICTION_RESIDUAL, COPY_LAW_RESIDUAL, CopyError } from './errors.js';

describe('parseCopyFeeShareLawJson', () => {
  it('empty → unpublished (refuse-closed default)', () => {
    expect(parseCopyFeeShareLawJson('')).toEqual(UNPUBLISHED_COPY_FEE_SHARE_LAW);
    expect(parseCopyFeeShareLawJson(null)).toEqual(UNPUBLISHED_COPY_FEE_SHARE_LAW);
    expect(parseCopyFeeShareLawJson('  ')).toEqual(UNPUBLISHED_COPY_FEE_SHARE_LAW);
  });

  it('published false → unpublished', () => {
    expect(parseCopyFeeShareLawJson('{"published":false}')).toEqual(UNPUBLISHED_COPY_FEE_SHARE_LAW);
  });

  it('published true with owner numbers', () => {
    const law = parseCopyFeeShareLawJson(
      JSON.stringify({
        published: true,
        leaderShareBps: 2_500,
        earningsCapPerFollower: '100',
        decayRoundTrips: 10,
        decayShareBps: 500,
      }),
    );
    expect(law.published).toBe(true);
    if (law.published) {
      expect(law.leaderShareBps).toBe(2_500);
      expect(law.earningsCapPerFollower).toBe('100');
      expect(law.decayRoundTrips).toBe(10);
      expect(law.decayShareBps).toBe(500);
    }
  });

  it('refuses invent — missing leaderShareBps', () => {
    expect(() => parseCopyFeeShareLawJson(JSON.stringify({ published: true, earningsCapPerFollower: '1' }))).toThrow(CopyError);
  });
});

describe('parseCopyJurisdictionLawJson', () => {
  it('empty → unpublished', () => {
    expect(parseCopyJurisdictionLawJson('')).toEqual(UNPUBLISHED_COPY_JURISDICTION_LAW);
  });

  it('published allowlist uppercases regions', () => {
    const law = parseCopyJurisdictionLawJson(JSON.stringify({ published: true, allowedRegions: ['sg', 'Ae'] }));
    expect(law).toEqual({ published: true, allowedRegions: ['SG', 'AE'] });
  });

  it('refuses invent — missing allowedRegions', () => {
    expect(() => parseCopyJurisdictionLawJson(JSON.stringify({ published: true }))).toThrow(CopyError);
  });

  it('published empty allowlist is valid (serve none — not invent)', () => {
    expect(parseCopyJurisdictionLawJson(JSON.stringify({ published: true, allowedRegions: [] }))).toEqual({
      published: true,
      allowedRegions: [],
    });
  });
});

describe('requirePublished*', () => {
  it('fee-share refuse names DIRECTION §8 residual', () => {
    try {
      requirePublishedCopyFeeShareLaw(UNPUBLISHED_COPY_FEE_SHARE_LAW);
      expect.unreachable('should refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(CopyError);
      expect((err as CopyError).code).toBe('trade.copy_fee_share_blank');
      expect((err as CopyError).residual).toBe(COPY_FEE_SHARE_RESIDUAL);
      expect(COPY_FEE_SHARE_RESIDUAL).toContain('DIRECTION §8');
    }
  });

  it('jurisdiction refuse names DIRECTION §8 residual', () => {
    try {
      requirePublishedCopyJurisdictionLaw(UNPUBLISHED_COPY_JURISDICTION_LAW);
      expect.unreachable('should refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(CopyError);
      expect((err as CopyError).code).toBe('trade.copy_jurisdiction_blank');
      expect((err as CopyError).residual).toBe(COPY_JURISDICTION_RESIDUAL);
    }
  });

  it('status line names both refuse-closed blanks', () => {
    const line = copyLawStatusLine(UNPUBLISHED_COPY_FEE_SHARE_LAW, UNPUBLISHED_COPY_JURISDICTION_LAW);
    expect(line).toContain('feeShare=0');
    expect(line).toContain('jurisdiction=0');
    expect(copyLawResidual(UNPUBLISHED_COPY_FEE_SHARE_LAW, UNPUBLISHED_COPY_JURISDICTION_LAW)).toBe(COPY_LAW_RESIDUAL);
  });
});
