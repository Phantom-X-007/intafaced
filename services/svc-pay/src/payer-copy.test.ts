import { describe, expect, it } from 'vitest';
import { PAYER_COPY_KEYS, resolvePayerCopy } from './payer-copy.js';

describe('payer-visible copy resolves @intafaced/i18n keys', () => {
  it('known catalog keys render catalog English, not the dotted name', () => {
    expect(resolvePayerCopy(PAYER_COPY_KEYS.notFound)).toBe('We could not find that.');
    expect(resolvePayerCopy(PAYER_COPY_KEYS.invalidAmount)).toBe('Enter a valid amount.');
    expect(resolvePayerCopy(PAYER_COPY_KEYS.continue)).toBe('Continue');
    expect(resolvePayerCopy(PAYER_COPY_KEYS.generic)).not.toBe(PAYER_COPY_KEYS.generic);
  });

  /**
   * Missing key → the dotted key name, never invented English.
   * Catalog is not edited here; a pay-specific key that is not on tip must not
   * grow a sentence in this service.
   */
  it('unknown key does not invent copy', () => {
    const missing = 'pay.invoice.no_such_key';
    const rendered = resolvePayerCopy(missing);
    expect(rendered).toBe(missing);
    expect(rendered.toLowerCase()).not.toMatch(/\b(sorry|please|unable|try again|payment failed)\b/);
    expect(resolvePayerCopy('pay.checkout.invented.refusal')).toBe('pay.checkout.invented.refusal');
  });
});
