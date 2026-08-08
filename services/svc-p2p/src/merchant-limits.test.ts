import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { checkOfferLimit, describeLimits, limitFor, NO_OFFER_LIMITS, type OfferLimitPolicy } from './merchant-limits.js';
import type { MerchantStatus } from './merchant-programme.js';

const policy = (standard: string | null, merchant: string | null): OfferLimitPolicy => ({
  standardMaxAmount: standard === null ? null : parseAmount(standard),
  merchantMaxAmount: merchant === null ? null : parseAmount(merchant),
});

/** Every status the programme can be in, so a new one cannot be added silently. */
const ALL_STATUSES: MerchantStatus[] = ['applied', 'approved', 'rejected', 'suspended', 'withdrawn'];

describe('merchant offer limits', () => {
  describe('the default is no limit', () => {
    it('lets any account offer any size when nothing is configured', () => {
      // This is the load-bearing non-breaking property: Stage 2 ships the
      // mechanism, not the policy, so an existing deployment that sets neither
      // env var must refuse exactly nothing it allowed before.
      for (const status of [...ALL_STATUSES, null]) {
        const verdict = checkOfferLimit({
          status,
          maxAmt: parseAmount('999999999'),
          asset: 'USDT',
          policy: NO_OFFER_LIMITS,
        });
        expect(verdict.withinLimit, `status ${status} must be unlimited by default`).toBe(true);
      }
    });

    it('reports no ceiling for every status', () => {
      for (const status of [...ALL_STATUSES, null]) {
        expect(limitFor(status, NO_OFFER_LIMITS)).toBeNull();
      }
    });
  });

  describe('which ceiling applies', () => {
    const p = policy('1000', '5000');

    it('gives the merchant ceiling to an approved merchant only', () => {
      expect(limitFor('approved', p)).toBe(parseAmount('5000'));
    });

    it.each(['applied', 'rejected', 'suspended', 'withdrawn'] as const)('leaves %s on the standard ceiling', (status) => {
      // Suspension has to actually take something away — that is the whole
      // reason Stage 1 made it reversible.
      expect(limitFor(status, p)).toBe(parseAmount('1000'));
    });

    it('treats "not in the programme" as standard, never as an error', () => {
      expect(limitFor(null, p)).toBe(parseAmount('1000'));
    });
  });

  describe('the boundary', () => {
    const p = policy('1000', '5000');

    it('allows an offer exactly at the ceiling', () => {
      expect(checkOfferLimit({ status: null, maxAmt: parseAmount('1000'), asset: 'USDT', policy: p }).withinLimit).toBe(true);
    });

    it('refuses one smallest unit above the ceiling', () => {
      const oneOver = parseAmount('1000') + 1n;
      expect(checkOfferLimit({ status: null, maxAmt: oneOver, asset: 'USDT', policy: p }).withinLimit).toBe(false);
    });

    it('allows an approved merchant the size that refuses a standard account', () => {
      const size = parseAmount('4000');
      expect(checkOfferLimit({ status: null, maxAmt: size, asset: 'USDT', policy: p }).withinLimit).toBe(false);
      expect(checkOfferLimit({ status: 'approved', maxAmt: size, asset: 'USDT', policy: p }).withinLimit).toBe(true);
    });

    it('allows zero', () => {
      expect(checkOfferLimit({ status: null, maxAmt: 0n, asset: 'USDT', policy: p }).withinLimit).toBe(true);
    });
  });

  describe('the refusal says something the trader can act on', () => {
    it('names the size, the asset and the ceiling', () => {
      const verdict = checkOfferLimit({
        status: null,
        maxAmt: parseAmount('2500'),
        asset: 'USDT',
        policy: policy('1000', '5000'),
      });
      expect(verdict.withinLimit).toBe(false);
      if (verdict.withinLimit) return;
      expect(verdict.reason).toContain('2500');
      expect(verdict.reason).toContain('1000');
      expect(verdict.reason).toContain('USDT');
    });

    it('points a standard account at the programme when it would actually help', () => {
      const verdict = checkOfferLimit({
        status: null,
        maxAmt: parseAmount('2500'),
        asset: 'USDT',
        policy: policy('1000', '5000'),
      });
      if (verdict.withinLimit) throw new Error('expected a refusal');
      expect(verdict.reason).toMatch(/merchant/i);
    });

    it('does not point at the programme when merchants get the same ceiling', () => {
      // Advertising a route that raises nothing would be advice that wastes an
      // application on the trader's behalf.
      const verdict = checkOfferLimit({
        status: null,
        maxAmt: parseAmount('2500'),
        asset: 'USDT',
        policy: policy('1000', '1000'),
      });
      if (verdict.withinLimit) throw new Error('expected a refusal');
      expect(verdict.reason).not.toMatch(/merchant programme/i);
    });

    it('does not tell an approved merchant to apply to the programme', () => {
      const verdict = checkOfferLimit({
        status: 'approved',
        maxAmt: parseAmount('9000'),
        asset: 'USDT',
        policy: policy('1000', '5000'),
      });
      if (verdict.withinLimit) throw new Error('expected a refusal');
      expect(verdict.reason).not.toMatch(/apply/i);
    });
  });

  describe('the boot line states the posture', () => {
    it('warns when nothing is configured, and says the badge buys nothing', () => {
      const posture = describeLimits(NO_OFFER_LIMITS);
      expect(posture.level).toBe('warn');
      expect(posture.summary).toMatch(/NONE CONFIGURED/);
      expect(posture.summary).toContain('P2P_OFFER_MAX_STANDARD');
    });

    it('reports both figures at info once armed', () => {
      const posture = describeLimits(policy('1000', '5000'));
      expect(posture.level).toBe('info');
      expect(posture.summary).toContain('1000');
      expect(posture.summary).toContain('5000');
    });

    it('names a half-configured posture without pretending the other half exists', () => {
      const posture = describeLimits(policy('1000', null));
      expect(posture.level).toBe('info');
      expect(posture.summary).toContain('1000');
      expect(posture.summary).toContain('unlimited');
    });
  });
});
