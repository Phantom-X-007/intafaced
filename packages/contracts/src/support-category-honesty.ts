/**
 * Contracts L3 — pure support ticket category catalog honesty (no service I/O).
 *
 * Complements support-honesty status boards with category-only catalog.
 */

export const SUPPORT_CATEGORIES = ['account', 'trading', 'deposit_withdraw', 'other'] as const;

/** L3 — catalog board. */
export function supportCategoryCatalogBoardCard(): {
  readonly categories: number;
  readonly hasDepositWithdraw: number;
  readonly hasOther: number;
} {
  return {
    categories: SUPPORT_CATEGORIES.length,
    hasDepositWithdraw: SUPPORT_CATEGORIES.includes('deposit_withdraw') ? 1 : 0,
    hasOther: SUPPORT_CATEGORIES.includes('other') ? 1 : 0,
  };
}

/** L3 — status line. */
export function supportCategoryCatalogStatusLine(): string {
  const c = supportCategoryCatalogBoardCard();
  return `categories=${c.categories} deposit_withdraw=${c.hasDepositWithdraw} other=${c.hasOther}`;
}

/** L3 — parse status. */
export function parseSupportCategoryCatalogStatusLine(line: string): {
  readonly categories: number;
  readonly depositWithdraw: number;
  readonly other: number;
} | null {
  const m = line
    .trim()
    .match(/^categories=(\d+) deposit_withdraw=([01]) other=([01])$/);
  if (!m) return null;
  return {
    categories: Number(m[1]),
    depositWithdraw: Number(m[2]),
    other: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function supportCategoryCatalogStatusLineMatches(): boolean {
  const p = parseSupportCategoryCatalogStatusLine(supportCategoryCatalogStatusLine());
  if (!p) return false;
  const c = supportCategoryCatalogBoardCard();
  return (
    p.categories === c.categories &&
    p.depositWithdraw === c.hasDepositWithdraw &&
    p.other === c.hasOther
  );
}

/** L3 — four categories. */
export function supportCategoryCatalogStatusLineConsistent(line: string): boolean {
  const p = parseSupportCategoryCatalogStatusLine(line);
  if (!p) return false;
  return p.categories === 4 && p.depositWithdraw === 1 && p.other === 1;
}

/** L3 — export header. */
export function supportCategoryCatalogExportHeader(): string {
  return 'category';
}

/** L3 — export lines. */
export function supportCategoryCatalogExportLines(): readonly string[] {
  return [...SUPPORT_CATEGORIES];
}

/** L3 — full export. */
export function supportCategoryCatalogExportText(): string {
  return [supportCategoryCatalogExportHeader(), ...supportCategoryCatalogExportLines()].join('\n');
}

/** L3 — category declared. */
export function isDeclaredSupportCategory(category: string): boolean {
  return (SUPPORT_CATEGORIES as readonly string[]).includes(category);
}
