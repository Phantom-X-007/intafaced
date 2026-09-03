/**
 * CARD H7 — QuantLib adapter link-or-refuse.
 *
 * svc-trade is the one service consumer of `@intafaced/greeks-adapter`.
 * What-if posts no money. Blank INTAFACED_QUANTLIB_NATIVE unlinks and
 * refuses numbers. Linked Greeks leave as decimal strings. This door does
 * not invent a settlement asset and does not open live options listing.
 */
import { createGreeksAdapter, NATIVE_ENV, type GreeksAdapter, type VanillaEuropeanInput } from '@intafaced/greeks-adapter';

export { NATIVE_ENV };

export const GREEKS_WHAT_IF_PATH = '/api/v1/greeks/what-if' as const;
export const GREEKS_NATIVE_UNLINKED = 'trade.greeks_native_unlinked' as const;

export const GREEK_KEYS = ['npv', 'delta', 'gamma', 'vega', 'theta'] as const;

export type WhatIfGreeksOk = {
  readonly ok: true;
  readonly linked: true;
  readonly npv: string;
  readonly delta: string;
  readonly gamma: string;
  readonly vega: string;
  readonly theta: string;
};

export type WhatIfGreeksRefuse = {
  readonly ok: false;
  readonly linked: boolean;
  readonly code: string;
  readonly reason: string;
  readonly message: string;
  readonly field?: string;
};

export type WhatIfGreeksResult = WhatIfGreeksOk | WhatIfGreeksRefuse;

export type WhatIfGreeksDeps = {
  readonly adapter?: GreeksAdapter;
  /** Must never be invoked — what-if is not a money path. */
  readonly post?: (recipe: unknown) => Promise<unknown>;
};

function tradeCode(reason: string): string {
  return reason === 'native_unavailable' ? GREEKS_NATIVE_UNLINKED : `trade.greeks_${reason}`;
}

function ieeeOnOk(result: WhatIfGreeksOk): boolean {
  return GREEK_KEYS.some((key) => typeof result[key] !== 'string');
}

/**
 * Research/valuation door. Never posts. Unlinked QuantLib refuses numbers
 * rather than inventing Black-Scholes.
 */
export function whatIfVanillaGreeks(
  input: Partial<VanillaEuropeanInput> | null | undefined,
  deps: WhatIfGreeksDeps = {},
): WhatIfGreeksResult {
  void deps.post;
  const adapter = deps.adapter ?? createGreeksAdapter();
  const result = adapter.vanillaEuropean(input);
  if (!result.ok) {
    return result.field === undefined
      ? { ok: false, linked: result.linked, code: tradeCode(result.reason), reason: result.reason, message: result.message }
      : {
          ok: false,
          linked: result.linked,
          code: tradeCode(result.reason),
          reason: result.reason,
          message: result.message,
          field: result.field,
        };
  }

  const ok: WhatIfGreeksOk = {
    ok: true,
    linked: true,
    npv: result.npv,
    delta: result.delta,
    gamma: result.gamma,
    vega: result.vega,
    theta: result.theta,
  };
  if (ieeeOnOk(ok)) {
    return {
      ok: false,
      linked: true,
      code: 'trade.greeks_ieee_output',
      reason: 'ieee_output',
      message: 'QuantLib Greeks must leave as decimal strings — IEEE number refused on the wire',
    };
  }
  return ok;
}
