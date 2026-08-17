/**
 * Portfolio plan audit — Agentic Law §8.2.
 *
 * Fleet `AuditLog` owns the durable `agent_actions` chain. This helper is the
 * same ceremony in-process: every plan attempt (including refusals) appends a
 * row carrying the plan/refuse payload. Wire to AuditLog.append when a session
 * is mounted; do not skip the row because the plane is dark.
 */

export type PortfolioAuditStatus = 'executed' | 'refused';

export type PortfolioAuditEntry = {
  readonly sequence: number;
  readonly kind: 'tool_call';
  readonly tool: 'portfolio.plan_rebalance';
  readonly agentId: 'portfolio';
  readonly status: PortfolioAuditStatus;
  readonly refusalCode: string | null;
  readonly userMessageKey: string;
  readonly payload: unknown;
  readonly occurredAt: string;
};

export type PortfolioAuditLog = {
  readonly table: 'agent_actions';
  readonly entries: readonly PortfolioAuditEntry[];
};

export function emptyPortfolioAuditLog(): PortfolioAuditLog {
  return { table: 'agent_actions', entries: [] };
}

export function appendPortfolioAudit(
  log: PortfolioAuditLog,
  entry: {
    status: PortfolioAuditStatus;
    refusalCode?: string | null;
    userMessageKey: string;
    payload: unknown;
    occurredAt: string;
  },
): PortfolioAuditLog {
  const next: PortfolioAuditEntry = {
    sequence: log.entries.length,
    kind: 'tool_call',
    tool: 'portfolio.plan_rebalance',
    agentId: 'portfolio',
    status: entry.status,
    refusalCode: entry.refusalCode ?? null,
    userMessageKey: entry.userMessageKey,
    payload: entry.payload,
    occurredAt: entry.occurredAt,
  };
  return { table: 'agent_actions', entries: [...log.entries, next] };
}
