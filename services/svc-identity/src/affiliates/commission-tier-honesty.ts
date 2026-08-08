/**
 * Identity L3 — commission tier catalog honesty (no payout).
 *
 * Boards over an explicit tier list only. There is no production default
 * rate catalog (DEFAULT_ACCRUAL_TIERS was removed — DIRECTION §8).
 */

export type TierBoardInput = {
  readonly hop: number;
  readonly rate: string;
};

/** L3 — board over supplied tiers (never invents a default list). */
export function defaultTierCatalogBoardCard(tiers: readonly TierBoardInput[]): {
  readonly tiers: number;
  readonly minHop: number;
  readonly maxHop: number;
  readonly hasHop0: number;
} {
  if (tiers.length === 0) {
    return { tiers: 0, minHop: -1, maxHop: -1, hasHop0: 0 };
  }
  let minHop = tiers[0]!.hop;
  let maxHop = tiers[0]!.hop;
  let hasHop0 = 0;
  for (const t of tiers) {
    if (t.hop < minHop) minHop = t.hop;
    if (t.hop > maxHop) maxHop = t.hop;
    if (t.hop === 0) hasHop0 = 1;
  }
  return { tiers: tiers.length, minHop, maxHop, hasHop0 };
}

/** L3 — status line. */
export function defaultTierCatalogStatusLine(tiers: readonly TierBoardInput[]): string {
  const c = defaultTierCatalogBoardCard(tiers);
  return `tiers=${c.tiers} min_hop=${c.minHop} max_hop=${c.maxHop} hop0=${c.hasHop0}`;
}

/** L3 — parse status. */
export function parseDefaultTierCatalogStatusLine(line: string): {
  readonly tiers: number;
  readonly minHop: number;
  readonly maxHop: number;
  readonly hop0: number;
} | null {
  const m = line.trim().match(/^tiers=(\d+) min_hop=(-?\d+) max_hop=(-?\d+) hop0=([01])$/);
  if (!m) return null;
  return {
    tiers: Number(m[1]),
    minHop: Number(m[2]),
    maxHop: Number(m[3]),
    hop0: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function defaultTierCatalogStatusLineMatches(tiers: readonly TierBoardInput[]): boolean {
  const p = parseDefaultTierCatalogStatusLine(defaultTierCatalogStatusLine(tiers));
  if (!p) return false;
  const c = defaultTierCatalogBoardCard(tiers);
  return p.tiers === c.tiers && p.minHop === c.minHop && p.maxHop === c.maxHop && p.hop0 === c.hasHop0;
}

/** L3 — min ≤ max; hop0 when tiers>0 for default product. */
export function defaultTierCatalogStatusLineConsistent(line: string): boolean {
  const p = parseDefaultTierCatalogStatusLine(line);
  if (!p) return false;
  if (p.tiers === 0) return p.minHop === -1;
  return p.minHop <= p.maxHop;
}

/** L3 — export header. */
export function defaultTierCatalogExportHeader(): string {
  return 'hop,rate';
}

/** L3 — export lines. */
export function defaultTierCatalogExportLines(tiers: readonly TierBoardInput[]): readonly string[] {
  return tiers.map((t) => `${t.hop},${t.rate}`);
}

/** L3 — full export. */
export function defaultTierCatalogExportText(tiers: readonly TierBoardInput[]): string {
  return [defaultTierCatalogExportHeader(), ...defaultTierCatalogExportLines(tiers)].join('\n');
}

/** L3 — rate is decimal string shape [0,1]. */
export function isDecimalRateString(rate: string): boolean {
  return /^(0(\.\d{1,18})?|1(\.0{1,18})?)$/.test(rate);
}

/** L3 — all rates are decimal strings. */
export function defaultTierRatesAreDecimalStrings(tiers: readonly TierBoardInput[]): boolean {
  return tiers.every((t) => isDecimalRateString(t.rate));
}
