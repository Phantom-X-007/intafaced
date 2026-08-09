/**
 * Pure price-alert evaluation.
 *
 * Done bar (v22.alerts MVP):
 *   · dark / stale / refused mark → refuse `alert.price_unavailable`, never fire
 *   · mark crosses target in the watched direction → fire
 *   · mark on the unarmed side → hold
 *   · inactive / cancelled / already-fired → refuse `alert.not_active`
 *
 * No network, no store, no invent of prices.
 */

import { compareDecimalStrings, isValidPositivePrice, parseDecimalString } from './decimal.js';
import type { AlertEvalOutcome, MarkQuote, PriceAlert } from './types.js';

export function evaluatePriceAlert(alert: PriceAlert, quote: MarkQuote): AlertEvalOutcome {
  if (alert.status !== 'active') {
    return { kind: 'refuse', code: 'alert.not_active', detail: `status=${alert.status}` };
  }
  if (!isValidPositivePrice(alert.targetPrice)) {
    return { kind: 'refuse', code: 'alert.invalid_price', detail: `target=${alert.targetPrice}` };
  }
  if (quote.kind === 'unavailable') {
    return {
      kind: 'refuse',
      code: 'alert.price_unavailable',
      detail: quote.detail ?? quote.reason,
    };
  }
  const markParsed = parseDecimalString(quote.price);
  if (!markParsed.ok || markParsed.negative || (markParsed.int === '0' && markParsed.frac === '')) {
    return {
      kind: 'refuse',
      code: 'alert.price_unavailable',
      detail: `mark not a positive decimal: ${quote.price}`,
    };
  }

  const cmp = compareDecimalStrings(quote.price, alert.targetPrice);
  const crossed = alert.direction === 'above' ? cmp >= 0 : /* below */ cmp <= 0;

  if (crossed) {
    return { kind: 'fire', markPrice: quote.price };
  }
  return { kind: 'hold', markPrice: quote.price };
}
