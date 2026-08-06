/**
 * Academy L3 — pure paper drill refuse-reason catalog honesty (no invent fills).
 *
 * Reasons mirror workbook-loop.ts refuseReason.
 */

export const DRILL_REFUSE_REASONS = ['not_paper', 'no_market', 'unknown_step', 'bad_fill'] as const;
export type DrillRefuseReasonId = (typeof DRILL_REFUSE_REASONS)[number];

export type DrillResultBoardInput =
  { readonly status: 'active' | 'complete' } | { readonly status: 'refused'; readonly reason: DrillRefuseReasonId };

/** L3 — refuse catalog board. */
export function drillRefuseCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasNotPaper: number;
  readonly hasBadFill: number;
} {
  return {
    reasons: DRILL_REFUSE_REASONS.length,
    hasNotPaper: DRILL_REFUSE_REASONS.includes('not_paper') ? 1 : 0,
    hasBadFill: DRILL_REFUSE_REASONS.includes('bad_fill') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function drillRefuseCatalogStatusLine(): string {
  const c = drillRefuseCatalogBoardCard();
  return `reasons=${c.reasons} not_paper=${c.hasNotPaper} bad_fill=${c.hasBadFill}`;
}

/** L3 — parse catalog. */
export function parseDrillRefuseCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly notPaper: number;
  readonly badFill: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) not_paper=([01]) bad_fill=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    notPaper: Number(m[2]),
    badFill: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function drillRefuseCatalogStatusLineMatches(): boolean {
  const p = parseDrillRefuseCatalogStatusLine(drillRefuseCatalogStatusLine());
  if (!p) return false;
  const c = drillRefuseCatalogBoardCard();
  return p.reasons === c.reasons && p.notPaper === c.hasNotPaper && p.badFill === c.hasBadFill;
}

/** L3 — result board. */
export function drillResultBoardCard(result: DrillResultBoardInput): {
  readonly status: string;
  readonly reason: string;
  readonly refused: number;
} {
  if (result.status === 'refused') {
    return { status: 'refused', reason: result.reason, refused: 1 };
  }
  return { status: result.status, reason: '-', refused: 0 };
}

/** L3 — result status line. */
export function drillResultStatusLine(result: DrillResultBoardInput): string {
  const c = drillResultBoardCard(result);
  return `status=${c.status} reason=${c.reason} refused=${c.refused}`;
}

/** L3 — parse result. */
export function parseDrillResultStatusLine(line: string): {
  readonly status: string;
  readonly reason: string;
  readonly refused: number;
} | null {
  const m = line.trim().match(/^status=(active|complete|refused) reason=([a-z0-9_-]+) refused=([01])$/);
  if (!m) return null;
  return {
    status: m[1]!,
    reason: m[2]!,
    refused: Number(m[3]),
  };
}

/** L3 — true when result status matches. */
export function drillResultStatusLineMatches(result: DrillResultBoardInput): boolean {
  const p = parseDrillResultStatusLine(drillResultStatusLine(result));
  if (!p) return false;
  const c = drillResultBoardCard(result);
  return p.status === c.status && p.reason === c.reason && p.refused === c.refused;
}

/** L3 — refused flag matches status. */
export function drillResultStatusLineConsistent(line: string): boolean {
  const p = parseDrillResultStatusLine(line);
  if (!p) return false;
  return p.refused === (p.status === 'refused' ? 1 : 0);
}

/** L3 — export header. */
export function drillResultExportHeader(): string {
  return 'status,reason,refused';
}

/** L3 — export line. */
export function drillResultExportLine(result: DrillResultBoardInput): string {
  const c = drillResultBoardCard(result);
  return `${c.status},${c.reason},${c.refused}`;
}

/** L3 — full export. */
export function drillResultExportText(result: DrillResultBoardInput): string {
  return [drillResultExportHeader(), drillResultExportLine(result)].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredDrillRefuseReason(reason: string): boolean {
  return (DRILL_REFUSE_REASONS as readonly string[]).includes(reason);
}
