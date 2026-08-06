/**
 * Identity L3 — pure commission error-code catalog honesty (no payout).
 *
 * Mirrors commission.ts CommissionErrorCode.
 */

export const COMMISSION_ERROR_CODES = ['commission.invalid', 'commission.rate', 'commission.fee'] as const;
export type CommissionErrorCodeId = (typeof COMMISSION_ERROR_CODES)[number];

/** L3 — catalog board. */
export function commissionErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasRate: number;
  readonly hasFee: number;
} {
  return {
    codes: COMMISSION_ERROR_CODES.length,
    hasRate: COMMISSION_ERROR_CODES.includes('commission.rate') ? 1 : 0,
    hasFee: COMMISSION_ERROR_CODES.includes('commission.fee') ? 1 : 0,
  };
}

/** L3 — status line. */
export function commissionErrorCatalogStatusLine(): string {
  const c = commissionErrorCatalogBoardCard();
  return `codes=${c.codes} rate=${c.hasRate} fee=${c.hasFee}`;
}

/** L3 — parse status. */
export function parseCommissionErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly rate: number;
  readonly fee: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) rate=([01]) fee=([01])$/);
  if (!m) return null;
  return { codes: Number(m[1]), rate: Number(m[2]), fee: Number(m[3]) };
}

/** L3 — true when status matches. */
export function commissionErrorCatalogStatusLineMatches(): boolean {
  const p = parseCommissionErrorCatalogStatusLine(commissionErrorCatalogStatusLine());
  if (!p) return false;
  const c = commissionErrorCatalogBoardCard();
  return p.codes === c.codes && p.rate === c.hasRate && p.fee === c.hasFee;
}

/** L3 — three codes. */
export function commissionErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCommissionErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 3 && p.rate === 1 && p.fee === 1;
}

/** L3 — export header. */
export function commissionErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function commissionErrorCatalogExportLines(): readonly string[] {
  return [...COMMISSION_ERROR_CODES];
}

/** L3 — full export. */
export function commissionErrorCatalogExportText(): string {
  return [commissionErrorCatalogExportHeader(), ...commissionErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredCommissionErrorCode(code: string): boolean {
  return (COMMISSION_ERROR_CODES as readonly string[]).includes(code);
}
