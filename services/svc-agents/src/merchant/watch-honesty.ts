/**
 * Agents L3 — pure merchant watch result honesty boards (no pay I/O).
 *
 * Shapes mirror watch.ts WatchResult / MerchantAlert. Never invents rates.
 */

export type MerchantAlertInput = {
  readonly railId: string;
  readonly approvalRate: string;
  readonly attempts: number;
  readonly threshold: string;
  readonly kind: 'below_threshold';
};

export type WatchResultInput =
  | {
      readonly status: 'ok';
      readonly considered: number;
      readonly skippedStale: number;
      readonly skippedIncomplete: number;
      readonly alerts: readonly MerchantAlertInput[];
    }
  | { readonly status: 'empty' }
  | { readonly status: 'unavailable'; readonly reason: 'stale' | 'no_metrics' | 'pay_plane_dark' };

/** L3 — alert count on ok result; 0 on empty/unavailable. */
export function watchAlertCount(result: WatchResultInput): number {
  return result.status === 'ok' ? result.alerts.length : 0;
}

/** L3 — board card. */
export function watchResultBoardCard(result: WatchResultInput): {
  readonly status: string;
  readonly alerts: number;
  readonly considered: number;
  readonly skippedStale: number;
  readonly skippedIncomplete: number;
  readonly reason: string;
} {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      alerts: result.alerts.length,
      considered: result.considered,
      skippedStale: result.skippedStale,
      skippedIncomplete: result.skippedIncomplete,
      reason: '-',
    };
  }
  if (result.status === 'empty') {
    return { status: 'empty', alerts: 0, considered: 0, skippedStale: 0, skippedIncomplete: 0, reason: '-' };
  }
  return {
    status: 'unavailable',
    alerts: 0,
    considered: 0,
    skippedStale: 0,
    skippedIncomplete: 0,
    reason: result.reason,
  };
}

/** L3 — status line. */
export function watchResultStatusLine(result: WatchResultInput): string {
  const c = watchResultBoardCard(result);
  return `status=${c.status} alerts=${c.alerts} considered=${c.considered} stale=${c.skippedStale} incomplete=${c.skippedIncomplete} reason=${c.reason}`;
}

/** L3 — parse status. Invalid → null. */
export function parseWatchResultStatusLine(line: string): {
  readonly status: string;
  readonly alerts: number;
  readonly considered: number;
  readonly stale: number;
  readonly incomplete: number;
  readonly reason: string;
} | null {
  const m = line
    .trim()
    .match(/^status=(ok|empty|unavailable) alerts=(\d+) considered=(\d+) stale=(\d+) incomplete=(\d+) reason=([a-z0-9_-]+)$/);
  if (!m) return null;
  return {
    status: m[1]!,
    alerts: Number(m[2]),
    considered: Number(m[3]),
    stale: Number(m[4]),
    incomplete: Number(m[5]),
    reason: m[6]!,
  };
}

/** L3 — true when status matches board. */
export function watchResultStatusLineMatches(result: WatchResultInput): boolean {
  const p = parseWatchResultStatusLine(watchResultStatusLine(result));
  if (!p) return false;
  const c = watchResultBoardCard(result);
  return (
    p.status === c.status &&
    p.alerts === c.alerts &&
    p.considered === c.considered &&
    p.stale === c.skippedStale &&
    p.incomplete === c.skippedIncomplete &&
    p.reason === c.reason
  );
}

/** L3 — true when non-ok has zero alerts. */
export function watchResultStatusLineConsistent(line: string): boolean {
  const p = parseWatchResultStatusLine(line);
  if (!p) return false;
  if (p.status !== 'ok') return p.alerts === 0 && p.considered === 0;
  return true;
}

/** L3 — export header. */
export function watchResultExportHeader(): string {
  return 'status,alerts,considered,stale,incomplete,reason';
}

/** L3 — export line. */
export function watchResultExportLine(result: WatchResultInput): string {
  const c = watchResultBoardCard(result);
  return `${c.status},${c.alerts},${c.considered},${c.skippedStale},${c.skippedIncomplete},${c.reason}`;
}

/** L3 — full export. */
export function watchResultExportText(result: WatchResultInput): string {
  return [watchResultExportHeader(), watchResultExportLine(result)].join('\n');
}

/** L3 — true when ok result has no alerts. */
export function watchHasNoAlerts(result: WatchResultInput): boolean {
  return watchAlertCount(result) === 0;
}

/** L3 — alert count in inclusive range. */
export function watchAlertCountInRange(result: WatchResultInput, min: number, max: number): boolean {
  if (min > max) return false;
  const n = watchAlertCount(result);
  return n >= min && n <= max;
}

/** L3 — money-write refuse catalog size (mirror guardrail list). */
export const MERCHANT_MONEY_WRITE_TOOL_IDS = [
  'ledger.post',
  'ledger.hold',
  'pay.refund',
  'pay.capture',
  'pay.route.change',
  'bank.transfer',
  'trade.order',
  'p2p.release',
] as const;

/** L3 — catalog board. */
export function moneyWriteRefuseBoardCard(): {
  readonly tools: number;
  readonly hasLedgerPost: boolean;
  readonly hasPayRefund: boolean;
} {
  const tools = MERCHANT_MONEY_WRITE_TOOL_IDS;
  return {
    tools: tools.length,
    hasLedgerPost: tools.includes('ledger.post'),
    hasPayRefund: tools.includes('pay.refund'),
  };
}

/** L3 — money-write catalog status line. */
export function moneyWriteRefuseStatusLine(): string {
  const c = moneyWriteRefuseBoardCard();
  return `money_write_tools=${c.tools} ledger_post=${c.hasLedgerPost ? 1 : 0} pay_refund=${c.hasPayRefund ? 1 : 0}`;
}

/** L3 — parse money-write status. */
export function parseMoneyWriteRefuseStatusLine(
  line: string,
): { readonly tools: number; readonly ledgerPost: number; readonly payRefund: number } | null {
  const m = line.trim().match(/^money_write_tools=(\d+) ledger_post=([01]) pay_refund=([01])$/);
  if (!m) return null;
  return { tools: Number(m[1]), ledgerPost: Number(m[2]), payRefund: Number(m[3]) };
}

/** L3 — true when status matches catalog. */
export function moneyWriteRefuseStatusLineMatches(): boolean {
  const p = parseMoneyWriteRefuseStatusLine(moneyWriteRefuseStatusLine());
  if (!p) return false;
  const c = moneyWriteRefuseBoardCard();
  return p.tools === c.tools && p.ledgerPost === (c.hasLedgerPost ? 1 : 0) && p.payRefund === (c.hasPayRefund ? 1 : 0);
}
