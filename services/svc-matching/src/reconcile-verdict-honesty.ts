/**
 * Matching L3 — pure reconcile-verdict catalog honesty (structural only).
 *
 * Mirrors reconcile.ts ReconcileVerdict: clean | auto | refuse.
 * Does not invent money repair amounts or ledger moves.
 */

export const RECONCILE_VERDICTS = ['clean', 'auto', 'refuse'] as const;
export type ReconcileVerdictId = (typeof RECONCILE_VERDICTS)[number];

/** L3 — catalog board. */
export function reconcileVerdictCatalogBoardCard(): {
  readonly verdicts: number;
  readonly hasClean: number;
  readonly hasAuto: number;
  readonly hasRefuse: number;
} {
  return {
    verdicts: RECONCILE_VERDICTS.length,
    hasClean: RECONCILE_VERDICTS.includes('clean') ? 1 : 0,
    hasAuto: RECONCILE_VERDICTS.includes('auto') ? 1 : 0,
    hasRefuse: RECONCILE_VERDICTS.includes('refuse') ? 1 : 0,
  };
}

/** L3 — status line. */
export function reconcileVerdictCatalogStatusLine(): string {
  const c = reconcileVerdictCatalogBoardCard();
  return `verdicts=${c.verdicts} clean=${c.hasClean} auto=${c.hasAuto} refuse=${c.hasRefuse}`;
}

/** L3 — parse status. */
export function parseReconcileVerdictCatalogStatusLine(line: string): {
  readonly verdicts: number;
  readonly clean: number;
  readonly auto: number;
  readonly refuse: number;
} | null {
  const m = line.trim().match(/^verdicts=(\d+) clean=([01]) auto=([01]) refuse=([01])$/);
  if (!m) return null;
  return {
    verdicts: Number(m[1]),
    clean: Number(m[2]),
    auto: Number(m[3]),
    refuse: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function reconcileVerdictCatalogStatusLineMatches(): boolean {
  const p = parseReconcileVerdictCatalogStatusLine(reconcileVerdictCatalogStatusLine());
  if (!p) return false;
  const c = reconcileVerdictCatalogBoardCard();
  return p.verdicts === c.verdicts && p.clean === c.hasClean && p.auto === c.hasAuto && p.refuse === c.hasRefuse;
}

/** L3 — three verdicts; refuse present (fails closed). */
export function reconcileVerdictCatalogStatusLineConsistent(line: string): boolean {
  const p = parseReconcileVerdictCatalogStatusLine(line);
  if (!p) return false;
  return p.verdicts === 3 && p.clean === 1 && p.auto === 1 && p.refuse === 1;
}

/** L3 — export header. */
export function reconcileVerdictCatalogExportHeader(): string {
  return 'reconcile_verdict';
}

/** L3 — export lines. */
export function reconcileVerdictCatalogExportLines(): readonly string[] {
  return [...RECONCILE_VERDICTS];
}

/** L3 — full export. */
export function reconcileVerdictCatalogExportText(): string {
  return [reconcileVerdictCatalogExportHeader(), ...reconcileVerdictCatalogExportLines()].join('\n');
}

/** L3 — verdict declared. */
export function isDeclaredReconcileVerdict(v: string): boolean {
  return (RECONCILE_VERDICTS as readonly string[]).includes(v);
}
