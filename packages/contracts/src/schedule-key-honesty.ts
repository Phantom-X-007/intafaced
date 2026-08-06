/**
 * Contracts L3 — pure trading schedule key catalog honesty (no invent markets).
 *
 * Mirrors instruments.ts schedule keys.
 */

export const SCHEDULE_KEYS = ['crypto-24x7', 'fx-global', 'cme-globex'] as const;

/** L3 — catalog board. */
export function scheduleKeyCatalogBoardCard(): {
  readonly schedules: number;
  readonly hasCrypto: number;
  readonly hasFx: number;
  readonly hasCme: number;
} {
  return {
    schedules: SCHEDULE_KEYS.length,
    hasCrypto: SCHEDULE_KEYS.includes('crypto-24x7') ? 1 : 0,
    hasFx: SCHEDULE_KEYS.includes('fx-global') ? 1 : 0,
    hasCme: SCHEDULE_KEYS.includes('cme-globex') ? 1 : 0,
  };
}

/** L3 — status line. */
export function scheduleKeyCatalogStatusLine(): string {
  const c = scheduleKeyCatalogBoardCard();
  return `schedules=${c.schedules} crypto=${c.hasCrypto} fx=${c.hasFx} cme=${c.hasCme}`;
}

/** L3 — parse status. */
export function parseScheduleKeyCatalogStatusLine(line: string): {
  readonly schedules: number;
  readonly crypto: number;
  readonly fx: number;
  readonly cme: number;
} | null {
  const m = line.trim().match(/^schedules=(\d+) crypto=([01]) fx=([01]) cme=([01])$/);
  if (!m) return null;
  return {
    schedules: Number(m[1]),
    crypto: Number(m[2]),
    fx: Number(m[3]),
    cme: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function scheduleKeyCatalogStatusLineMatches(): boolean {
  const p = parseScheduleKeyCatalogStatusLine(scheduleKeyCatalogStatusLine());
  if (!p) return false;
  const c = scheduleKeyCatalogBoardCard();
  return p.schedules === c.schedules && p.crypto === c.hasCrypto && p.fx === c.hasFx && p.cme === c.hasCme;
}

/** L3 — three schedules. */
export function scheduleKeyCatalogStatusLineConsistent(line: string): boolean {
  const p = parseScheduleKeyCatalogStatusLine(line);
  if (!p) return false;
  return p.schedules === 3 && p.crypto === 1 && p.fx === 1 && p.cme === 1;
}

/** L3 — export header. */
export function scheduleKeyCatalogExportHeader(): string {
  return 'schedule';
}

/** L3 — export lines. */
export function scheduleKeyCatalogExportLines(): readonly string[] {
  return [...SCHEDULE_KEYS];
}

/** L3 — full export. */
export function scheduleKeyCatalogExportText(): string {
  return [scheduleKeyCatalogExportHeader(), ...scheduleKeyCatalogExportLines()].join('\n');
}

/** L3 — key declared. */
export function isDeclaredScheduleKey(key: string): boolean {
  return (SCHEDULE_KEYS as readonly string[]).includes(key);
}
