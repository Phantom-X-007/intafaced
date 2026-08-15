/**
 * Pure price-alert evaluation + refuse-closed portfolio arm.
 *
 * Done bar (v22.alerts MVP):
 *   · dark / stale / refused mark → refuse `alert.price_unavailable`, never fire
 *   · mark crosses target in the watched direction → fire
 *   · mark on the unarmed side → hold
 *   · inactive / cancelled / already-fired → refuse `alert.not_active`
 *   · portfolio kind → refuse `alert.portfolio_view_unpublished`, never fire,
 *     never read or invent a ledger balance (silence is not a cross)
 *
 * No network, no store, no invent of prices or balances.
 */

import { compareDecimalStrings, isValidPositivePrice, parseDecimalString } from './decimal.js';
import {
  ALERT_PORTFOLIO_VIEW_UNPUBLISHED,
  type AlertEvalOutcome,
  type MarkQuote,
  type PriceAlert,
} from './types.js';

/**
 * Portfolio watches are unpublished until ledger owns a view.
 * Takes no quote and no balance — silence and invented numbers both refuse.
 */
export function evaluatePortfolioAlert(): AlertEvalOutcome {
  return {
    kind: 'refuse',
    code: ALERT_PORTFOLIO_VIEW_UNPUBLISHED,
    detail: 'ledger portfolio view unpublished — notify holds no balance',
  };
}

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
