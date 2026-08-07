/**
 * Events L3 — pure agent-action kind catalog honesty (structural only).
 *
 * Mirrors catalog.ts agent action kinds.
 * Does not invent agent product law or token economics.
 */

export const AGENT_ACTION_KINDS = ['session_open', 'session_close', 'completion', 'embedding', 'tool_call', 'usage_settlement'] as const;
export type AgentActionKindId = (typeof AGENT_ACTION_KINDS)[number];

/** L3 — catalog board. */
export function agentActionKindCatalogBoardCard(): {
  readonly kinds: number;
  readonly hasSessionOpen: number;
  readonly hasCompletion: number;
  readonly hasToolCall: number;
  readonly hasUsageSettlement: number;
} {
  return {
    kinds: AGENT_ACTION_KINDS.length,
    hasSessionOpen: AGENT_ACTION_KINDS.includes('session_open') ? 1 : 0,
    hasCompletion: AGENT_ACTION_KINDS.includes('completion') ? 1 : 0,
    hasToolCall: AGENT_ACTION_KINDS.includes('tool_call') ? 1 : 0,
    hasUsageSettlement: AGENT_ACTION_KINDS.includes('usage_settlement') ? 1 : 0,
  };
}

/** L3 — status line. */
export function agentActionKindCatalogStatusLine(): string {
  const c = agentActionKindCatalogBoardCard();
  return `kinds=${c.kinds} session_open=${c.hasSessionOpen} completion=${c.hasCompletion} tool_call=${c.hasToolCall} usage_settlement=${c.hasUsageSettlement}`;
}

/** L3 — parse status. */
export function parseAgentActionKindCatalogStatusLine(line: string): {
  readonly kinds: number;
  readonly session_open: number;
  readonly completion: number;
  readonly tool_call: number;
  readonly usage_settlement: number;
} | null {
  const m = line.trim().match(/^kinds=(\d+) session_open=([01]) completion=([01]) tool_call=([01]) usage_settlement=([01])$/);
  if (!m) return null;
  return {
    kinds: Number(m[1]),
    session_open: Number(m[2]),
    completion: Number(m[3]),
    tool_call: Number(m[4]),
    usage_settlement: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function agentActionKindCatalogStatusLineMatches(): boolean {
  const p = parseAgentActionKindCatalogStatusLine(agentActionKindCatalogStatusLine());
  if (!p) return false;
  const c = agentActionKindCatalogBoardCard();
  return (
    p.kinds === c.kinds &&
    p.session_open === c.hasSessionOpen &&
    p.completion === c.hasCompletion &&
    p.tool_call === c.hasToolCall &&
    p.usage_settlement === c.hasUsageSettlement
  );
}

/** L3 — six kinds. */
export function agentActionKindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAgentActionKindCatalogStatusLine(line);
  if (!p) return false;
  return p.kinds === 6 && p.session_open === 1 && p.completion === 1 && p.tool_call === 1 && p.usage_settlement === 1;
}

/** L3 — export header. */
export function agentActionKindCatalogExportHeader(): string {
  return 'agent_action_kind';
}

/** L3 — export lines. */
export function agentActionKindCatalogExportLines(): readonly string[] {
  return [...AGENT_ACTION_KINDS];
}

/** L3 — full export. */
export function agentActionKindCatalogExportText(): string {
  return [agentActionKindCatalogExportHeader(), ...agentActionKindCatalogExportLines()].join('\n');
}

/** L3 — kind declared. */
export function isDeclaredAgentActionKind(kind: string): boolean {
  return (AGENT_ACTION_KINDS as readonly string[]).includes(kind);
}
