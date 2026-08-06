/**
 * Agents L3 — pure data-plane state catalog honesty (live/dark).
 *
 * Shared shape across navigator/trade, merchant/pay, copy-intel planes.
 * Dark never invents markets/rates.
 */

export const PLANE_STATES = ['live', 'dark'] as const;
export type PlaneStateId = (typeof PLANE_STATES)[number];

export const PLANE_NAMES = ['trade', 'pay', 'copy', 'desk'] as const;

/** L3 — plane state catalog. */
export function planeStateCatalogBoardCard(): {
  readonly states: number;
  readonly hasLive: number;
  readonly hasDark: number;
} {
  return {
    states: PLANE_STATES.length,
    hasLive: PLANE_STATES.includes('live') ? 1 : 0,
    hasDark: PLANE_STATES.includes('dark') ? 1 : 0,
  };
}

/** L3 — status line. */
export function planeStateCatalogStatusLine(): string {
  const c = planeStateCatalogBoardCard();
  return `states=${c.states} live=${c.hasLive} dark=${c.hasDark}`;
}

/** L3 — parse status. */
export function parsePlaneStateCatalogStatusLine(line: string): {
  readonly states: number;
  readonly live: number;
  readonly dark: number;
} | null {
  const m = line.trim().match(/^states=(\d+) live=([01]) dark=([01])$/);
  if (!m) return null;
  return { states: Number(m[1]), live: Number(m[2]), dark: Number(m[3]) };
}

/** L3 — true when status matches. */
export function planeStateCatalogStatusLineMatches(): boolean {
  const p = parsePlaneStateCatalogStatusLine(planeStateCatalogStatusLine());
  if (!p) return false;
  const c = planeStateCatalogBoardCard();
  return p.states === c.states && p.live === c.hasLive && p.dark === c.hasDark;
}

/** L3 — two states. */
export function planeStateCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePlaneStateCatalogStatusLine(line);
  if (!p) return false;
  return p.states === 2 && p.live === 1 && p.dark === 1;
}

/** L3 — dark means refuse invent (board rule). */
export function darkPlaneRefusesInvent(plane: PlaneStateId): boolean {
  return plane === 'dark';
}

/** L3 — multi-plane board. */
export function multiPlaneBoardCard(planes: Readonly<Record<string, PlaneStateId>>): {
  readonly named: number;
  readonly live: number;
  readonly dark: number;
} {
  let live = 0;
  let dark = 0;
  for (const v of Object.values(planes)) {
    if (v === 'live') live += 1;
    else dark += 1;
  }
  return { named: Object.keys(planes).length, live, dark };
}

/** L3 — multi-plane status line. */
export function multiPlaneStatusLine(planes: Readonly<Record<string, PlaneStateId>>): string {
  const c = multiPlaneBoardCard(planes);
  return `named=${c.named} live=${c.live} dark=${c.dark}`;
}

/** L3 — parse multi. */
export function parseMultiPlaneStatusLine(line: string): {
  readonly named: number;
  readonly live: number;
  readonly dark: number;
} | null {
  const m = line.trim().match(/^named=(\d+) live=(\d+) dark=(\d+)$/);
  if (!m) return null;
  return { named: Number(m[1]), live: Number(m[2]), dark: Number(m[3]) };
}

/** L3 — true when multi matches. */
export function multiPlaneStatusLineMatches(planes: Readonly<Record<string, PlaneStateId>>): boolean {
  const p = parseMultiPlaneStatusLine(multiPlaneStatusLine(planes));
  if (!p) return false;
  const c = multiPlaneBoardCard(planes);
  return p.named === c.named && p.live === c.live && p.dark === c.dark;
}

/** L3 — live+dark equals named. */
export function multiPlaneStatusLineConsistent(line: string): boolean {
  const p = parseMultiPlaneStatusLine(line);
  if (!p) return false;
  return p.named === p.live + p.dark;
}

/** L3 — export header. */
export function multiPlaneExportHeader(): string {
  return 'named,live,dark';
}

/** L3 — export line. */
export function multiPlaneExportLine(planes: Readonly<Record<string, PlaneStateId>>): string {
  const c = multiPlaneBoardCard(planes);
  return `${c.named},${c.live},${c.dark}`;
}

/** L3 — full export. */
export function multiPlaneExportText(planes: Readonly<Record<string, PlaneStateId>>): string {
  return [multiPlaneExportHeader(), multiPlaneExportLine(planes)].join('\n');
}

/** L3 — state declared. */
export function isDeclaredPlaneState(state: string): boolean {
  return (PLANE_STATES as readonly string[]).includes(state);
}
