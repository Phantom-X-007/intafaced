/**
 * Navigator Stage-2 — audit log of user-affecting actions.
 *
 * Spec: docs/ops/trk/agents.navigator.md Stage 2 + Agentic Law §8.2.
 *
 * Pure append-only buffer for navigator data-tool outcomes (executed + refused).
 * Fleet `AuditLog` still owns the durable DB chain; this plane records the
 * product-facing trail for grounded tool calls before a live session is wired
 * in Stage-3. Refusals are logged with the same ceremony as successes.
 */

import type { CopyKey } from '../copy.js';
import type { DataToolResult } from './data-tools.js';

export type NavigatorAuditStatus = 'executed' | 'refused';

export type NavigatorAuditEntry = {
  readonly sequence: number;
  readonly kind: 'tool_call';
  readonly status: NavigatorAuditStatus;
  readonly tool: string;
  readonly reason: string | null;
  readonly userMessageKey: CopyKey;
  readonly occurredAt: string;
};

export type NavigatorAuditLog = {
  readonly entries: readonly NavigatorAuditEntry[];
};

/**
 * Append one user-affecting navigator action. Sequence is dense from 0.
 */
export function appendNavigatorAudit(
  log: NavigatorAuditLog,
  entry: {
    status: NavigatorAuditStatus;
    tool: string;
    reason?: string | null;
    userMessageKey: CopyKey;
    occurredAt: string;
  },
): NavigatorAuditLog {
  const sequence = log.entries.length;
  const next: NavigatorAuditEntry = {
    sequence,
    kind: 'tool_call',
    status: entry.status,
    tool: entry.tool,
    reason: entry.reason ?? null,
    userMessageKey: entry.userMessageKey,
    occurredAt: entry.occurredAt,
  };
  return { entries: [...log.entries, next] };
}

/** Empty log. */
export function emptyNavigatorAuditLog(): NavigatorAuditLog {
  return { entries: [] };
}

/**
 * Record a data-tool result as a user-affecting audit row.
 */
export function auditNavigatorDataTool(log: NavigatorAuditLog, result: DataToolResult, occurredAt: string): NavigatorAuditLog {
  if (result.status === 'ok') {
    return appendNavigatorAudit(log, {
      status: 'executed',
      tool: result.tool,
      reason: null,
      userMessageKey: 'agents.action.executed',
      occurredAt,
    });
  }
  return appendNavigatorAudit(log, {
    status: 'refused',
    tool: result.tool,
    reason: result.reason,
    userMessageKey: result.userMessageKey,
    occurredAt,
  });
}

/** Dense sequence check (0..n-1). */
export function verifyNavigatorAuditDense(log: NavigatorAuditLog): boolean {
  for (let i = 0; i < log.entries.length; i += 1) {
    if (log.entries[i]!.sequence !== i) return false;
  }
  return true;
}

/** Board card. */
export function navigatorAuditBoardCard(log: NavigatorAuditLog): {
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
  return {
    total: log.entries.length,
    executed,
    refused,
    dense: verifyNavigatorAuditDense(log),
  };
}

/** Status line. */
export function navigatorAuditStatusLine(log: NavigatorAuditLog): string {
  const c = navigatorAuditBoardCard(log);
  return `total=${c.total} executed=${c.executed} refused=${c.refused} dense=${c.dense ? '1' : '0'}`;
}
