import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { parseOtcDeskLawJson, requirePublishedOtcDeskLaw, UNPUBLISHED_OTC_DESK_LAW, otcDeskLawStatusLine } from './desk-law.js';
import { OTC_DESK_LAW_RESIDUAL, OtcError } from './errors.js';

describe('parseOtcDeskLawJson', () => {
  it('empty → unpublished (refuse-closed default)', () => {
    expect(parseOtcDeskLawJson('')).toEqual(UNPUBLISHED_OTC_DESK_LAW);
    expect(parseOtcDeskLawJson(null)).toEqual(UNPUBLISHED_OTC_DESK_LAW);
    expect(parseOtcDeskLawJson('  ')).toEqual(UNPUBLISHED_OTC_DESK_LAW);
  });

  it('published false → unpublished', () => {
    expect(parseOtcDeskLawJson('{"published":false}')).toEqual(UNPUBLISHED_OTC_DESK_LAW);
  });

  it('published true with owner numbers', () => {
    const law = parseOtcDeskLawJson(
      JSON.stringify({
        published: true,
        spreadBps: 25,
        minStake: '1000',
        counterparty: 'platform',
        quoteTtlMs: 15_000,
      }),
    );
    expect(law.published).toBe(true);
    if (law.published) {
      expect(law.spreadBps).toBe(25);
      expect(law.minStake).toBe(parseAmount('1000'));
      expect(law.counterparty).toBe('platform');
      expect(law.quoteTtlMs).toBe(15_000);
    }
  });

  it('refuses invent — missing spreadBps', () => {
    expect(() => parseOtcDeskLawJson(JSON.stringify({ published: true, minStake: '1', counterparty: 'platform' }))).toThrow(OtcError);
  });
});

describe('requirePublishedOtcDeskLaw', () => {
  it('refuses blank with DIRECTION §8 residual', () => {
    try {
      requirePublishedOtcDeskLaw(UNPUBLISHED_OTC_DESK_LAW);
      expect.unreachable('should refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(OtcError);
      expect((err as OtcError).code).toBe('trade.otc_desk_law_blank');
      expect((err as OtcError).residual).toBe(OTC_DESK_LAW_RESIDUAL);
      expect(OTC_DESK_LAW_RESIDUAL).toContain('DIRECTION §8');
    }
  });

  it('status line names refuse-closed when unpublished', () => {
    expect(otcDeskLawStatusLine(UNPUBLISHED_OTC_DESK_LAW)).toContain('published=0');
  });
});
