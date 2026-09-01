/**
 * Decimal-string discipline for the SBE adapter wire.
 *
 * This is not the ledger. Do not import ledger-client here — adapter ≠ book.
 * Inputs that are JS numbers are refused (IEEE never enters the public API).
 */

const SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export const MONEY_FIELDS = ['price', 'qty'] as const;
export type MoneyField = (typeof MONEY_FIELDS)[number];

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
      message: `${field} is an IEEE number — SBE mantissa/exponent become decimal strings at this boundary`,
    };
  }
  if (typeof value !== 'string') {
    return {
      ok: false,
      reason: 'missing_input',
      message: `${field} is ${typeof value}, expected a decimal string`,
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
