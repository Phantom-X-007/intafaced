/**
 * Agents L3 — pure scanner result status catalog honesty (no invent markets).
 *
 * Status values: ok | empty | unavailable (with reasons).
 */

export const SCANNER_RESULT_STATUSES = ['ok', 'empty', 'unavailable'] as const;
export const SCANNER_UNAVAILABLE_REASONS = ['stale', 'no_quotes', 'invalid'] as const;

/** L3 — status catalog board. */
export function scannerStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly unavailableReasons: number;
  readonly inventsMarkets: number;
} {
  return {
    statuses: SCANNER_RESULT_STATUSES.length,
    unavailableReasons: SCANNER_UNAVAILABLE_REASONS.length,
    inventsMarkets: 0,
  };
}

/** L3 — status line. */
export function scannerStatusCatalogStatusLine(): string {
  const c = scannerStatusCatalogBoardCard();
  return `statuses=${c.statuses} unavailable_reasons=${c.unavailableReasons} invent=${c.inventsMarkets}`;
}

/** L3 — parse status. */
export function parseScannerStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly unavailableReasons: number;
  readonly invent: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) unavailable_reasons=(\d+) invent=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    unavailableReasons: Number(m[2]),
    invent: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function scannerStatusCatalogStatusLineMatches(): boolean {
  const p = parseScannerStatusCatalogStatusLine(scannerStatusCatalogStatusLine());
  if (!p) return false;
  const c = scannerStatusCatalogBoardCard();
  return p.statuses === c.statuses && p.unavailableReasons === c.unavailableReasons && p.invent === c.inventsMarkets;
}

/** L3 — never invent markets. */
export function scannerStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseScannerStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.invent === 0 && p.statuses === 3 && p.unavailableReasons === 3;
}

/** L3 — export header. */
export function scannerStatusCatalogExportHeader(): string {
  return 'status_or_reason';
}

/** L3 — export lines. */
export function scannerStatusCatalogExportLines(): readonly string[] {
  return [...SCANNER_RESULT_STATUSES, ...SCANNER_UNAVAILABLE_REASONS.map((r) => `unavailable:${r}`)];
}

/** L3 — full export. */
export function scannerStatusCatalogExportText(): string {
  return [scannerStatusCatalogExportHeader(), ...scannerStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredScannerStatus(status: string): boolean {
  return (SCANNER_RESULT_STATUSES as readonly string[]).includes(status);
}

/** L3 — unavailable reason declared. */
export function isDeclaredScannerUnavailableReason(reason: string): boolean {
  return (SCANNER_UNAVAILABLE_REASONS as readonly string[]).includes(reason);
}
