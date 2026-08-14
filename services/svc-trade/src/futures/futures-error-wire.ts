/**
 * REST body for `FuturesError`.
 *
 * Operator-config codes stay domain `{ error, message }` but carry `ccxtCode:
 * NotSupported` and `retry: false`. HTTP may still be 503 (current open/close
 * throws) — CCXT transports retry 5xx unless the body says not to. These are
 * not venue-down: an operator names the profit pot. Same posture as
 * `trade.futures_disabled` → NotSupported.
 *
 * Other FuturesError codes keep the historical two-field body — do not invent
 * a retry class for marks / locks here.
 */

export const OPERATOR_PROFIT_POT_CODES = ['trade.futures_unconfigured', 'trade.profit_source_unconfigured'] as const;

export type OperatorProfitPotCode = (typeof OPERATOR_PROFIT_POT_CODES)[number];

export function isOperatorProfitPotCode(code: string): code is OperatorProfitPotCode {
  return (OPERATOR_PROFIT_POT_CODES as readonly string[]).includes(code);
}

export function presentFuturesErrorWire(err: { code: string; message: string }): {
  error: string;
  message: string;
  ccxtCode?: 'NotSupported';
  retry?: false;
} {
  if (isOperatorProfitPotCode(err.code)) {
    return { error: err.code, message: err.message, ccxtCode: 'NotSupported', retry: false };
  }
  return { error: err.code, message: err.message };
}
