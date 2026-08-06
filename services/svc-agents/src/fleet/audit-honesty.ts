/**
 * Agents L3 — pure audit log honesty boards (no DB I/O).
 *
 * Shapes mirror audit.ts ActionKind / ActionStatus. Never invents cost.
 */

export const AUDIT_ACTION_KINDS = ['session_open', 'session_close', 'completion', 'embedding', 'tool_call', 'usage_settlement'] as const;
export type AuditActionKindId = (typeof AUDIT_ACTION_KINDS)[number];

export const AUDIT_ACTION_STATUSES = ['executed', 'refused', 'failed'] as const;
export type AuditActionStatusId = (typeof AUDIT_ACTION_STATUSES)[number];

export type AuditBoardEntry = {
  readonly kind: AuditActionKindId;
  readonly status: AuditActionStatusId;
  readonly tool: string | null;
};

/** L3 — status histogram. */
export function auditStatusHistogram(entries: readonly AuditBoardEntry[]): Readonly<Record<AuditActionStatusId, number>> {
  const out: Record<AuditActionStatusId, number> = { executed: 0, refused: 0, failed: 0 };
  for (const e of entries) out[e.status] += 1;
  return out;
}

/** L3 — kind histogram. */
export function auditKindHistogram(entries: readonly AuditBoardEntry[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const e of entries) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}

/** L3 — board card. */
export function auditLogBoardCard(entries: readonly AuditBoardEntry[]): {
  readonly entries: number;
  readonly executed: number;
  readonly refused: number;
  readonly failed: number;
  readonly toolCalls: number;
} {
  const h = auditStatusHistogram(entries);
  return {
    entries: entries.length,
    executed: h.executed,
    refused: h.refused,
    failed: h.failed,
    toolCalls: entries.filter((e) => e.kind === 'tool_call').length,
  };
}

/** L3 — status line. */
export function auditLogStatusLine(entries: readonly AuditBoardEntry[]): string {
  const c = auditLogBoardCard(entries);
  return `entries=${c.entries} executed=${c.executed} refused=${c.refused} failed=${c.failed} tool_calls=${c.toolCalls}`;
}

/** L3 — parse status. Invalid → null. */
export function parseAuditLogStatusLine(line: string): {
  readonly entries: number;
  readonly executed: number;
  readonly refused: number;
  readonly failed: number;
  readonly toolCalls: number;
} | null {
  const m = line.trim().match(/^entries=(\d+) executed=(\d+) refused=(\d+) failed=(\d+) tool_calls=(\d+)$/);
  if (!m) return null;
  return {
    entries: Number(m[1]),
    executed: Number(m[2]),
    refused: Number(m[3]),
    failed: Number(m[4]),
    toolCalls: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function auditLogStatusLineMatches(entries: readonly AuditBoardEntry[]): boolean {
  const p = parseAuditLogStatusLine(auditLogStatusLine(entries));
  if (!p) return false;
  const c = auditLogBoardCard(entries);
  return (
    p.entries === c.entries && p.executed === c.executed && p.refused === c.refused && p.failed === c.failed && p.toolCalls === c.toolCalls
  );
}

/** L3 — true when executed+refused+failed equals entries. */
export function auditLogStatusLineConsistent(line: string): boolean {
  const p = parseAuditLogStatusLine(line);
  if (!p) return false;
  return p.entries === p.executed + p.refused + p.failed && p.toolCalls <= p.entries;
}

/** L3 — export header. */
export function auditLogExportHeader(): string {
  return 'entries,executed,refused,failed,tool_calls';
}

/** L3 — export line. */
export function auditLogExportLine(entries: readonly AuditBoardEntry[]): string {
  const c = auditLogBoardCard(entries);
  return `${c.entries},${c.executed},${c.refused},${c.failed},${c.toolCalls}`;
}

/** L3 — full export. */
export function auditLogExportText(entries: readonly AuditBoardEntry[]): string {
  return [auditLogExportHeader(), auditLogExportLine(entries)].join('\n');
}

/** L3 — catalog sizes. */
export function auditCatalogBoardCard(): {
  readonly kinds: number;
  readonly statuses: number;
} {
  return { kinds: AUDIT_ACTION_KINDS.length, statuses: AUDIT_ACTION_STATUSES.length };
}

/** L3 — catalog status line. */
export function auditCatalogStatusLine(): string {
  const c = auditCatalogBoardCard();
  return `kinds=${c.kinds} statuses=${c.statuses}`;
}

/** L3 — parse catalog. */
export function parseAuditCatalogStatusLine(line: string): { readonly kinds: number; readonly statuses: number } | null {
  const m = line.trim().match(/^kinds=(\d+) statuses=(\d+)$/);
  if (!m) return null;
  return { kinds: Number(m[1]), statuses: Number(m[2]) };
}

/** L3 — true when catalog matches. */
export function auditCatalogStatusLineMatches(): boolean {
  const p = parseAuditCatalogStatusLine(auditCatalogStatusLine());
  if (!p) return false;
  const c = auditCatalogBoardCard();
  return p.kinds === c.kinds && p.statuses === c.statuses;
}

/** L3 — count in range. */
export function auditEntryCountInRange(entries: readonly AuditBoardEntry[], min: number, max: number): boolean {
  if (min > max) return false;
  const n = entries.length;
  return n >= min && n <= max;
}
