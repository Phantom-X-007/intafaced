/**
 * Edge L3 — pure kill-switch reason catalog honesty (structural only).
 *
 * Mirrors kill-switch.ts KillReason: not-killed | read-only | lets-the-user-out |
 * module-killed | no-route | undecidable.
 * Does not invent kill policy or money rules.
 */

export const KILL_REASONS = ['not-killed', 'read-only', 'lets-the-user-out', 'module-killed', 'no-route', 'undecidable'] as const;
export type KillReasonId = (typeof KILL_REASONS)[number];

/** L3 — catalog board. */
export function killReasonCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasNotKilled: number;
  readonly hasModuleKilled: number;
  readonly hasLetsUserOut: number;
  readonly hasUndecidable: number;
} {
  return {
    reasons: KILL_REASONS.length,
    hasNotKilled: KILL_REASONS.includes('not-killed') ? 1 : 0,
    hasModuleKilled: KILL_REASONS.includes('module-killed') ? 1 : 0,
    hasLetsUserOut: KILL_REASONS.includes('lets-the-user-out') ? 1 : 0,
    hasUndecidable: KILL_REASONS.includes('undecidable') ? 1 : 0,
  };
}

/** L3 — status line. */
export function killReasonCatalogStatusLine(): string {
  const c = killReasonCatalogBoardCard();
  return `reasons=${c.reasons} not_killed=${c.hasNotKilled} module_killed=${c.hasModuleKilled} lets_user_out=${c.hasLetsUserOut} undecidable=${c.hasUndecidable}`;
}

/** L3 — parse status. */
export function parseKillReasonCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly notKilled: number;
  readonly moduleKilled: number;
  readonly letsUserOut: number;
  readonly undecidable: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) not_killed=([01]) module_killed=([01]) lets_user_out=([01]) undecidable=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    notKilled: Number(m[2]),
    moduleKilled: Number(m[3]),
    letsUserOut: Number(m[4]),
    undecidable: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function killReasonCatalogStatusLineMatches(): boolean {
  const p = parseKillReasonCatalogStatusLine(killReasonCatalogStatusLine());
  if (!p) return false;
  const c = killReasonCatalogBoardCard();
  return (
    p.reasons === c.reasons &&
    p.notKilled === c.hasNotKilled &&
    p.moduleKilled === c.hasModuleKilled &&
    p.letsUserOut === c.hasLetsUserOut &&
    p.undecidable === c.hasUndecidable
  );
}

/** L3 — six reasons; kill fails closed (undecidable present). */
export function killReasonCatalogStatusLineConsistent(line: string): boolean {
  const p = parseKillReasonCatalogStatusLine(line);
  if (!p) return false;
  return p.reasons === 6 && p.notKilled === 1 && p.moduleKilled === 1 && p.letsUserOut === 1 && p.undecidable === 1;
}

/** L3 — export header. */
export function killReasonCatalogExportHeader(): string {
  return 'kill_reason';
}

/** L3 — export lines. */
export function killReasonCatalogExportLines(): readonly string[] {
  return [...KILL_REASONS];
}

/** L3 — full export. */
export function killReasonCatalogExportText(): string {
  return [killReasonCatalogExportHeader(), ...killReasonCatalogExportLines()].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredKillReason(reason: string): boolean {
  return (KILL_REASONS as readonly string[]).includes(reason);
}
