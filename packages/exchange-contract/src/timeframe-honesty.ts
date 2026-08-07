/**
 * Exchange-contract L3 — pure OHLCV timeframe catalog honesty (structural only).
 *
 * Mirrors schemas.ts TIMEFRAMES (14 strings).
 * Does not invent money or candle OHLC values.
 */

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3d', '1w', '1M'] as const;
export type TimeframeId = (typeof TIMEFRAMES)[number];

/** L3 — catalog board. */
export function timeframeCatalogBoardCard(): {
  readonly timeframes: number;
  readonly has1m: number;
  readonly has1h: number;
  readonly has1d: number;
  readonly has1M: number;
} {
  return {
    timeframes: TIMEFRAMES.length,
    has1m: TIMEFRAMES.includes('1m') ? 1 : 0,
    has1h: TIMEFRAMES.includes('1h') ? 1 : 0,
    has1d: TIMEFRAMES.includes('1d') ? 1 : 0,
    has1M: TIMEFRAMES.includes('1M') ? 1 : 0,
  };
}

/** L3 — status line. */
export function timeframeCatalogStatusLine(): string {
  const c = timeframeCatalogBoardCard();
  return `timeframes=${c.timeframes} m1=${c.has1m} h1=${c.has1h} d1=${c.has1d} M1=${c.has1M}`;
}

/** L3 — parse status. */
export function parseTimeframeCatalogStatusLine(line: string): {
  readonly timeframes: number;
  readonly m1: number;
  readonly h1: number;
  readonly d1: number;
  readonly M1: number;
} | null {
  const m = line.trim().match(/^timeframes=(\d+) m1=([01]) h1=([01]) d1=([01]) M1=([01])$/);
  if (!m) return null;
  return {
    timeframes: Number(m[1]),
    m1: Number(m[2]),
    h1: Number(m[3]),
    d1: Number(m[4]),
    M1: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function timeframeCatalogStatusLineMatches(): boolean {
  const p = parseTimeframeCatalogStatusLine(timeframeCatalogStatusLine());
  if (!p) return false;
  const c = timeframeCatalogBoardCard();
  return p.timeframes === c.timeframes && p.m1 === c.has1m && p.h1 === c.has1h && p.d1 === c.has1d && p.M1 === c.has1M;
}

/** L3 — fourteen tip timeframes. */
export function timeframeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseTimeframeCatalogStatusLine(line);
  if (!p) return false;
  return p.timeframes === 14 && p.m1 === 1 && p.h1 === 1 && p.d1 === 1 && p.M1 === 1;
}

/** L3 — export header. */
export function timeframeCatalogExportHeader(): string {
  return 'timeframe';
}

/** L3 — export lines. */
export function timeframeCatalogExportLines(): readonly string[] {
  return [...TIMEFRAMES];
}

/** L3 — full export. */
export function timeframeCatalogExportText(): string {
  return [timeframeCatalogExportHeader(), ...timeframeCatalogExportLines()].join('\n');
}

/** L3 — timeframe declared. */
export function isDeclaredTimeframe(tf: string): boolean {
  return (TIMEFRAMES as readonly string[]).includes(tf);
}
