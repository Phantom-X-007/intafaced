/**
 * Exchange-contract L3 — pure exchange error-code catalog honesty (structural only).
 *
 * Mirrors schemas.ts EXCHANGE_ERROR_CODES (16 tip codes).
 * Does not invent money recovery paths.
 */

export const EXCHANGE_ERROR_CODES = [
  'BadRequest',
  'BadSymbol',
  'InsufficientFunds',
  'InvalidOrder',
  'OrderNotFound',
  'OrderImmediatelyFillable',
  'OrderNotFillable',
  'DuplicateOrderId',
  'AuthenticationError',
  'PermissionDenied',
  'AccountSuspended',
  'RateLimitExceeded',
  'ExchangeNotAvailable',
  'OnMaintenance',
  'NotSupported',
  'ExchangeError',
] as const;
export type ExchangeErrorCodeId = (typeof EXCHANGE_ERROR_CODES)[number];

/** L3 — catalog board. */
export function exchangeErrorCodeCatalogBoardCard(): {
  readonly codes: number;
  readonly hasNotSupported: number;
  readonly hasRateLimit: number;
  readonly hasInsufficientFunds: number;
  readonly hasOrderNotFound: number;
} {
  return {
    codes: EXCHANGE_ERROR_CODES.length,
    hasNotSupported: EXCHANGE_ERROR_CODES.includes('NotSupported') ? 1 : 0,
    hasRateLimit: EXCHANGE_ERROR_CODES.includes('RateLimitExceeded') ? 1 : 0,
    hasInsufficientFunds: EXCHANGE_ERROR_CODES.includes('InsufficientFunds') ? 1 : 0,
    hasOrderNotFound: EXCHANGE_ERROR_CODES.includes('OrderNotFound') ? 1 : 0,
  };
}

/** L3 — status line. */
export function exchangeErrorCodeCatalogStatusLine(): string {
  const c = exchangeErrorCodeCatalogBoardCard();
  return `codes=${c.codes} not_supported=${c.hasNotSupported} rate_limit=${c.hasRateLimit} insufficient_funds=${c.hasInsufficientFunds} order_not_found=${c.hasOrderNotFound}`;
}

/** L3 — parse status. */
export function parseExchangeErrorCodeCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly notSupported: number;
  readonly rateLimit: number;
  readonly insufficientFunds: number;
  readonly orderNotFound: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) not_supported=([01]) rate_limit=([01]) insufficient_funds=([01]) order_not_found=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    notSupported: Number(m[2]),
    rateLimit: Number(m[3]),
    insufficientFunds: Number(m[4]),
    orderNotFound: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function exchangeErrorCodeCatalogStatusLineMatches(): boolean {
  const p = parseExchangeErrorCodeCatalogStatusLine(exchangeErrorCodeCatalogStatusLine());
  if (!p) return false;
  const c = exchangeErrorCodeCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.notSupported === c.hasNotSupported &&
    p.rateLimit === c.hasRateLimit &&
    p.insufficientFunds === c.hasInsufficientFunds &&
    p.orderNotFound === c.hasOrderNotFound
  );
}

/** L3 — sixteen tip codes; NotSupported present (non-retryable). */
export function exchangeErrorCodeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseExchangeErrorCodeCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 16 && p.notSupported === 1 && p.rateLimit === 1 && p.insufficientFunds === 1 && p.orderNotFound === 1;
}

/** L3 — export header. */
export function exchangeErrorCodeCatalogExportHeader(): string {
  return 'exchange_error_code';
}

/** L3 — export lines. */
export function exchangeErrorCodeCatalogExportLines(): readonly string[] {
  return [...EXCHANGE_ERROR_CODES];
}

/** L3 — full export. */
export function exchangeErrorCodeCatalogExportText(): string {
  return [exchangeErrorCodeCatalogExportHeader(), ...exchangeErrorCodeCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredExchangeErrorCode(code: string): boolean {
  return (EXCHANGE_ERROR_CODES as readonly string[]).includes(code);
}
