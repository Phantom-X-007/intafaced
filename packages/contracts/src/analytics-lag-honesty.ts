/**
 * Contracts L3 — pure analytics lag / freshness honesty boards (no warehouse I/O).
 *
 * Mirrors ops-analytics.ts source DBs + lag SLO + lagFreshness law.
 * Never invents live series when lag unknown.
 */

export const ANALYTICS_SOURCE_DB_CATALOG = ['ledger', 'trade', 'identity'] as const;
export const LAG_FRESHNESS_VALUES = ['live', 'delayed', 'stale', 'unknown'] as const;
export const ANALYTICS_LIVE_MAX_LAG_SECONDS = 60;
export const ANALYTICS_WARN_LAG_SECONDS = 30;

export type LagFreshnessId = (typeof LAG_FRESHNESS_VALUES)[number];

/**
 * L3 — pure lag freshness (fail-closed). Mirrors ops-analytics lagFreshness.
 * unknown/null/negative → unknown (never live).
 */
export function lagFreshnessFromSeconds(lagSeconds: number | null | undefined): LagFreshnessId {
  if (lagSeconds === null || lagSeconds === undefined || !Number.isFinite(lagSeconds) || lagSeconds < 0) {
    return 'unknown';
  }
  if (lagSeconds <= ANALYTICS_WARN_LAG_SECONDS) return 'live';
  if (lagSeconds <= ANALYTICS_LIVE_MAX_LAG_SECONDS) return 'delayed';
  return 'stale';
}

/** L3 — catalog board. */
export function analyticsLagCatalogBoardCard(): {
  readonly sources: number;
  readonly freshnessValues: number;
  readonly liveMaxLag: number;
  readonly warnLag: number;
} {
  return {
    sources: ANALYTICS_SOURCE_DB_CATALOG.length,
    freshnessValues: LAG_FRESHNESS_VALUES.length,
    liveMaxLag: ANALYTICS_LIVE_MAX_LAG_SECONDS,
    warnLag: ANALYTICS_WARN_LAG_SECONDS,
  };
}

/** L3 — catalog status line. */
export function analyticsLagCatalogStatusLine(): string {
  const c = analyticsLagCatalogBoardCard();
  return `sources=${c.sources} freshness=${c.freshnessValues} live_max=${c.liveMaxLag} warn=${c.warnLag}`;
}

/** L3 — parse catalog. */
export function parseAnalyticsLagCatalogStatusLine(line: string): {
  readonly sources: number;
  readonly freshness: number;
  readonly liveMax: number;
  readonly warn: number;
} | null {
  const m = line.trim().match(/^sources=(\d+) freshness=(\d+) live_max=(\d+) warn=(\d+)$/);
  if (!m) return null;
  return {
    sources: Number(m[1]),
    freshness: Number(m[2]),
    liveMax: Number(m[3]),
    warn: Number(m[4]),
  };
}

/** L3 — true when catalog matches. */
export function analyticsLagCatalogStatusLineMatches(): boolean {
  const p = parseAnalyticsLagCatalogStatusLine(analyticsLagCatalogStatusLine());
  if (!p) return false;
  const c = analyticsLagCatalogBoardCard();
  return p.sources === c.sources && p.freshness === c.freshnessValues && p.liveMax === c.liveMaxLag && p.warn === c.warnLag;
}

/** L3 — warn < live max; three sources. */
export function analyticsLagCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAnalyticsLagCatalogStatusLine(line);
  if (!p) return false;
  return p.warn < p.liveMax && p.sources === 3 && p.freshness === 4;
}

/** L3 — lag observation board. */
export function lagObservationBoardCard(lagSeconds: number | null | undefined): {
  readonly lag: string;
  readonly freshness: LagFreshnessId;
  readonly isLive: number;
} {
  const freshness = lagFreshnessFromSeconds(lagSeconds);
  return {
    lag: lagSeconds === null || lagSeconds === undefined || !Number.isFinite(lagSeconds) ? 'null' : String(lagSeconds),
    freshness,
    isLive: freshness === 'live' ? 1 : 0,
  };
}

/** L3 — observation status line. */
export function lagObservationStatusLine(lagSeconds: number | null | undefined): string {
  const c = lagObservationBoardCard(lagSeconds);
  return `lag=${c.lag} freshness=${c.freshness} live=${c.isLive}`;
}

/** L3 — parse observation. */
export function parseLagObservationStatusLine(line: string): {
  readonly lag: string;
  readonly freshness: string;
  readonly isLive: number;
} | null {
  const m = line.trim().match(/^lag=([0-9.]+|null) freshness=(live|delayed|stale|unknown) live=([01])$/);
  if (!m) return null;
  return { lag: m[1]!, freshness: m[2]!, isLive: Number(m[3]) };
}

/** L3 — true when observation status matches. */
export function lagObservationStatusLineMatches(lagSeconds: number | null | undefined): boolean {
  const p = parseLagObservationStatusLine(lagObservationStatusLine(lagSeconds));
  if (!p) return false;
  const c = lagObservationBoardCard(lagSeconds);
  return p.lag === c.lag && p.freshness === c.freshness && p.isLive === c.isLive;
}

/** L3 — live flag only when freshness is live. */
export function lagObservationStatusLineConsistent(line: string): boolean {
  const p = parseLagObservationStatusLine(line);
  if (!p) return false;
  return p.isLive === (p.freshness === 'live' ? 1 : 0);
}

/** L3 — export header. */
export function lagObservationExportHeader(): string {
  return 'lag,freshness,live';
}

/** L3 — export line. */
export function lagObservationExportLine(lagSeconds: number | null | undefined): string {
  const c = lagObservationBoardCard(lagSeconds);
  return `${c.lag},${c.freshness},${c.isLive}`;
}

/** L3 — full export. */
export function lagObservationExportText(lagSeconds: number | null | undefined): string {
  return [lagObservationExportHeader(), lagObservationExportLine(lagSeconds)].join('\n');
}

/** L3 — source declared. */
export function isDeclaredAnalyticsSource(db: string): boolean {
  return (ANALYTICS_SOURCE_DB_CATALOG as readonly string[]).includes(db);
}

/** L3 — unknown lag never live. */
export function unknownLagNeverLive(): boolean {
  return lagFreshnessFromSeconds(null) === 'unknown' && lagObservationBoardCard(null).isLive === 0;
}
