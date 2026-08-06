/**
 * Agents L3 — pure copy-plane state catalog honesty (structural only).
 *
 * Mirrors copy-intel stats.ts CopyPlaneState: live | dark.
 * Does not invent leader PnL or money stats.
 */

export const COPY_PLANE_STATES = ['live', 'dark'] as const;
export type CopyPlaneStateId = (typeof COPY_PLANE_STATES)[number];

/** L3 — catalog board. */
export function copyPlaneCatalogBoardCard(): {
  readonly states: number;
  readonly hasLive: number;
  readonly hasDark: number;
} {
  return {
    states: COPY_PLANE_STATES.length,
    hasLive: COPY_PLANE_STATES.includes('live') ? 1 : 0,
    hasDark: COPY_PLANE_STATES.includes('dark') ? 1 : 0,
  };
}

/** L3 — status line. */
export function copyPlaneCatalogStatusLine(): string {
  const c = copyPlaneCatalogBoardCard();
  return `states=${c.states} live=${c.hasLive} dark=${c.hasDark}`;
}

/** L3 — parse status. */
export function parseCopyPlaneCatalogStatusLine(line: string): {
  readonly states: number;
  readonly live: number;
  readonly dark: number;
} | null {
  const m = line.trim().match(/^states=(\d+) live=([01]) dark=([01])$/);
  if (!m) return null;
  return {
    states: Number(m[1]),
    live: Number(m[2]),
    dark: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function copyPlaneCatalogStatusLineMatches(): boolean {
  const p = parseCopyPlaneCatalogStatusLine(copyPlaneCatalogStatusLine());
  if (!p) return false;
  const c = copyPlaneCatalogBoardCard();
  return p.states === c.states && p.live === c.hasLive && p.dark === c.hasDark;
}

/** L3 — two states. */
export function copyPlaneCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCopyPlaneCatalogStatusLine(line);
  if (!p) return false;
  return p.states === 2 && p.live === 1 && p.dark === 1;
}

/** L3 — export header. */
export function copyPlaneCatalogExportHeader(): string {
  return 'state';
}

/** L3 — export lines. */
export function copyPlaneCatalogExportLines(): readonly string[] {
  return [...COPY_PLANE_STATES];
}

/** L3 — full export. */
export function copyPlaneCatalogExportText(): string {
  return [copyPlaneCatalogExportHeader(), ...copyPlaneCatalogExportLines()].join('\n');
}

/** L3 — state declared. */
export function isDeclaredCopyPlaneState(state: string): boolean {
  return (COPY_PLANE_STATES as readonly string[]).includes(state);
}
