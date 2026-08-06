/**
 * Agents L3 — pure scanner rank result honesty boards (no market invent).
 *
 * Shapes mirror rank.ts rankFixtures results. Never invents quotes.
 */

export type ScannerSignalInput = {
  readonly marketId: string;
  readonly score: string;
};

export type ScannerRankResultInput =
  | {
      readonly status: 'ok';
      readonly signals: readonly ScannerSignalInput[];
      readonly skippedIncomplete: number;
      readonly skippedStale: number;
    }
  | { readonly status: 'empty' }
  | { readonly status: 'unavailable'; readonly reason: 'stale' | 'no_quotes' | 'invalid' };

/** L3 — board card. */
export function scannerRankBoardCard(result: ScannerRankResultInput): {
  readonly status: string;
  readonly signals: number;
  readonly skippedIncomplete: number;
  readonly skippedStale: number;
  readonly reason: string;
} {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      signals: result.signals.length,
      skippedIncomplete: result.skippedIncomplete,
      skippedStale: result.skippedStale,
      reason: '-',
    };
  }
  if (result.status === 'empty') {
    return {
      status: 'empty',
      signals: 0,
      skippedIncomplete: 0,
      skippedStale: 0,
      reason: '-',
    };
  }
  return {
    status: 'unavailable',
    signals: 0,
    skippedIncomplete: 0,
    skippedStale: 0,
    reason: result.reason,
  };
}

/** L3 — status line. */
export function scannerRankStatusLine(result: ScannerRankResultInput): string {
  const c = scannerRankBoardCard(result);
  return `status=${c.status} signals=${c.signals} incomplete=${c.skippedIncomplete} stale=${c.skippedStale} reason=${c.reason}`;
}

/** L3 — parse status. */
export function parseScannerRankStatusLine(line: string): {
  readonly status: string;
  readonly signals: number;
  readonly incomplete: number;
  readonly stale: number;
  readonly reason: string;
} | null {
  const m = line
    .trim()
    .match(
      /^status=(ok|empty|unavailable) signals=(\d+) incomplete=(\d+) stale=(\d+) reason=([a-z0-9_-]+)$/,
    );
  if (!m) return null;
  return {
    status: m[1]!,
    signals: Number(m[2]),
    incomplete: Number(m[3]),
    stale: Number(m[4]),
    reason: m[5]!,
  };
}

/** L3 — true when status matches. */
export function scannerRankStatusLineMatches(result: ScannerRankResultInput): boolean {
  const p = parseScannerRankStatusLine(scannerRankStatusLine(result));
  if (!p) return false;
  const c = scannerRankBoardCard(result);
  return (
    p.status === c.status &&
    p.signals === c.signals &&
    p.incomplete === c.skippedIncomplete &&
    p.stale === c.skippedStale &&
    p.reason === c.reason
  );
}

/** L3 — non-ok has zero signals. */
export function scannerRankStatusLineConsistent(line: string): boolean {
  const p = parseScannerRankStatusLine(line);
  if (!p) return false;
  if (p.status !== 'ok') return p.signals === 0;
  return true;
}

/** L3 — export header. */
export function scannerRankExportHeader(): string {
  return 'status,signals,incomplete,stale,reason';
}

/** L3 — export line. */
export function scannerRankExportLine(result: ScannerRankResultInput): string {
  const c = scannerRankBoardCard(result);
  return `${c.status},${c.signals},${c.skippedIncomplete},${c.skippedStale},${c.reason}`;
}

/** L3 — full export. */
export function scannerRankExportText(result: ScannerRankResultInput): string {
  return [scannerRankExportHeader(), scannerRankExportLine(result)].join('\n');
}

/** L3 — empty invent check. */
export function scannerRankIsEmpty(result: ScannerRankResultInput): boolean {
  return result.status === 'empty';
}

/** L3 — signal count in range. */
export function scannerSignalCountInRange(
  result: ScannerRankResultInput,
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = scannerRankBoardCard(result).signals;
  return n >= min && n <= max;
}
