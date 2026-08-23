/**
 * Pure sourced-mark evaluation + refuse-closed unpublished / portfolio arms.
 *
 * Done bar (v22.alerts):
 *   · dark / stale / refused mark → refuse `alert.price_unavailable`, never fire
 *   · mark crosses target in the watched direction → fire
 *   · mark on the unarmed side → hold
 *   · inactive / cancelled / already-fired → refuse `alert.not_active`
 *   · price / funding / liquidation_proximity all use the injected price mark
 *     — never an invented funding rate or liquidation book
 *   · whale uses a separate flow mark — never the price print, never an
 *     invented volume. Dark / missing flow → refuse `alerts.whale_mark_dark`
 *   · portfolio kind → refuse `alert.portfolio_view_unpublished`, never fire,
 *     never read or invent a ledger balance (silence is not a cross)
 *   · intelligence → refuse `alert.kind_unpublished`, never fire
 *
 * No network, no store, no invent of prices, flows, or balances.
 */

import { compareDecimalStrings, isValidPositivePrice, parseDecimalString } from './decimal.js';
import {
  ALERT_KIND_UNPUBLISHED,
  ALERT_PORTFOLIO_VIEW_UNPUBLISHED,
  ALERTS_WHALE_MARK_DARK,
  type AlertEvalOutcome,
  type MarkQuote,
  type PriceAlert,
  type UnpublishedAlertKind,
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

/**
 * Intelligence has no sourced series. Evaluate never quotes a mark and never
 * fires. Whale is a sourced-mark watch — it goes through `evaluateWhaleAlert`.
 */
export function evaluateUnpublishedKind(kind: UnpublishedAlertKind): AlertEvalOutcome {
  return {
    kind: 'refuse',
    code: ALERT_KIND_UNPUBLISHED,
    detail: `${kind} has no sourced series`,
  };
}

/**
 * Whale flow vs a user-named decimal target.
 *
 * The quote must be a sourced flow, not a price print. Unavailable / garbage
 * flow refuses `alerts.whale_mark_dark` — never fires, never invents volume.
 */
export function evaluateWhaleAlert(alert: PriceAlert, quote: MarkQuote): AlertEvalOutcome {
  if (alert.status !== 'active') {
    return { kind: 'refuse', code: 'alert.not_active', detail: `status=${alert.status}` };
  }
  if (!isValidPositivePrice(alert.targetPrice)) {
    return { kind: 'refuse', code: 'alert.invalid_price', detail: `target=${alert.targetPrice}` };
  }
  if (quote.kind === 'unavailable') {
    return {
      kind: 'refuse',
      code: ALERTS_WHALE_MARK_DARK,
      detail: quote.detail ?? quote.reason,
    };
  }
  const markParsed = parseDecimalString(quote.price);
  if (!markParsed.ok || markParsed.negative || (markParsed.int === '0' && markParsed.frac === '')) {
    return {
      kind: 'refuse',
      code: ALERTS_WHALE_MARK_DARK,
      detail: `flow not a positive decimal: ${quote.price}`,
    };
  }

  const cmp = compareDecimalStrings(quote.price, alert.targetPrice);
  const crossed = alert.direction === 'above' ? cmp >= 0 : /* below */ cmp <= 0;

  if (crossed) {
    return { kind: 'fire', markPrice: quote.price };
  }
  return { kind: 'hold', markPrice: quote.price };
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
