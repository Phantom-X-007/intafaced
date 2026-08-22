/**
 * quant.backtest render consumer — Stage-1 surface entry (D33).
 *
 * Wraps refuseQuantSurfaceRender for quant/copy/backtest UI paths wired through
 * connect.data-lake. Refuse-closed — never partial render.
 */

import { refuseQuantSurfaceRender, type QuantSurfaceAllow, type QuantSurfaceRefuse } from './quant-surface-refuse.js';
import type { QuantSurfaceRenderInput } from './quant-honesty-mount.js';

export type QuantSurfaceRenderDecision = QuantSurfaceAllow | QuantSurfaceRefuse;

/** Consumer render gate — allow or typed refuse with stable message. */
export function evaluateQuantSurfaceRender(input: QuantSurfaceRenderInput): QuantSurfaceRenderDecision {
  return refuseQuantSurfaceRender(input);
}

export function describeQuantSurfaceRenderConsumer() {
  return {
    consumerWired: true as const,
    inventsFraming: false as const,
    usesRefuseQuantSurfaceRender: true as const,
  };
}
