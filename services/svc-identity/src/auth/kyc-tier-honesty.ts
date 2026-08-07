/**
 * Identity L3 — pure KYC tier catalog honesty (structural only).
 *
 * Mirrors auth-service.ts KycTier: none | basic | full | institutional.
 * Does not invent jurisdiction gates or access numbers.
 */

export const KYC_TIERS = ['none', 'basic', 'full', 'institutional'] as const;
export type KycTierId = (typeof KYC_TIERS)[number];

/** L3 — catalog board. */
export function kycTierCatalogBoardCard(): {
  readonly tiers: number;
  readonly hasNone: number;
  readonly hasBasic: number;
  readonly hasFull: number;
  readonly hasInstitutional: number;
} {
  return {
    tiers: KYC_TIERS.length,
    hasNone: KYC_TIERS.includes('none') ? 1 : 0,
    hasBasic: KYC_TIERS.includes('basic') ? 1 : 0,
    hasFull: KYC_TIERS.includes('full') ? 1 : 0,
    hasInstitutional: KYC_TIERS.includes('institutional') ? 1 : 0,
  };
}

/** L3 — status line. */
export function kycTierCatalogStatusLine(): string {
  const c = kycTierCatalogBoardCard();
  return `tiers=${c.tiers} none=${c.hasNone} basic=${c.hasBasic} full=${c.hasFull} institutional=${c.hasInstitutional}`;
}

/** L3 — parse status. */
export function parseKycTierCatalogStatusLine(line: string): {
  readonly tiers: number;
  readonly none: number;
  readonly basic: number;
  readonly full: number;
  readonly institutional: number;
} | null {
  const m = line.trim().match(/^tiers=(\d+) none=([01]) basic=([01]) full=([01]) institutional=([01])$/);
  if (!m) return null;
  return {
    tiers: Number(m[1]),
    none: Number(m[2]),
    basic: Number(m[3]),
    full: Number(m[4]),
    institutional: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function kycTierCatalogStatusLineMatches(): boolean {
  const p = parseKycTierCatalogStatusLine(kycTierCatalogStatusLine());
  if (!p) return false;
  const c = kycTierCatalogBoardCard();
  return (
    p.tiers === c.tiers && p.none === c.hasNone && p.basic === c.hasBasic && p.full === c.hasFull && p.institutional === c.hasInstitutional
  );
}

/** L3 — four tiers declared. */
export function kycTierCatalogStatusLineConsistent(line: string): boolean {
  const p = parseKycTierCatalogStatusLine(line);
  if (!p) return false;
  return p.tiers === 4 && p.none === 1 && p.basic === 1 && p.full === 1 && p.institutional === 1;
}

/** L3 — export header. */
export function kycTierCatalogExportHeader(): string {
  return 'kyc_tier';
}

/** L3 — export lines. */
export function kycTierCatalogExportLines(): readonly string[] {
  return [...KYC_TIERS];
}

/** L3 — full export. */
export function kycTierCatalogExportText(): string {
  return [kycTierCatalogExportHeader(), ...kycTierCatalogExportLines()].join('\n');
}

/** L3 — tier declared. */
export function isDeclaredKycTier(tier: string): boolean {
  return (KYC_TIERS as readonly string[]).includes(tier);
}
