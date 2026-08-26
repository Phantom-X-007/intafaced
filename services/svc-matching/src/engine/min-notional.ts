/**
 * Caller min notional through matching.
 * Missing notional when minNotional is requested refuses. The engine does not invent last.
 */
import { ZERO, mul, type Amount } from '@intafaced/ledger-client/money';

export const NOTIONAL_MISSING = 'missing_notional' as const;
export const NOTIONAL_BELOW = 'below_min_notional' as const;

export type MinNotionalRefuse = typeof NOTIONAL_MISSING | typeof NOTIONAL_BELOW;

/** Caller min notional. Null/zero/negative is not requested — never last. */
export function readMinNotional(order: { readonly minNotional?: Amount | null }): Amount | null {
  if (order.minNotional === undefined || order.minNotional === null || order.minNotional <= ZERO) return null;
  return order.minNotional;
}

/**
 * Notional from caller qty × price. Null when price is missing — never last.
 * Floor rounding so a round-up cannot invent a pass.
 */
export function callerNotional(qty: Amount, price: Amount | null): Amount | null {
  if (price === null || price <= ZERO || qty <= ZERO) return null;
  return mul(qty, price, 'floor');
}

export function missingNotionalRefuse(): { readonly code: typeof NOTIONAL_MISSING; readonly message: string } {
  return {
    code: NOTIONAL_MISSING,
    message: 'minNotional requires a caller notional; the engine does not invent last',
  };
}

export function belowMinNotionalRefuse(): { readonly code: typeof NOTIONAL_BELOW; readonly message: string } {
  return {
    code: NOTIONAL_BELOW,
    message: 'submit notional is below caller minNotional; the engine does not invent last',
  };
}

export function minNotionalIntentRefuse(order: {
  readonly minNotional?: Amount | null;
  readonly qty: Amount;
  readonly price?: Amount | null;
}): { readonly code: MinNotionalRefuse; readonly message: string } | null {
  const floor = readMinNotional(order);
  if (floor === null) return null;
  const notional = callerNotional(order.qty, order.price ?? null);
  if (notional === null) return missingNotionalRefuse();
  if (notional < floor) return belowMinNotionalRefuse();
  return null;
}
