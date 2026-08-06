/**
 * Contracts L3 — pure KYC tier catalog honesty (complements identity-tier).
 *
 * Structural KYC-only board.
 */

export const KYC_TIERS_ONLY = ['none', 'basic', 'full', 'institutional'] as const;

/** L3 — catalog board. */
export function kycTierCatalogBoardCard(): {
  readonly tiers: number;
  readonly hasNone: number;
  readonly hasInstitutional: number;
} {
  return {
    tiers: KYC_TIERS_ONLY.length,
    hasNone: KYC_TIERS_ONLY.includes('none') ? 1 : 0,
    hasInstitutional: KYC_TIERS_ONLY.includes('institutional') ? 1 : 0,
  };
}

/** L3 — status line. */
export function kycTierCatalogStatusLine(): string {
  const c = kycTierCatalogBoardCard();
  return `tiers=${c.tiers} none=${c.hasNone} institutional=${c.hasInstitutional}`;
}

/** L3 — parse status. */
export function parseKycTierCatalogStatusLine(line: string): {
  readonly tiers: number;
  readonly none: number;
  readonly institutional: number;
} | null {
  const m = line.trim().match(/^tiers=(\d+) none=([01]) institutional=([01])$/);
  if (!m) return null;
  return {
    tiers: Number(m[1]),
    none: Number(m[2]),
    institutional: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function kycTierCatalogStatusLineMatches(): boolean {
  const p = parseKycTierCatalogStatusLine(kycTierCatalogStatusLine());
  if (!p) return false;
  const c = kycTierCatalogBoardCard();
  return p.tiers === c.tiers && p.none === c.hasNone && p.institutional === c.hasInstitutional;
}

/** L3 — four tiers including none baseline. */
export function kycTierCatalogStatusLineConsistent(line: string): boolean {
  const p = parseKycTierCatalogStatusLine(line);
  if (!p) return false;
  return p.tiers === 4 && p.none === 1 && p.institutional === 1;
}

/** L3 — export header. */
export function kycTierCatalogExportHeader(): string {
  return 'tier';
}

/** L3 — export lines. */
export function kycTierCatalogExportLines(): readonly string[] {
  return [...KYC_TIERS_ONLY];
}

/** L3 — full export. */
export function kycTierCatalogExportText(): string {
  return [kycTierCatalogExportHeader(), ...kycTierCatalogExportLines()].join('\n');
}

/** L3 — tier declared. */
export function isDeclaredKycTierOnly(tier: string): boolean {
  return (KYC_TIERS_ONLY as readonly string[]).includes(tier);
}
