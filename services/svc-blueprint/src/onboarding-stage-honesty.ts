/**
 * Blueprint L3 — pure onboarding-stage catalog honesty (structural only).
 *
 * Mirrors tracing.ts OnboardingStage: session | engine | persist | match |
 * mentors | card | export | erase.
 * Does not invent personal content or money fields.
 */

export const ONBOARDING_STAGES = ['session', 'engine', 'persist', 'match', 'mentors', 'card', 'export', 'erase'] as const;
export type OnboardingStageId = (typeof ONBOARDING_STAGES)[number];

/** L3 — catalog board. */
export function onboardingStageCatalogBoardCard(): {
  readonly stages: number;
  readonly hasSession: number;
  readonly hasEngine: number;
  readonly hasErase: number;
  readonly hasExport: number;
} {
  return {
    stages: ONBOARDING_STAGES.length,
    hasSession: ONBOARDING_STAGES.includes('session') ? 1 : 0,
    hasEngine: ONBOARDING_STAGES.includes('engine') ? 1 : 0,
    hasErase: ONBOARDING_STAGES.includes('erase') ? 1 : 0,
    hasExport: ONBOARDING_STAGES.includes('export') ? 1 : 0,
  };
}

/** L3 — status line. */
export function onboardingStageCatalogStatusLine(): string {
  const c = onboardingStageCatalogBoardCard();
  return `stages=${c.stages} session=${c.hasSession} engine=${c.hasEngine} erase=${c.hasErase} export=${c.hasExport}`;
}

/** L3 — parse status. */
export function parseOnboardingStageCatalogStatusLine(line: string): {
  readonly stages: number;
  readonly session: number;
  readonly engine: number;
  readonly erase: number;
  readonly export: number;
} | null {
  const m = line.trim().match(/^stages=(\d+) session=([01]) engine=([01]) erase=([01]) export=([01])$/);
  if (!m) return null;
  return {
    stages: Number(m[1]),
    session: Number(m[2]),
    engine: Number(m[3]),
    erase: Number(m[4]),
    export: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function onboardingStageCatalogStatusLineMatches(): boolean {
  const p = parseOnboardingStageCatalogStatusLine(onboardingStageCatalogStatusLine());
  if (!p) return false;
  const c = onboardingStageCatalogBoardCard();
  return (
    p.stages === c.stages && p.session === c.hasSession && p.engine === c.hasEngine && p.erase === c.hasErase && p.export === c.hasExport
  );
}

/** L3 — eight stages; erase present (right to erase). */
export function onboardingStageCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOnboardingStageCatalogStatusLine(line);
  if (!p) return false;
  return p.stages === 8 && p.session === 1 && p.engine === 1 && p.erase === 1 && p.export === 1;
}

/** L3 — export header. */
export function onboardingStageCatalogExportHeader(): string {
  return 'onboarding_stage';
}

/** L3 — export lines. */
export function onboardingStageCatalogExportLines(): readonly string[] {
  return [...ONBOARDING_STAGES];
}

/** L3 — full export. */
export function onboardingStageCatalogExportText(): string {
  return [onboardingStageCatalogExportHeader(), ...onboardingStageCatalogExportLines()].join('\n');
}

/** L3 — stage declared. */
export function isDeclaredOnboardingStage(stage: string): boolean {
  return (ONBOARDING_STAGES as readonly string[]).includes(stage);
}
