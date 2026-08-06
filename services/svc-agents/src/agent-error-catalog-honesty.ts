/**
 * Agents L3 — pure agent error-code catalog honesty boards (no runtime I/O).
 *
 * Mirrors errors.ts AGENT_ERROR_CODES. Does not invent vendor messages.
 */

export const AGENT_ERROR_CODE_CATALOG = [
  'agents.route_not_found',
  'agents.capability_unavailable',
  'agents.provider_unavailable',
  'agents.provider_failed',
  'agents.session_not_found',
  'agents.session_closed',
  'agents.agent_not_found',
  'agents.window_sealed',
  'agents.window_not_found',
  'agents.invalid_usage',
  'agents.refused',
] as const;
export type AgentErrorCodeCatalogId = (typeof AGENT_ERROR_CODE_CATALOG)[number];

/** L3 — catalog board. */
export function agentErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly provider: number;
  readonly session: number;
  readonly refused: number;
} {
  const provider = AGENT_ERROR_CODE_CATALOG.filter((c) => c.includes('provider')).length;
  const session = AGENT_ERROR_CODE_CATALOG.filter((c) => c.includes('session')).length;
  return {
    codes: AGENT_ERROR_CODE_CATALOG.length,
    provider,
    session,
    refused: AGENT_ERROR_CODE_CATALOG.includes('agents.refused') ? 1 : 0,
  };
}

/** L3 — status line. */
export function agentErrorCatalogStatusLine(): string {
  const c = agentErrorCatalogBoardCard();
  return `codes=${c.codes} provider=${c.provider} session=${c.session} refused=${c.refused}`;
}

/** L3 — parse status. */
export function parseAgentErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly provider: number;
  readonly session: number;
  readonly refused: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) provider=(\d+) session=(\d+) refused=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    provider: Number(m[2]),
    session: Number(m[3]),
    refused: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function agentErrorCatalogStatusLineMatches(): boolean {
  const p = parseAgentErrorCatalogStatusLine(agentErrorCatalogStatusLine());
  if (!p) return false;
  const c = agentErrorCatalogBoardCard();
  return p.codes === c.codes && p.provider === c.provider && p.session === c.session && p.refused === c.refused;
}

/** L3 — 11 codes; has refused. */
export function agentErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAgentErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 11 && p.refused === 1 && p.provider >= 1 && p.session >= 1;
}

/** L3 — export header. */
export function agentErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function agentErrorCatalogExportLines(): readonly string[] {
  return [...AGENT_ERROR_CODE_CATALOG];
}

/** L3 — full export. */
export function agentErrorCatalogExportText(): string {
  return [agentErrorCatalogExportHeader(), ...agentErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredAgentErrorCatalogCode(code: string): boolean {
  return (AGENT_ERROR_CODE_CATALOG as readonly string[]).includes(code);
}
