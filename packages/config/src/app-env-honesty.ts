/**
 * Config L3 — pure APP_ENV catalog honesty (structural only).
 *
 * Mirrors env.ts APP_ENVS: dev | test | staging | prod.
 * Does not invent deploy policy or secrets.
 */

export const APP_ENVS = ['dev', 'test', 'staging', 'prod'] as const;
export type AppEnvId = (typeof APP_ENVS)[number];

/** L3 — catalog board. */
export function appEnvCatalogBoardCard(): {
  readonly envs: number;
  readonly hasDev: number;
  readonly hasStaging: number;
  readonly hasProd: number;
  readonly hasTest: number;
} {
  return {
    envs: APP_ENVS.length,
    hasDev: APP_ENVS.includes('dev') ? 1 : 0,
    hasStaging: APP_ENVS.includes('staging') ? 1 : 0,
    hasProd: APP_ENVS.includes('prod') ? 1 : 0,
    hasTest: APP_ENVS.includes('test') ? 1 : 0,
  };
}

/** L3 — status line. */
export function appEnvCatalogStatusLine(): string {
  const c = appEnvCatalogBoardCard();
  return `envs=${c.envs} dev=${c.hasDev} test=${c.hasTest} staging=${c.hasStaging} prod=${c.hasProd}`;
}

/** L3 — parse status. */
export function parseAppEnvCatalogStatusLine(line: string): {
  readonly envs: number;
  readonly dev: number;
  readonly test: number;
  readonly staging: number;
  readonly prod: number;
} | null {
  const m = line.trim().match(/^envs=(\d+) dev=([01]) test=([01]) staging=([01]) prod=([01])$/);
  if (!m) return null;
  return {
    envs: Number(m[1]),
    dev: Number(m[2]),
    test: Number(m[3]),
    staging: Number(m[4]),
    prod: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function appEnvCatalogStatusLineMatches(): boolean {
  const p = parseAppEnvCatalogStatusLine(appEnvCatalogStatusLine());
  if (!p) return false;
  const c = appEnvCatalogBoardCard();
  return p.envs === c.envs && p.dev === c.hasDev && p.test === c.hasTest && p.staging === c.hasStaging && p.prod === c.hasProd;
}

/** L3 — four envs. */
export function appEnvCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAppEnvCatalogStatusLine(line);
  if (!p) return false;
  return p.envs === 4 && p.dev === 1 && p.test === 1 && p.staging === 1 && p.prod === 1;
}

/** L3 — export header. */
export function appEnvCatalogExportHeader(): string {
  return 'app_env';
}

/** L3 — export lines. */
export function appEnvCatalogExportLines(): readonly string[] {
  return [...APP_ENVS];
}

/** L3 — full export. */
export function appEnvCatalogExportText(): string {
  return [appEnvCatalogExportHeader(), ...appEnvCatalogExportLines()].join('\n');
}

/** L3 — env declared. */
export function isDeclaredAppEnv(env: string): boolean {
  return (APP_ENVS as readonly string[]).includes(env);
}
