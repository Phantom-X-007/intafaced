/**
 * Agents L3 — pure copy-intel result status catalog honesty (no invent PnL).
 *
 * Status: ok | empty | unavailable (with reasons).
 */

export const INTEL_RESULT_STATUSES = ['ok', 'empty', 'unavailable'] as const;
export const INTEL_UNAVAILABLE_REASONS = ['no_data', 'invalid_window', 'copy_plane_dark'] as const;

/** L3 — catalog board. */
export function intelStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly unavailableReasons: number;
  readonly inventsPnl: number;
} {
  return {
    statuses: INTEL_RESULT_STATUSES.length,
    unavailableReasons: INTEL_UNAVAILABLE_REASONS.length,
    inventsPnl: 0,
  };
}

/** L3 — status line. */
export function intelStatusCatalogStatusLine(): string {
  const c = intelStatusCatalogBoardCard();
  return `statuses=${c.statuses} unavailable_reasons=${c.unavailableReasons} invent_pnl=${c.inventsPnl}`;
}

/** L3 — parse status. */
export function parseIntelStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly unavailableReasons: number;
  readonly inventPnl: number;
} | null {
  const m = line
    .trim()
    .match(/^statuses=(\d+) unavailable_reasons=(\d+) invent_pnl=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    unavailableReasons: Number(m[2]),
    inventPnl: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function intelStatusCatalogStatusLineMatches(): boolean {
  const p = parseIntelStatusCatalogStatusLine(intelStatusCatalogStatusLine());
  if (!p) return false;
  const c = intelStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.unavailableReasons === c.unavailableReasons &&
    p.inventPnl === c.inventsPnl
  );
}

/** L3 — never invent PnL. */
export function intelStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseIntelStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.inventPnl === 0 && p.statuses === 3 && p.unavailableReasons === 3;
}

/** L3 — export header. */
export function intelStatusCatalogExportHeader(): string {
  return 'status_or_reason';
}

/** L3 — export lines. */
export function intelStatusCatalogExportLines(): readonly string[] {
  return [
    ...INTEL_RESULT_STATUSES,
    ...INTEL_UNAVAILABLE_REASONS.map((r) => `unavailable:${r}`),
  ];
}

/** L3 — full export. */
export function intelStatusCatalogExportText(): string {
  return [intelStatusCatalogExportHeader(), ...intelStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredIntelStatus(status: string): boolean {
  return (INTEL_RESULT_STATUSES as readonly string[]).includes(status);
}

/** L3 — unavailable reason declared. */
export function isDeclaredIntelUnavailableReason(reason: string): boolean {
  return (INTEL_UNAVAILABLE_REASONS as readonly string[]).includes(reason);
}
