import { describe, expect, it } from 'vitest';
import { arbCapitalGate, EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV } from './arb-owner-capital-gate.js';

describe('arb owner capital / freshness gate', () => {
  it('refuses when max quote age env is unset', () => {
    expect(arbCapitalGate({})).toEqual({
      configured: false,
      reason: 'capital_unset',
      detail: `${EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV} is unset`,
    });
  });

  it('parses owner maxQuoteAgeMs without inventing defaults', () => {
    expect(arbCapitalGate({ [EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV]: '5000' })).toEqual({
      configured: true,
      maxQuoteAgeMs: 5000,
    });
  });
});
