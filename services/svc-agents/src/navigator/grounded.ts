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

/** L3 — true when grounded ok. */
export function isNavigatorGroundedOk(result: GroundedResult): result is GroundedOk {
  return result.status === 'ok';
}

/** L3 — board card. */
export function navigatorGroundedBoardCard(result: GroundedResult): {
  readonly ok: boolean;
  readonly plane: TradeDataPlane;
  readonly reason: string | null;
  readonly taskCount: number;
} {
  if (result.status === 'ok') {
    return { ok: true, plane: result.plane, reason: null, taskCount: result.allowedTasks.length };
  }
  return { ok: false, plane: result.plane, reason: result.reason, taskCount: 0 };
}

/** L3 — status line. */
export function navigatorGroundedStatusLine(result: GroundedResult): string {
  const c = navigatorGroundedBoardCard(result);
  return `ok=${c.ok ? '1' : '0'} plane=${c.plane} tasks=${c.taskCount} reason=${c.reason ?? '-'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseNavigatorGroundedStatusLine(
  line: string,
): { readonly ok: boolean; readonly plane: TradeDataPlane; readonly tasks: number; readonly reason: string | null } | null {
  const m = line.trim().match(/^ok=([01]) plane=(live|dark) tasks=(\d+) reason=(\S+)$/);
  if (!m) return null;
  return {
    ok: m[1] === '1',
    plane: m[2] as TradeDataPlane,
    tasks: Number(m[3]),
    reason: m[4] === '-' ? null : m[4]!,
  };
}

/** L3 — true when status matches. */
export function navigatorGroundedStatusLineMatches(result: GroundedResult): boolean {
  const p = parseNavigatorGroundedStatusLine(navigatorGroundedStatusLine(result));
  if (!p) return false;
  const c = navigatorGroundedBoardCard(result);
  return p.ok === c.ok && p.plane === c.plane && p.tasks === c.taskCount && p.reason === c.reason;
}

/** L3 — export header. */
export function navigatorGroundedExportHeader(): string {
  return 'status,plane,tasks,reason';
}

/** L3 — export line. */
export function navigatorGroundedExportLine(result: GroundedResult): string {
  const c = navigatorGroundedBoardCard(result);
  return `${c.ok ? 'ok' : 'refuse'},${c.plane},${c.taskCount},${c.reason ?? ''}`;
}

/** L3 — full export. */
export function navigatorGroundedExportText(result: GroundedResult): string {
  return [navigatorGroundedExportHeader(), navigatorGroundedExportLine(result)].join('\n');
}

/** L3 — true when plane live. */
export function isTradePlaneLive(plane: TradeDataPlane): boolean {
  return plane === 'live';
}
