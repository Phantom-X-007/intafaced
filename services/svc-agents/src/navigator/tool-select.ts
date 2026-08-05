/**
 * Navigator L3 — tool_select pure planner (TRK-agents.navigator Stage-2 depth).
 *
 * Given candidate tools + guardrail allowlist + grounded plane, return the
 * tools the navigator may propose. Never invents undeclared tools. Never
 * selects money-write tools even if a buggy caller lists them as candidates.
 */

import type { Guardrail } from '../fleet/guardrails.js';
import { isNavigatorMoneyWriteTool } from './guardrail.js';
import { navigatorGrounded, type TradeDataPlane } from './grounded.js';

export type ToolSelectOk = {
  readonly status: 'ok';
  readonly selected: readonly string[];
  readonly refused: readonly { tool: string; reason: 'not_declared' | 'money_write' | 'write_mode' }[];
};

export type ToolSelectRefuse = {
  readonly status: 'refuse';
  readonly reason: 'trade_plane_dark' | 'no_candidates';
  readonly userMessageKey?: 'agents.navigator.unavailable';
};

export type ToolSelectResult = ToolSelectOk | ToolSelectRefuse;

/**
 * Pure tool_select: intersect candidates with guardrail read grants.
 * Dark plane → refuse whole select (no invent market tools).
 */
export function selectNavigatorTools(input: {
  plane: TradeDataPlane;
  guardrail: Guardrail;
  candidates: readonly string[];
}): ToolSelectResult {
  const grounded = navigatorGrounded(input.plane);
  if (grounded.status === 'refuse') {
    return {
      status: 'refuse',
      reason: 'trade_plane_dark',
      userMessageKey: grounded.userMessageKey,
    };
  }

  if (input.candidates.length === 0) {
    return { status: 'refuse', reason: 'no_candidates' };
  }

  const declared = new Map(input.guardrail.tools.map((t) => [t.name, t]));
  const selected: string[] = [];
  const refused: ToolSelectOk['refused'][number][] = [];
  const seen = new Set<string>();

  for (const raw of input.candidates) {
    const tool = raw.trim();
    if (!tool || seen.has(tool)) continue;
    seen.add(tool);

    if (isNavigatorMoneyWriteTool(tool)) {
      refused.push({ tool, reason: 'money_write' });
      continue;
    }

    const grant = declared.get(tool);
    if (!grant) {
      refused.push({ tool, reason: 'not_declared' });
      continue;
    }

    if (grant.mode !== 'read') {
      refused.push({ tool, reason: 'write_mode' });
      continue;
    }

    selected.push(tool);
  }

  return { status: 'ok', selected, refused };
}

/** Rank selected tools for plan output — declared order on guardrail wins. */
export function orderSelectedTools(guardrail: Guardrail, selected: readonly string[]): readonly string[] {
  const order = new Map(guardrail.tools.map((t, i) => [t.name, i]));
  return [...selected].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}
