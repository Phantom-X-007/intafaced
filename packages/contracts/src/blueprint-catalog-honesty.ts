/**
 * Contracts L3 — pure Identity Blueprint enum catalog honesty (no I/O).
 *
 * Structural enums only. Does not invent guardrail numbers or profiles.
 */

export const DECISION_STYLES = ['analytical', 'intuitive', 'collaborative', 'decisive'] as const;
export const RISK_TEMPERAMENTS = ['guarded', 'measured', 'assertive', 'bold'] as const;
export const ENERGY_RHYTHMS = ['dawn', 'steady', 'surge', 'nocturnal'] as const;
export const LEARNING_MODES = ['visual', 'narrative', 'hands_on', 'systematic'] as const;
export const CREW_ROLES = ['anchor', 'scout', 'builder', 'catalyst'] as const;
export const VISIBILITIES = ['private', 'crew', 'public'] as const;
export const CARD_SIZES = ['portrait', 'landscape'] as const;

/** L3 — catalog board. */
export function blueprintCatalogBoardCard(): {
  readonly decisionStyles: number;
  readonly riskTemperaments: number;
  readonly energyRhythms: number;
  readonly learningModes: number;
  readonly crewRoles: number;
  readonly visibilities: number;
  readonly cardSizes: number;
} {
  return {
    decisionStyles: DECISION_STYLES.length,
    riskTemperaments: RISK_TEMPERAMENTS.length,
    energyRhythms: ENERGY_RHYTHMS.length,
    learningModes: LEARNING_MODES.length,
    crewRoles: CREW_ROLES.length,
    visibilities: VISIBILITIES.length,
    cardSizes: CARD_SIZES.length,
  };
}

/** L3 — status line. */
export function blueprintCatalogStatusLine(): string {
  const c = blueprintCatalogBoardCard();
  return `decision=${c.decisionStyles} risk=${c.riskTemperaments} energy=${c.energyRhythms} learning=${c.learningModes} crew=${c.crewRoles} visibility=${c.visibilities} card=${c.cardSizes}`;
}

/** L3 — parse status. */
export function parseBlueprintCatalogStatusLine(line: string): {
  readonly decision: number;
  readonly risk: number;
  readonly energy: number;
  readonly learning: number;
  readonly crew: number;
  readonly visibility: number;
  readonly card: number;
} | null {
  const m = line
    .trim()
    .match(
      /^decision=(\d+) risk=(\d+) energy=(\d+) learning=(\d+) crew=(\d+) visibility=(\d+) card=(\d+)$/,
    );
  if (!m) return null;
  return {
    decision: Number(m[1]),
    risk: Number(m[2]),
    energy: Number(m[3]),
    learning: Number(m[4]),
    crew: Number(m[5]),
    visibility: Number(m[6]),
    card: Number(m[7]),
  };
}

/** L3 — true when status matches. */
export function blueprintCatalogStatusLineMatches(): boolean {
  const p = parseBlueprintCatalogStatusLine(blueprintCatalogStatusLine());
  if (!p) return false;
  const c = blueprintCatalogBoardCard();
  return (
    p.decision === c.decisionStyles &&
    p.risk === c.riskTemperaments &&
    p.energy === c.energyRhythms &&
    p.learning === c.learningModes &&
    p.crew === c.crewRoles &&
    p.visibility === c.visibilities &&
    p.card === c.cardSizes
  );
}

/** L3 — fixed sizes from L1 enums. */
export function blueprintCatalogStatusLineConsistent(line: string): boolean {
  const p = parseBlueprintCatalogStatusLine(line);
  if (!p) return false;
  return (
    p.decision === 4 &&
    p.risk === 4 &&
    p.energy === 4 &&
    p.learning === 4 &&
    p.crew === 4 &&
    p.visibility === 3 &&
    p.card === 2
  );
}

/** L3 — export header. */
export function blueprintCatalogExportHeader(): string {
  return 'decision,risk,energy,learning,crew,visibility,card';
}

/** L3 — export line. */
export function blueprintCatalogExportLine(): string {
  const c = blueprintCatalogBoardCard();
  return `${c.decisionStyles},${c.riskTemperaments},${c.energyRhythms},${c.learningModes},${c.crewRoles},${c.visibilities},${c.cardSizes}`;
}

/** L3 — full export. */
export function blueprintCatalogExportText(): string {
  return [blueprintCatalogExportHeader(), blueprintCatalogExportLine()].join('\n');
}

/** L3 — crew role declared. */
export function isDeclaredCrewRole(role: string): boolean {
  return (CREW_ROLES as readonly string[]).includes(role);
}

/** L3 — visibility declared. */
export function isDeclaredVisibility(v: string): boolean {
  return (VISIBILITIES as readonly string[]).includes(v);
}
