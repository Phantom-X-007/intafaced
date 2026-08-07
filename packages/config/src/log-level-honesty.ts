/**
 * Config L3 — pure log-level catalog honesty (structural only).
 *
 * Mirrors env.ts LOG_LEVEL: fatal | error | warn | info | debug | trace.
 * Does not invent telemetry or secrets policy.
 */

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevelId = (typeof LOG_LEVELS)[number];

/** L3 — catalog board. */
export function logLevelCatalogBoardCard(): {
  readonly levels: number;
  readonly hasFatal: number;
  readonly hasError: number;
  readonly hasInfo: number;
  readonly hasTrace: number;
} {
  return {
    levels: LOG_LEVELS.length,
    hasFatal: LOG_LEVELS.includes('fatal') ? 1 : 0,
    hasError: LOG_LEVELS.includes('error') ? 1 : 0,
    hasInfo: LOG_LEVELS.includes('info') ? 1 : 0,
    hasTrace: LOG_LEVELS.includes('trace') ? 1 : 0,
  };
}

/** L3 — status line. */
export function logLevelCatalogStatusLine(): string {
  const c = logLevelCatalogBoardCard();
  return `levels=${c.levels} fatal=${c.hasFatal} error=${c.hasError} info=${c.hasInfo} trace=${c.hasTrace}`;
}

/** L3 — parse status. */
export function parseLogLevelCatalogStatusLine(line: string): {
  readonly levels: number;
  readonly fatal: number;
  readonly error: number;
  readonly info: number;
  readonly trace: number;
} | null {
  const m = line.trim().match(/^levels=(\d+) fatal=([01]) error=([01]) info=([01]) trace=([01])$/);
  if (!m) return null;
  return {
    levels: Number(m[1]),
    fatal: Number(m[2]),
    error: Number(m[3]),
    info: Number(m[4]),
    trace: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function logLevelCatalogStatusLineMatches(): boolean {
  const p = parseLogLevelCatalogStatusLine(logLevelCatalogStatusLine());
  if (!p) return false;
  const c = logLevelCatalogBoardCard();
  return p.levels === c.levels && p.fatal === c.hasFatal && p.error === c.hasError && p.info === c.hasInfo && p.trace === c.hasTrace;
}

/** L3 — six levels. */
export function logLevelCatalogStatusLineConsistent(line: string): boolean {
  const p = parseLogLevelCatalogStatusLine(line);
  if (!p) return false;
  return p.levels === 6 && p.fatal === 1 && p.error === 1 && p.info === 1 && p.trace === 1;
}

/** L3 — export header. */
export function logLevelCatalogExportHeader(): string {
  return 'log_level';
}

/** L3 — export lines. */
export function logLevelCatalogExportLines(): readonly string[] {
  return [...LOG_LEVELS];
}

/** L3 — full export. */
export function logLevelCatalogExportText(): string {
  return [logLevelCatalogExportHeader(), ...logLevelCatalogExportLines()].join('\n');
}

/** L3 — level declared. */
export function isDeclaredLogLevel(level: string): boolean {
  return (LOG_LEVELS as readonly string[]).includes(level);
}
