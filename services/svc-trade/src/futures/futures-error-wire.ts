/**
 * REST body for `FuturesError`.
 *
 * Operator-config codes stay domain `{ error, message }` but carry `ccxtCode:
 * NotSupported` and `retry: false`. HTTP is 403 (same as `trade.futures_disabled`)
 * so CCXT transports do not retry 5xx. These are not venue-down: an operator
 * names the profit pot.
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
