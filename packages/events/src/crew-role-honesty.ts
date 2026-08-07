/**
 * Events L3 — pure crew-role catalog honesty (structural only).
 *
 * Mirrors catalog.ts crewRoleSchema: anchor | scout | builder | catalyst.
 * Does not invent crew product law or matchmaking policy.
 */

export const CREW_ROLES = ['anchor', 'scout', 'builder', 'catalyst'] as const;
export type CrewRoleId = (typeof CREW_ROLES)[number];

/** L3 — catalog board. */
export function crewRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasAnchor: number;
  readonly hasScout: number;
  readonly hasBuilder: number;
  readonly hasCatalyst: number;
} {
  return {
    roles: CREW_ROLES.length,
    hasAnchor: CREW_ROLES.includes('anchor') ? 1 : 0,
    hasScout: CREW_ROLES.includes('scout') ? 1 : 0,
    hasBuilder: CREW_ROLES.includes('builder') ? 1 : 0,
    hasCatalyst: CREW_ROLES.includes('catalyst') ? 1 : 0,
  };
}

/** L3 — status line. */
export function crewRoleCatalogStatusLine(): string {
  const c = crewRoleCatalogBoardCard();
  return `roles=${c.roles} anchor=${c.hasAnchor} scout=${c.hasScout} builder=${c.hasBuilder} catalyst=${c.hasCatalyst}`;
}

/** L3 — parse status. */
export function parseCrewRoleCatalogStatusLine(line: string): {
  readonly roles: number;
  readonly anchor: number;
  readonly scout: number;
  readonly builder: number;
  readonly catalyst: number;
} | null {
  const m = line.trim().match(/^roles=(\d+) anchor=([01]) scout=([01]) builder=([01]) catalyst=([01])$/);
  if (!m) return null;
  return {
    roles: Number(m[1]),
    anchor: Number(m[2]),
    scout: Number(m[3]),
    builder: Number(m[4]),
    catalyst: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function crewRoleCatalogStatusLineMatches(): boolean {
  const p = parseCrewRoleCatalogStatusLine(crewRoleCatalogStatusLine());
  if (!p) return false;
  const c = crewRoleCatalogBoardCard();
  return (
    p.roles === c.roles && p.anchor === c.hasAnchor && p.scout === c.hasScout && p.builder === c.hasBuilder && p.catalyst === c.hasCatalyst
  );
}

/** L3 — four roles. */
export function crewRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCrewRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.roles === 4 && p.anchor === 1 && p.scout === 1 && p.builder === 1 && p.catalyst === 1;
}

/** L3 — export header. */
export function crewRoleCatalogExportHeader(): string {
  return 'crew_role';
}

/** L3 — export lines. */
export function crewRoleCatalogExportLines(): readonly string[] {
  return [...CREW_ROLES];
}

/** L3 — full export. */
export function crewRoleCatalogExportText(): string {
  return [crewRoleCatalogExportHeader(), ...crewRoleCatalogExportLines()].join('\n');
}

/** L3 — role declared. */
export function isDeclaredCrewRole(role: string): boolean {
  return (CREW_ROLES as readonly string[]).includes(role);
}
