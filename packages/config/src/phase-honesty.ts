/**
 * Config L3 — pure module-phase catalog honesty (structural only).
 *
 * Mirrors modules.ts PHASES: 0 | 1 | 2 | 3 | 3P | 4 | 4P | 5 | 5P.
 * Does not invent module enablement product law.
 */

export const PHASES = ['0', '1', '2', '3', '3P', '4', '4P', '5', '5P'] as const;
export type PhaseId = (typeof PHASES)[number];

/** L3 — catalog board. */
export function phaseCatalogBoardCard(): {
  readonly phases: number;
  readonly hasZero: number;
  readonly has5: number;
  readonly has3P: number;
  readonly has5P: number;
} {
  return {
    phases: PHASES.length,
    hasZero: PHASES.includes('0') ? 1 : 0,
    has5: PHASES.includes('5') ? 1 : 0,
    has3P: PHASES.includes('3P') ? 1 : 0,
    has5P: PHASES.includes('5P') ? 1 : 0,
  };
}

/** L3 — status line. */
export function phaseCatalogStatusLine(): string {
  const c = phaseCatalogBoardCard();
  return `phases=${c.phases} zero=${c.hasZero} five=${c.has5} three_p=${c.has3P} five_p=${c.has5P}`;
}

/** L3 — parse status. */
export function parsePhaseCatalogStatusLine(line: string): {
  readonly phases: number;
  readonly zero: number;
  readonly five: number;
  readonly threeP: number;
  readonly fiveP: number;
} | null {
  const m = line.trim().match(/^phases=(\d+) zero=([01]) five=([01]) three_p=([01]) five_p=([01])$/);
  if (!m) return null;
  return {
    phases: Number(m[1]),
    zero: Number(m[2]),
    five: Number(m[3]),
    threeP: Number(m[4]),
    fiveP: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function phaseCatalogStatusLineMatches(): boolean {
  const p = parsePhaseCatalogStatusLine(phaseCatalogStatusLine());
  if (!p) return false;
  const c = phaseCatalogBoardCard();
  return p.phases === c.phases && p.zero === c.hasZero && p.five === c.has5 && p.threeP === c.has3P && p.fiveP === c.has5P;
}

/** L3 — nine phases. */
export function phaseCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePhaseCatalogStatusLine(line);
  if (!p) return false;
  return p.phases === 9 && p.zero === 1 && p.five === 1 && p.threeP === 1 && p.fiveP === 1;
}

/** L3 — export header. */
export function phaseCatalogExportHeader(): string {
  return 'phase';
}

/** L3 — export lines. */
export function phaseCatalogExportLines(): readonly string[] {
  return [...PHASES];
}

/** L3 — full export. */
export function phaseCatalogExportText(): string {
  return [phaseCatalogExportHeader(), ...phaseCatalogExportLines()].join('\n');
}

/** L3 — phase declared. */
export function isDeclaredPhase(phase: string): boolean {
  return (PHASES as readonly string[]).includes(phase);
}
