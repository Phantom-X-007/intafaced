/**
 * Decimal-string discipline for the QuantLib adapter wire.
 *
 * This is not the ledger. Do not import ledger-client here — adapter ≠ book.
 * Inputs that are JS numbers are refused (IEEE never enters the public API).
 */

const SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const VANILLA_FIELDS = ['strike', 'spot', 'volatility', 'timeToExpiry', 'riskFreeRate', 'dividendYield'] as const;

export type VanillaField = (typeof VANILLA_FIELDS)[number];

export type DecimalRead =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'missing_input' | 'ieee_input' | 'invalid_decimal'; readonly message: string };

export function readDecimalString(value: unknown, field: string): DecimalRead {
  if (value === undefined || value === null) {
    return { ok: false, reason: 'missing_input', message: `${field} is missing` };
  }
  if (typeof value === 'number') {
    return {
      ok: false,
      reason: 'ieee_input',
      message: `${field} is an IEEE number — QuantLib floats become decimal strings at this boundary, they do not enter as numbers`,
    };
  }
  if (typeof value !== 'string') {
    return {
      ok: false,
      reason: 'missing_input',
      message: `${field} is ${value === null ? 'null' : typeof value}, expected a decimal string`,
    };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'missing_input', message: `${field} is blank` };
  }
  if (!SIGNED_DECIMAL.test(trimmed)) {
    return {
      ok: false,
      reason: 'invalid_decimal',
      message: `${field} "${value}" is not a signed decimal string (no exponent)`,
    };
  }
  return { ok: true, value: trimmed };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type IsoDateRead =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'missing_input' | 'invalid_date'; readonly message: string };

export function readIsoDate(value: unknown, field: string): IsoDateRead {
  if (value === undefined || value === null) {
    return { ok: false, reason: 'missing_input', message: `${field} is missing` };
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, reason: 'missing_input', message: `${field} is missing` };
  }
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    return { ok: false, reason: 'invalid_date', message: `${field} "${value}" is not YYYY-MM-DD` };
  }
  return { ok: true, value: trimmed };
}
