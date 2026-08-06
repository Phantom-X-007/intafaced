/**
 * Notify L3 — pure DispatchReport honesty boards (no I/O).
 *
 * Types mirror dispatch.ts outcomes. Kept separate so boards test without
 * loading channel registry / i18n.
 */

export type DispatchOutcomeStatus = 'accepted' | 'refused' | 'failed' | 'abandoned' | 'already_accepted';

export type DispatchOutcomeInput = {
  readonly channel: string;
  readonly status: DispatchOutcomeStatus;
  readonly code: string | null;
  readonly detail: string | null;
  readonly retryable: boolean;
};

export type DispatchReportInput = {
  readonly notificationId: string;
  readonly outcomes: readonly DispatchOutcomeInput[];
  readonly retry: boolean;
};

/** L3 — count outcomes by status. */
export function dispatchOutcomeCounts(report: DispatchReportInput): Readonly<Record<DispatchOutcomeStatus, number>> {
  const out: Record<DispatchOutcomeStatus, number> = {
    accepted: 0,
    refused: 0,
    failed: 0,
    abandoned: 0,
    already_accepted: 0,
  };
  for (const o of report.outcomes) {
    out[o.status] = (out[o.status] ?? 0) + 1;
  }
  return out;
}

/** L3 — board card. */
export function dispatchReportBoardCard(report: DispatchReportInput): {
  readonly notificationId: string;
  readonly total: number;
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
  readonly abandoned: number;
  readonly alreadyAccepted: number;
  readonly retry: boolean;
  readonly retryableCount: number;
} {
  const c = dispatchOutcomeCounts(report);
  return {
    notificationId: report.notificationId,
    total: report.outcomes.length,
    accepted: c.accepted,
    refused: c.refused,
    failed: c.failed,
    abandoned: c.abandoned,
    alreadyAccepted: c.already_accepted,
    retry: report.retry,
    retryableCount: report.outcomes.filter((o) => o.retryable).length,
  };
}

/** L3 — status line. */
export function dispatchReportStatusLine(report: DispatchReportInput): string {
  const c = dispatchReportBoardCard(report);
  return `total=${c.total} accepted=${c.accepted} refused=${c.refused} failed=${c.failed} retry=${c.retry ? '1' : '0'}`;
}

/** L3 — true when no outcomes. */
export function dispatchReportStatusLineIsEmpty(report: DispatchReportInput): boolean {
  return report.outcomes.length === 0;
}

/** L3 — parse status. Invalid → null. */
export function parseDispatchReportStatusLine(line: string): {
  readonly total: number;
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
  readonly retry: boolean;
} | null {
  const m = line.trim().match(/^total=(\d+) accepted=(\d+) refused=(\d+) failed=(\d+) retry=([01])$/);
  if (!m) return null;
  return {
    total: Number(m[1]),
    accepted: Number(m[2]),
    refused: Number(m[3]),
    failed: Number(m[4]),
    retry: m[5] === '1',
  };
}

/** L3 — true when status matches. */
export function dispatchReportStatusLineMatches(report: DispatchReportInput): boolean {
  const p = parseDispatchReportStatusLine(dispatchReportStatusLine(report));
  if (!p) return false;
  const c = dispatchReportBoardCard(report);
  return p.total === c.total && p.accepted === c.accepted && p.refused === c.refused && p.failed === c.failed && p.retry === c.retry;
}

/** L3 — true when accepted+refused+failed <= total (other statuses may fill). */
export function dispatchReportStatusLineConsistent(line: string): boolean {
  const p = parseDispatchReportStatusLine(line);
  if (!p) return false;
  return p.accepted + p.refused + p.failed <= p.total;
}

/** L3 — export header. */
export function dispatchReportExportHeader(): string {
  return 'notificationId,total,accepted,refused,failed,retry';
}

/** L3 — export line. */
export function dispatchReportExportLine(report: DispatchReportInput): string {
  const c = dispatchReportBoardCard(report);
  return `${c.notificationId},${c.total},${c.accepted},${c.refused},${c.failed},${c.retry ? '1' : '0'}`;
}

/** L3 — full export. */
export function dispatchReportExportText(report: DispatchReportInput): string {
  return [dispatchReportExportHeader(), dispatchReportExportLine(report)].join('\n');
}

/** L3 — true when accepted is within [min,max]. Invalid → false. */
export function dispatchAcceptedInRange(report: DispatchReportInput, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = dispatchReportBoardCard(report).accepted;
  return n >= min && n <= max;
}

/** L3 — true when any retryable outcome. */
export function dispatchHasRetryable(report: DispatchReportInput): boolean {
  return report.outcomes.some((o) => o.retryable);
}
