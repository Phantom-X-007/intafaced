/**
 * Notify L3 — pure SubscriptionReport honesty boards (no bus I/O).
 *
 * Shapes mirror events.ts pending consumers / subscription report.
 */

export type PendingConsumerInput = {
  readonly event: string;
  readonly subject: string;
  readonly durable: string;
  readonly reason: string;
  readonly socket: string | null;
};

export type SubscriptionReportInput = {
  readonly subscriptionCount: number;
  readonly pending: readonly PendingConsumerInput[];
};

/** L3 — pending with declared socket vs undeclared (null socket). */
export function pendingSocketSplit(report: SubscriptionReportInput): {
  readonly declared: number;
  readonly undeclared: number;
} {
  let declared = 0;
  let undeclared = 0;
  for (const p of report.pending) {
    if (p.socket == null) undeclared += 1;
    else declared += 1;
  }
  return { declared, undeclared };
}

/** L3 — board card. */
export function subscriptionReportBoardCard(report: SubscriptionReportInput): {
  readonly subscriptions: number;
  readonly pending: number;
  readonly declared: number;
  readonly undeclared: number;
} {
  const split = pendingSocketSplit(report);
  return {
    subscriptions: report.subscriptionCount,
    pending: report.pending.length,
    declared: split.declared,
    undeclared: split.undeclared,
  };
}

/** L3 — status line. */
export function subscriptionReportStatusLine(report: SubscriptionReportInput): string {
  const c = subscriptionReportBoardCard(report);
  return `subs=${c.subscriptions} pending=${c.pending} declared=${c.declared} undeclared=${c.undeclared}`;
}

/** L3 — parse status. Invalid → null. */
export function parseSubscriptionReportStatusLine(
  line: string,
): { readonly subs: number; readonly pending: number; readonly declared: number; readonly undeclared: number } | null {
  const m = line.trim().match(/^subs=(\d+) pending=(\d+) declared=(\d+) undeclared=(\d+)$/);
  if (!m) return null;
  return {
    subs: Number(m[1]),
    pending: Number(m[2]),
    declared: Number(m[3]),
    undeclared: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function subscriptionReportStatusLineMatches(report: SubscriptionReportInput): boolean {
  const p = parseSubscriptionReportStatusLine(subscriptionReportStatusLine(report));
  if (!p) return false;
  const c = subscriptionReportBoardCard(report);
  return p.subs === c.subscriptions && p.pending === c.pending && p.declared === c.declared && p.undeclared === c.undeclared;
}

/** L3 — true when declared+undeclared equals pending. */
export function subscriptionReportStatusLineConsistent(line: string): boolean {
  const p = parseSubscriptionReportStatusLine(line);
  if (!p) return false;
  return p.pending === p.declared + p.undeclared;
}

/** L3 — export header. */
export function subscriptionReportExportHeader(): string {
  return 'subscriptions,pending,declared,undeclared';
}

/** L3 — export line. */
export function subscriptionReportExportLine(report: SubscriptionReportInput): string {
  const c = subscriptionReportBoardCard(report);
  return `${c.subscriptions},${c.pending},${c.declared},${c.undeclared}`;
}

/** L3 — full export. */
export function subscriptionReportExportText(report: SubscriptionReportInput): string {
  return [subscriptionReportExportHeader(), subscriptionReportExportLine(report)].join('\n');
}

/** L3 — true when no undeclared pending (socket always named). */
export function subscriptionHasNoUndeclared(report: SubscriptionReportInput): boolean {
  return pendingSocketSplit(report).undeclared === 0;
}

/** L3 — true when pending count is within [min,max]. Invalid → false. */
export function pendingCountInRange(report: SubscriptionReportInput, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = report.pending.length;
  return n >= min && n <= max;
}
