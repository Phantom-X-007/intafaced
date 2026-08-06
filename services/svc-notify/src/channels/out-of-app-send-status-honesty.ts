/**
 * Notify L3 — pure out-of-app send attempt status catalog honesty.
 *
 * Mirrors router out-of-app attempt status: sent | refused | failed.
 * Complements delivery-status (row lifecycle). Does not invent gateway I/O.
 */

export const OUT_OF_APP_SEND_STATUSES = ['sent', 'refused', 'failed'] as const;
export type OutOfAppSendStatusId = (typeof OUT_OF_APP_SEND_STATUSES)[number];

/** L3 — catalog board. */
export function outOfAppSendStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasSent: number;
  readonly hasRefused: number;
  readonly hasFailed: number;
} {
  return {
    statuses: OUT_OF_APP_SEND_STATUSES.length,
    hasSent: OUT_OF_APP_SEND_STATUSES.includes('sent') ? 1 : 0,
    hasRefused: OUT_OF_APP_SEND_STATUSES.includes('refused') ? 1 : 0,
    hasFailed: OUT_OF_APP_SEND_STATUSES.includes('failed') ? 1 : 0,
  };
}

/** L3 — status line. */
export function outOfAppSendStatusCatalogStatusLine(): string {
  const c = outOfAppSendStatusCatalogBoardCard();
  return `statuses=${c.statuses} sent=${c.hasSent} refused=${c.hasRefused} failed=${c.hasFailed}`;
}

/** L3 — parse status. */
export function parseOutOfAppSendStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly sent: number;
  readonly refused: number;
  readonly failed: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) sent=([01]) refused=([01]) failed=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    sent: Number(m[2]),
    refused: Number(m[3]),
    failed: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function outOfAppSendStatusCatalogStatusLineMatches(): boolean {
  const p = parseOutOfAppSendStatusCatalogStatusLine(outOfAppSendStatusCatalogStatusLine());
  if (!p) return false;
  const c = outOfAppSendStatusCatalogBoardCard();
  return p.statuses === c.statuses && p.sent === c.hasSent && p.refused === c.hasRefused && p.failed === c.hasFailed;
}

/** L3 — three statuses. */
export function outOfAppSendStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOutOfAppSendStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 3 && p.sent === 1 && p.refused === 1 && p.failed === 1;
}

/** L3 — export header. */
export function outOfAppSendStatusCatalogExportHeader(): string {
  return 'status';
}

/** L3 — export lines. */
export function outOfAppSendStatusCatalogExportLines(): readonly string[] {
  return [...OUT_OF_APP_SEND_STATUSES];
}

/** L3 — full export. */
export function outOfAppSendStatusCatalogExportText(): string {
  return [outOfAppSendStatusCatalogExportHeader(), ...outOfAppSendStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredOutOfAppSendStatus(status: string): boolean {
  return (OUT_OF_APP_SEND_STATUSES as readonly string[]).includes(status);
}
