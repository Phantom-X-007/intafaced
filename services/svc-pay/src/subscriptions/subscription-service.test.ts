import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { PayError } from '../payment-service.js';
import { assertMandateTermsUnchanged, normaliseSubscriptionPath } from './subscription-service.js';

/**
 * Re-consent refuse is pure — no Postgres. Full create/cancel DB suite lands
 * when CI has TEST_DATABASE_URL (schema 0010); the SPEC load-bearing refuse is
 * this code path.
 */
describe('normaliseSubscriptionPath (no silent crypto invent)', () => {
  it('defaults to crypto_invoice', () => {
    expect(normaliseSubscriptionPath(undefined)).toBe('crypto_invoice');
  });

  it('accepts crypto_invoice and card', () => {
    expect(normaliseSubscriptionPath('crypto_invoice')).toBe('crypto_invoice');
    expect(normaliseSubscriptionPath('card')).toBe('card');
  });

  it('aliases card_mandate → card (fire refuses rail absent)', () => {
    expect(normaliseSubscriptionPath('card_mandate')).toBe('card');
  });

  it('REFUSES unknown paths that used to open a crypto invoice', () => {
    try {
      normaliseSubscriptionPath('card_pull_invented');
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(PayError);
      expect((e as PayError).code).toBe('pay.subscription_invalid');
    }
  });
});

describe('assertMandateTermsUnchanged (SPEC §4 re-consent)', () => {
  const base = {
    amount: parseAmount('10'),
    ceiling: parseAmount('20') as typeof parseAmount extends never ? never : ReturnType<typeof parseAmount> | null,
  };

  it('allows identical terms (no throw)', () => {
    expect(() =>
      assertMandateTermsUnchanged(
        { amount: parseAmount('10'), ceiling: parseAmount('20') },
        { amount: parseAmount('10'), ceiling: parseAmount('20') },
      ),
    ).not.toThrow();
  });

  it('REFUSES a raised amount — pay.subscription_reconsent_required', () => {
    try {
      assertMandateTermsUnchanged({ amount: parseAmount('10'), ceiling: null }, { amount: parseAmount('11'), ceiling: null });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(PayError);
      expect((e as PayError).code).toBe('pay.subscription_reconsent_required');
    }
  });

  it('REFUSES a ceiling change', () => {
    try {
      assertMandateTermsUnchanged(
        { amount: parseAmount('10'), ceiling: parseAmount('20') },
        { amount: parseAmount('10'), ceiling: parseAmount('30') },
      );
      throw new Error('should have refused');
    } catch (e) {
      expect((e as PayError).code).toBe('pay.subscription_reconsent_required');
    }
  });

  it('REFUSES clearing a ceiling (null) when one was set', () => {
    try {
      assertMandateTermsUnchanged({ amount: parseAmount('10'), ceiling: parseAmount('20') }, { amount: parseAmount('10'), ceiling: null });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as PayError).code).toBe('pay.subscription_reconsent_required');
    }
  });
});
