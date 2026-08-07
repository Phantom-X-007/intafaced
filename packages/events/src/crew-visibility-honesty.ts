/**
 * Events L3 — pure crew visibility catalog honesty (structural only).
 *
 * Mirrors catalog.ts visibility: private | crew | public.
 * Does not invent social product law or privacy policy.
 */

export const CREW_VISIBILITIES = ['private', 'crew', 'public'] as const;
export type CrewVisibilityId = (typeof CREW_VISIBILITIES)[number];

/** L3 — catalog board. */
export function crewVisibilityCatalogBoardCard(): {
  readonly visibilities: number;
  readonly hasPrivate: number;
  readonly hasCrew: number;
  readonly hasPublic: number;
} {
  return {
    visibilities: CREW_VISIBILITIES.length,
    hasPrivate: CREW_VISIBILITIES.includes('private') ? 1 : 0,
    hasCrew: CREW_VISIBILITIES.includes('crew') ? 1 : 0,
    hasPublic: CREW_VISIBILITIES.includes('public') ? 1 : 0,
  };
}

/** L3 — status line. */
export function crewVisibilityCatalogStatusLine(): string {
  const c = crewVisibilityCatalogBoardCard();
  return `visibilities=${c.visibilities} private=${c.hasPrivate} crew=${c.hasCrew} public=${c.hasPublic}`;
}

/** L3 — parse status. */
export function parseCrewVisibilityCatalogStatusLine(line: string): {
  readonly visibilities: number;
  readonly private: number;
  readonly crew: number;
  readonly public: number;
} | null {
  const m = line.trim().match(/^visibilities=(\d+) private=([01]) crew=([01]) public=([01])$/);
  if (!m) return null;
  return {
    visibilities: Number(m[1]),
    private: Number(m[2]),
    crew: Number(m[3]),
    public: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function crewVisibilityCatalogStatusLineMatches(): boolean {
  const p = parseCrewVisibilityCatalogStatusLine(crewVisibilityCatalogStatusLine());
  if (!p) return false;
  const c = crewVisibilityCatalogBoardCard();
  return p.visibilities === c.visibilities && p.private === c.hasPrivate && p.crew === c.hasCrew && p.public === c.hasPublic;
}

/** L3 — three modes. */
export function crewVisibilityCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCrewVisibilityCatalogStatusLine(line);
  if (!p) return false;
  return p.visibilities === 3 && p.private === 1 && p.crew === 1 && p.public === 1;
}

/** L3 — export header. */
export function crewVisibilityCatalogExportHeader(): string {
  return 'crew_visibility';
}

/** L3 — export lines. */
export function crewVisibilityCatalogExportLines(): readonly string[] {
  return [...CREW_VISIBILITIES];
}

/** L3 — full export. */
export function crewVisibilityCatalogExportText(): string {
  return [crewVisibilityCatalogExportHeader(), ...crewVisibilityCatalogExportLines()].join('\n');
}

/** L3 — visibility declared. */
export function isDeclaredCrewVisibility(visibility: string): boolean {
  return (CREW_VISIBILITIES as readonly string[]).includes(visibility);
}
