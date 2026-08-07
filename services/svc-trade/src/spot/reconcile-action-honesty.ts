/**
 * Trade L3 — pure reconcile-action catalog honesty (structural only).
 *
 * Mirrors types.ts ReconcileAction: deleted | released | fail_closed | none.
 * Does not invent money repair amounts.
 */

export const RECONCILE_ACTIONS = ['deleted', 'released', 'fail_closed', 'none'] as const;
export type ReconcileActionId = (typeof RECONCILE_ACTIONS)[number];

/** L3 — catalog board. */
export function reconcileActionCatalogBoardCard(): {
  readonly actions: number;
  readonly hasDeleted: number;
  readonly hasReleased: number;
  readonly hasFailClosed: number;
  readonly hasNone: number;
} {
  return {
    actions: RECONCILE_ACTIONS.length,
    hasDeleted: RECONCILE_ACTIONS.includes('deleted') ? 1 : 0,
    hasReleased: RECONCILE_ACTIONS.includes('released') ? 1 : 0,
    hasFailClosed: RECONCILE_ACTIONS.includes('fail_closed') ? 1 : 0,
    hasNone: RECONCILE_ACTIONS.includes('none') ? 1 : 0,
  };
}

/** L3 — status line. */
export function reconcileActionCatalogStatusLine(): string {
  const c = reconcileActionCatalogBoardCard();
  return `actions=${c.actions} deleted=${c.hasDeleted} released=${c.hasReleased} fail_closed=${c.hasFailClosed} none=${c.hasNone}`;
}

/** L3 — parse status. */
export function parseReconcileActionCatalogStatusLine(line: string): {
  readonly actions: number;
  readonly deleted: number;
  readonly released: number;
  readonly failClosed: number;
  readonly none: number;
} | null {
  const m = line.trim().match(/^actions=(\d+) deleted=([01]) released=([01]) fail_closed=([01]) none=([01])$/);
  if (!m) return null;
  return {
    actions: Number(m[1]),
    deleted: Number(m[2]),
    released: Number(m[3]),
    failClosed: Number(m[4]),
    none: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function reconcileActionCatalogStatusLineMatches(): boolean {
  const p = parseReconcileActionCatalogStatusLine(reconcileActionCatalogStatusLine());
  if (!p) return false;
  const c = reconcileActionCatalogBoardCard();
  return (
    p.actions === c.actions &&
    p.deleted === c.hasDeleted &&
    p.released === c.hasReleased &&
    p.failClosed === c.hasFailClosed &&
    p.none === c.hasNone
  );
}

/** L3 — four actions; fail_closed present. */
export function reconcileActionCatalogStatusLineConsistent(line: string): boolean {
  const p = parseReconcileActionCatalogStatusLine(line);
  if (!p) return false;
  return p.actions === 4 && p.deleted === 1 && p.released === 1 && p.failClosed === 1 && p.none === 1;
}

/** L3 — export header. */
export function reconcileActionCatalogExportHeader(): string {
  return 'reconcile_action';
}

/** L3 — export lines. */
export function reconcileActionCatalogExportLines(): readonly string[] {
  return [...RECONCILE_ACTIONS];
}

/** L3 — full export. */
export function reconcileActionCatalogExportText(): string {
  return [reconcileActionCatalogExportHeader(), ...reconcileActionCatalogExportLines()].join('\n');
}

/** L3 — action declared. */
export function isDeclaredReconcileAction(a: string): boolean {
  return (RECONCILE_ACTIONS as readonly string[]).includes(a);
}
