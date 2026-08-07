/**
 * Config L3 — pure screening-enforced env catalog honesty (structural only).
 *
 * Mirrors jurisdiction.ts SCREENING_ENFORCED_ENVS: staging | prod.
 * Does not invent sanctions content or Class X go-live policy.
 */

export const SCREENING_ENFORCED_ENVS = ['staging', 'prod'] as const;
export type ScreeningEnforcedEnvId = (typeof SCREENING_ENFORCED_ENVS)[number];

/** L3 — catalog board. */
export function screeningEnforcedEnvCatalogBoardCard(): {
  readonly envs: number;
  readonly hasStaging: number;
  readonly hasProd: number;
} {
  return {
    envs: SCREENING_ENFORCED_ENVS.length,
    hasStaging: SCREENING_ENFORCED_ENVS.includes('staging') ? 1 : 0,
    hasProd: SCREENING_ENFORCED_ENVS.includes('prod') ? 1 : 0,
  };
}

/** L3 — status line. */
export function screeningEnforcedEnvCatalogStatusLine(): string {
  const c = screeningEnforcedEnvCatalogBoardCard();
  return `envs=${c.envs} staging=${c.hasStaging} prod=${c.hasProd}`;
}

/** L3 — parse status. */
export function parseScreeningEnforcedEnvCatalogStatusLine(line: string): {
  readonly envs: number;
  readonly staging: number;
  readonly prod: number;
} | null {
  const m = line.trim().match(/^envs=(\d+) staging=([01]) prod=([01])$/);
  if (!m) return null;
  return { envs: Number(m[1]), staging: Number(m[2]), prod: Number(m[3]) };
}

/** L3 — true when status matches. */
export function screeningEnforcedEnvCatalogStatusLineMatches(): boolean {
  const p = parseScreeningEnforcedEnvCatalogStatusLine(screeningEnforcedEnvCatalogStatusLine());
  if (!p) return false;
  const c = screeningEnforcedEnvCatalogBoardCard();
  return p.envs === c.envs && p.staging === c.hasStaging && p.prod === c.hasProd;
}

/** L3 — two envs. */
export function screeningEnforcedEnvCatalogStatusLineConsistent(line: string): boolean {
  const p = parseScreeningEnforcedEnvCatalogStatusLine(line);
  if (!p) return false;
  return p.envs === 2 && p.staging === 1 && p.prod === 1;
}

/** L3 — export header. */
export function screeningEnforcedEnvCatalogExportHeader(): string {
  return 'screening_enforced_env';
}

/** L3 — export lines. */
export function screeningEnforcedEnvCatalogExportLines(): readonly string[] {
  return [...SCREENING_ENFORCED_ENVS];
}

/** L3 — full export. */
export function screeningEnforcedEnvCatalogExportText(): string {
  return [screeningEnforcedEnvCatalogExportHeader(), ...screeningEnforcedEnvCatalogExportLines()].join('\n');
}

/** L3 — env declared. */
export function isDeclaredScreeningEnforcedEnv(env: string): boolean {
  return (SCREENING_ENFORCED_ENVS as readonly string[]).includes(env);
}
