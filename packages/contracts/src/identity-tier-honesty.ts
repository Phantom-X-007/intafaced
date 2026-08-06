/**
 * Contracts L3 — pure identity KYC/card tier catalog honesty (no money invent).
 *
 * Structural enum boards only. Does not invent feeDiscountBps or rank numbers.
 */

export const KYC_TIERS = ['none', 'basic', 'full', 'institutional'] as const;
export const CARD_TIERS = ['none', 'standard', 'metal', 'obsidian'] as const;

/** L3 — catalog board. */
export function identityTierCatalogBoardCard(): {
  readonly kycTiers: number;
  readonly cardTiers: number;
  readonly kycNone: number;
  readonly cardNone: number;
} {
  return {
    kycTiers: KYC_TIERS.length,
    cardTiers: CARD_TIERS.length,
    kycNone: KYC_TIERS.includes('none') ? 1 : 0,
    cardNone: CARD_TIERS.includes('none') ? 1 : 0,
  };
}

/** L3 — status line. */
export function identityTierCatalogStatusLine(): string {
  const c = identityTierCatalogBoardCard();
  return `kyc=${c.kycTiers} card=${c.cardTiers} kyc_none=${c.kycNone} card_none=${c.cardNone}`;
}

/** L3 — parse status. */
export function parseIdentityTierCatalogStatusLine(line: string): {
  readonly kyc: number;
  readonly card: number;
  readonly kycNone: number;
  readonly cardNone: number;
} | null {
  const m = line.trim().match(/^kyc=(\d+) card=(\d+) kyc_none=([01]) card_none=([01])$/);
  if (!m) return null;
  return {
    kyc: Number(m[1]),
    card: Number(m[2]),
    kycNone: Number(m[3]),
    cardNone: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function identityTierCatalogStatusLineMatches(): boolean {
  const p = parseIdentityTierCatalogStatusLine(identityTierCatalogStatusLine());
  if (!p) return false;
  const c = identityTierCatalogBoardCard();
  return p.kyc === c.kycTiers && p.card === c.cardTiers && p.kycNone === c.kycNone && p.cardNone === c.cardNone;
}

/** L3 — both catalogs include none baseline. */
export function identityTierCatalogStatusLineConsistent(line: string): boolean {
  const p = parseIdentityTierCatalogStatusLine(line);
  if (!p) return false;
  return p.kyc === 4 && p.card === 4 && p.kycNone === 1 && p.cardNone === 1;
}

/** L3 — export header. */
export function identityTierCatalogExportHeader(): string {
  return 'kyc,card,kyc_none,card_none';
}

/** L3 — export line. */
export function identityTierCatalogExportLine(): string {
  const c = identityTierCatalogBoardCard();
  return `${c.kycTiers},${c.cardTiers},${c.kycNone},${c.cardNone}`;
}

/** L3 — full export. */
export function identityTierCatalogExportText(): string {
  return [identityTierCatalogExportHeader(), identityTierCatalogExportLine()].join('\n');
}

/** L3 — kyc declared. */
export function isDeclaredKycTier(tier: string): boolean {
  return (KYC_TIERS as readonly string[]).includes(tier);
}

/** L3 — card declared. */
export function isDeclaredCardTier(tier: string): boolean {
  return (CARD_TIERS as readonly string[]).includes(tier);
}

/** L3 — names. */
export function kycTierNames(): readonly string[] {
  return [...KYC_TIERS];
}

/** L3 — names. */
export function cardTierNames(): readonly string[] {
  return [...CARD_TIERS];
}
