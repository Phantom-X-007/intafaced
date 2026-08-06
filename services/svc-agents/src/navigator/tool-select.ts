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

/** L3 — true when select ok. */
export function isToolSelectOk(result: ToolSelectResult): result is ToolSelectOk {
  return result.status === 'ok';
}

/** L3 — selected count (refuse → 0, no invent). */
export function toolSelectSelectedCount(result: ToolSelectResult): number {
  return result.status === 'ok' ? result.selected.length : 0;
}

/** L3 — refused count (refuse whole → 0 on list; use reason). */
export function toolSelectRefusedCount(result: ToolSelectResult): number {
  return result.status === 'ok' ? result.refused.length : 0;
}

/** L3 — board card. */
export function toolSelectBoardCard(result: ToolSelectResult): {
  readonly ok: boolean;
  readonly selected: number;
  readonly refused: number;
  readonly reason: string | null;
} {
  if (result.status === 'ok') {
    return { ok: true, selected: result.selected.length, refused: result.refused.length, reason: null };
  }
  return { ok: false, selected: 0, refused: 0, reason: result.reason };
}

/** L3 — status line. */
export function toolSelectStatusLine(result: ToolSelectResult): string {
  const c = toolSelectBoardCard(result);
  return `ok=${c.ok ? '1' : '0'} selected=${c.selected} refused=${c.refused} reason=${c.reason ?? '-'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseToolSelectStatusLine(
  line: string,
): { readonly ok: boolean; readonly selected: number; readonly refused: number; readonly reason: string | null } | null {
  const m = line.trim().match(/^ok=([01]) selected=(\d+) refused=(\d+) reason=(\S+)$/);
  if (!m) return null;
  return {
    ok: m[1] === '1',
    selected: Number(m[2]),
    refused: Number(m[3]),
    reason: m[4] === '-' ? null : m[4]!,
  };
}

/** L3 — true when status matches. */
export function toolSelectStatusLineMatches(result: ToolSelectResult): boolean {
  const p = parseToolSelectStatusLine(toolSelectStatusLine(result));
  if (!p) return false;
  const c = toolSelectBoardCard(result);
  return p.ok === c.ok && p.selected === c.selected && p.refused === c.refused && p.reason === c.reason;
}

/** L3 — export header. */
export function toolSelectExportHeader(): string {
  return 'status,selected,refused,reason';
}

/** L3 — export line. */
export function toolSelectExportLine(result: ToolSelectResult): string {
  const c = toolSelectBoardCard(result);
  return `${c.ok ? 'ok' : 'refuse'},${c.selected},${c.refused},${c.reason ?? ''}`;
}

/** L3 — full export. */
export function toolSelectExportText(result: ToolSelectResult): string {
  return [toolSelectExportHeader(), toolSelectExportLine(result)].join('\n');
}

/** L3 — true when selected is within [min,max]. Invalid → false. */
export function toolSelectSelectedInRange(result: ToolSelectResult, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = toolSelectSelectedCount(result);
  return n >= min && n <= max;
}
