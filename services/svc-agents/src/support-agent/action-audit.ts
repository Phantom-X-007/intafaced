/**
 * Support agent Stage-2 — audit log of user-affecting desk actions.
 *
 * Spec: docs/ops/trk/agents.support.md Stage 2 + Agentic Law §8.2.
 *
 * Pure append-only buffer for support data-tool outcomes. Refusals are recorded
 * with the same ceremony as successes, because "the agent read your ticket" and
 * "the agent was told no" are two facts a desk audit must be able to tell apart
 * afterwards — a refusal that leaves no row is indistinguishable from a call that
 * never happened. Fleet `AuditLog` still owns the durable DB chain; this is the
 * product-facing trail until a live session is wired in Stage-3.
 *
 * ponytail: this mirrors navigator/action-audit.ts rather than sharing it — lift
 * both into fleet/ when a third agent needs the same buffer.
 */

import type { CopyKey } from '../copy.js';
import type { SupportDataToolResult } from './data-tools.js';

export type SupportAuditStatus = 'executed' | 'refused';

export type SupportAuditEntry = {
  readonly sequence: number;
  readonly kind: 'tool_call';
  readonly status: SupportAuditStatus;
  readonly tool: string;
  readonly reason: string | null;
  readonly userMessageKey: CopyKey;
  readonly occurredAt: string;
};

export type SupportAuditLog = {
  readonly entries: readonly SupportAuditEntry[];
};

/** Empty log. */
export function emptySupportAuditLog(): SupportAuditLog {
  return { entries: [] };
}

/** Append one user-affecting support action. Sequence is dense from 0. */
export function appendSupportAudit(
  log: SupportAuditLog,
  entry: {
    status: SupportAuditStatus;
    tool: string;
    reason?: string | null;
    userMessageKey: CopyKey;
    occurredAt: string;
  },
): SupportAuditLog {
  const next: SupportAuditEntry = {
    sequence: log.entries.length,
    kind: 'tool_call',
    status: entry.status,
    tool: entry.tool,
    reason: entry.reason ?? null,
    userMessageKey: entry.userMessageKey,
    occurredAt: entry.occurredAt,
  };
  return { entries: [...log.entries, next] };
}

/** Record a data-tool result as a user-affecting audit row. */
export function auditSupportDataTool(log: SupportAuditLog, result: SupportDataToolResult, occurredAt: string): SupportAuditLog {
  if (result.status === 'ok') {
    return appendSupportAudit(log, {
      status: 'executed',
      tool: result.tool,
      reason: null,
      userMessageKey: 'agents.action.executed',
      occurredAt,
    });
  }
  return appendSupportAudit(log, {
    status: 'refused',
    tool: result.tool,
    reason: result.reason,
    userMessageKey: result.userMessageKey,
    occurredAt,
  });
}

/** Dense sequence check (0..n-1). */
export function verifySupportAuditDense(log: SupportAuditLog): boolean {
  for (let i = 0; i < log.entries.length; i += 1) {
    if (log.entries[i]!.sequence !== i) return false;
  }
  return true;
}

/** Board card. */
export function supportAuditBoardCard(log: SupportAuditLog): {
  readonly total: number;
  readonly executed: number;
  readonly refused: number;
  readonly dense: boolean;
} {
  let executed = 0;
  let refused = 0;
  for (const e of log.entries) {
    if (e.status === 'executed') executed += 1;
    else refused += 1;
  }
  return { total: log.entries.length, executed, refused, dense: verifySupportAuditDense(log) };
}

/** Status line. */
export function supportAuditStatusLine(log: SupportAuditLog): string {
  const c = supportAuditBoardCard(log);
  return `total=${c.total} executed=${c.executed} refused=${c.refused} dense=${c.dense ? '1' : '0'}`;
}
