/**
 * Contracts L3 — pure card tier catalog honesty (complements identity-tier).
 */

export const CARD_TIERS_ONLY = ['none', 'standard', 'metal', 'obsidian'] as const;

/** L3 — catalog board. */
export function cardTierCatalogBoardCard(): {
  readonly tiers: number;
  readonly hasNone: number;
  readonly hasObsidian: number;
} {
  return {
    tiers: CARD_TIERS_ONLY.length,
    hasNone: CARD_TIERS_ONLY.includes('none') ? 1 : 0,
    hasObsidian: CARD_TIERS_ONLY.includes('obsidian') ? 1 : 0,
  };
}

/** L3 — status line. */
export function cardTierCatalogStatusLine(): string {
  const c = cardTierCatalogBoardCard();
  return `tiers=${c.tiers} none=${c.hasNone} obsidian=${c.hasObsidian}`;
}

/** L3 — parse status. */
export function parseCardTierCatalogStatusLine(line: string): {
  readonly tiers: number;
  readonly none: number;
  readonly obsidian: number;
} | null {
  const m = line.trim().match(/^tiers=(\d+) none=([01]) obsidian=([01])$/);
  if (!m) return null;
  return {
    tiers: Number(m[1]),
    none: Number(m[2]),
    obsidian: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function cardTierCatalogStatusLineMatches(): boolean {
  const p = parseCardTierCatalogStatusLine(cardTierCatalogStatusLine());
  if (!p) return false;
  const c = cardTierCatalogBoardCard();
  return p.tiers === c.tiers && p.none === c.hasNone && p.obsidian === c.hasObsidian;
}

/** L3 — four tiers. */
export function cardTierCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCardTierCatalogStatusLine(line);
  if (!p) return false;
  return p.tiers === 4 && p.none === 1 && p.obsidian === 1;
}

/** L3 — export header. */
export function cardTierCatalogExportHeader(): string {
  return 'tier';
}

/** L3 — export lines. */
export function cardTierCatalogExportLines(): readonly string[] {
  return [...CARD_TIERS_ONLY];
}

/** L3 — full export. */
export function cardTierCatalogExportText(): string {
  return [cardTierCatalogExportHeader(), ...cardTierCatalogExportLines()].join('\n');
}

/** L3 — tier declared. */
export function isDeclaredCardTierOnly(tier: string): boolean {
  return (CARD_TIERS_ONLY as readonly string[]).includes(tier);
}
