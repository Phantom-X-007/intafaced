/**
 * Navigator Stage-2 — grounded data plane gate (L3 pack).
 *
 * Spec: docs/ops/trk/agents.navigator.md Stage 2 (grounded tools).
 * When the trade data plane is dark, refuse plan/tool_select grounding
 * rather than inventing quotes or markets.
 */

export type TradeDataPlane = 'live' | 'dark';

export type GroundedOk = {
  readonly status: 'ok';
  readonly plane: 'live';
  readonly allowedTasks: readonly ['navigator.plan', 'navigator.tool_select'];
};

export type GroundedRefuse = {
  readonly status: 'refuse';
  readonly plane: 'dark';
  readonly reason: 'trade_plane_dark';
  readonly userMessageKey: 'agents.navigator.unavailable';
};

export type GroundedResult = GroundedOk | GroundedRefuse;

/**
 * Gate navigator completion when callers know the trade plane state.
 * Live → plan/tool_select may proceed under Stage-1 guardrail.
 * Dark → typed refuse (no invent market context).
 */
export function navigatorGrounded(plane: TradeDataPlane): GroundedResult {
  if (plane === 'dark') {
    return {
      status: 'refuse',
      plane: 'dark',
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    };
  }
  return {
    status: 'ok',
    plane: 'live',
    allowedTasks: ['navigator.plan', 'navigator.tool_select'],
  };
}
