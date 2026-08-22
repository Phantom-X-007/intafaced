/**
 * quant.backtest surface refuse — API-facing honesty entry (D32).
 *
 * Wraps gateQuantSurfaceRender with stable refuse messages for HTTP/tRPC consumers.
 * Never partial-renders with invented framing.
 */

import { gateQuantSurfaceRender, type QuantSurfaceRenderInput } from './quant-honesty-mount.js';
import type { QuantHonestyRefuseReason } from './quant-honesty-policy.js';

export type QuantSurfaceRefuse = {
  readonly ok: false;
  readonly reason: QuantHonestyRefuseReason;
  readonly message: string;
};

export type QuantSurfaceAllow = { readonly ok: true };

const REFUSE_MESSAGES: Record<QuantHonestyRefuseReason, string> = {
  no_out_of_sample_verdict: 'Backtest render refused: out-of-sample verdict is mandatory',
  unmodelled_costs: 'Backtest render refused: fees, slippage, and latency must be modelled',
  missing_variant_count: 'Backtest render refused: variant count must be disclosed',
  returns_leaderboard: 'Returns-ranked leaderboard is banned on every surface',
  mismatched_pnl_label_weight: 'Live vs backtest P&L labels must have equal visual weight',
};

/** Consumer entry — allow render or return typed refuse with message. */
export function refuseQuantSurfaceRender(input: QuantSurfaceRenderInput): QuantSurfaceAllow | QuantSurfaceRefuse {
  const gate = gateQuantSurfaceRender(input);
  if (gate.ok) return { ok: true };
  return { ok: false, reason: gate.reason, message: REFUSE_MESSAGES[gate.reason] };
}

export function describeQuantSurfaceRefuse() {
  return {
    compositeGateWired: true as const,
    inventsFraming: false as const,
    refuseMessagesLocked: true as const,
  };
}
