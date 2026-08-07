/**
 * Config L3 — pure launch-drop catalog honesty (structural only).
 *
 * Mirrors flags.ts DROPS / LAUNCH_DROP: 0 | I | II | III | IV | V.
 * Does not invent feature enablement numbers or product law.
 */

export const LAUNCH_DROPS = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
export type LaunchDropId = (typeof LAUNCH_DROPS)[number];

/** L3 — catalog board. */
export function launchDropCatalogBoardCard(): {
  readonly drops: number;
  readonly hasZero: number;
  readonly hasV: number;
  readonly hasI: number;
  readonly hasIII: number;
} {
  return {
    drops: LAUNCH_DROPS.length,
    hasZero: LAUNCH_DROPS.includes('0') ? 1 : 0,
    hasV: LAUNCH_DROPS.includes('V') ? 1 : 0,
    hasI: LAUNCH_DROPS.includes('I') ? 1 : 0,
    hasIII: LAUNCH_DROPS.includes('III') ? 1 : 0,
  };
}

/** L3 — status line. */
export function launchDropCatalogStatusLine(): string {
  const c = launchDropCatalogBoardCard();
  return `drops=${c.drops} zero=${c.hasZero} i=${c.hasI} iii=${c.hasIII} v=${c.hasV}`;
}

/** L3 — parse status. */
export function parseLaunchDropCatalogStatusLine(line: string): {
  readonly drops: number;
  readonly zero: number;
  readonly i: number;
  readonly iii: number;
  readonly v: number;
} | null {
  const m = line.trim().match(/^drops=(\d+) zero=([01]) i=([01]) iii=([01]) v=([01])$/);
  if (!m) return null;
  return {
    drops: Number(m[1]),
    zero: Number(m[2]),
    i: Number(m[3]),
    iii: Number(m[4]),
    v: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function launchDropCatalogStatusLineMatches(): boolean {
  const p = parseLaunchDropCatalogStatusLine(launchDropCatalogStatusLine());
  if (!p) return false;
  const c = launchDropCatalogBoardCard();
  return p.drops === c.drops && p.zero === c.hasZero && p.i === c.hasI && p.iii === c.hasIII && p.v === c.hasV;
}

/** L3 — six drops. */
export function launchDropCatalogStatusLineConsistent(line: string): boolean {
  const p = parseLaunchDropCatalogStatusLine(line);
  if (!p) return false;
  return p.drops === 6 && p.zero === 1 && p.i === 1 && p.iii === 1 && p.v === 1;
}

/** L3 — export header. */
export function launchDropCatalogExportHeader(): string {
  return 'launch_drop';
}

/** L3 — export lines. */
export function launchDropCatalogExportLines(): readonly string[] {
  return [...LAUNCH_DROPS];
}

/** L3 — full export. */
export function launchDropCatalogExportText(): string {
  return [launchDropCatalogExportHeader(), ...launchDropCatalogExportLines()].join('\n');
}

/** L3 — drop declared. */
export function isDeclaredLaunchDrop(d: string): boolean {
  return (LAUNCH_DROPS as readonly string[]).includes(d);
}
