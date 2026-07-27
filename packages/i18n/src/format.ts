/**
 * Locale-aware formatting.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a money amount arrives as a decimal
 * string and is never parsed to a float. Not here, not anywhere.
 *
 * `packages/ledger-client/src/money.ts` carries 18 decimal places in a scaled
 * bigint because Postgres stores `numeric(38,18)` and the ledger reconciles to
 * the last digit. `Number('1234.123456789012345678')` returns
 * 1234.1234567890124 — four digits gone, silently, at the last step before a
 * user reads their balance. So the formatting path here works on the digit
 * string directly:
 *
 *   1. split the decimal string into sign / integer digits / fraction digits;
 *   2. round the fraction with string + BigInt arithmetic when the display
 *      precision is shorter than the value;
 *   3. format the INTEGER part with `Intl.NumberFormat` on a BigInt, using
 *      `formatToParts` so we get the locale's grouping, currency placement and
 *      sign position without inventing any of it;
 *   4. splice the fraction digits back in, transliterated into the locale's
 *      numbering system and separated by the locale's decimal separator — both
 *      obtained from `Intl` itself, never hardcoded.
 *
 * There is no `Number()`, no `parseFloat`, and no arithmetic on the value
 * anywhere in this file.
 *
 * Currency metadata is not reimplemented here — it lives in
 * `@intafaced/config`'s fiat registry (§6.2: "100+ fiat currencies = config,
 * not code") and is re-exported below.
 */
import { fiat } from '@intafaced/config/fiat';
import { DEFAULT_LOCALE, intlTagFor } from './locales.js';

export { fiat, FIAT_CURRENCIES, enabledFiat, isSupportedFiat } from '@intafaced/config/fiat';
export type { FiatCurrency } from '@intafaced/config/fiat';

/**
 * Display precision for an asset with no ISO minor-unit entry (BTC, IFC, …).
 * The ledger still carries 18; this is what a human reads.
 */
export const DEFAULT_ASSET_DECIMALS = 8;

/** Thrown when a caller hands the formatter something that is not a decimal string. */
export class AmountFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmountFormatError';
  }
}

// ── Decimal-string primitives (no floats, ever) ─────────────────────────────

interface DecimalParts {
  readonly negative: boolean;
  /** Integer digits, as a digit string. */
  readonly whole: string;
  /** Fraction digits, as a digit string. No leading dot. */
  readonly frac: string;
}

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d*))?$/;

function splitDecimal(input: string): DecimalParts {
  const trimmed = input.trim();
  const match = DECIMAL_RE.exec(trimmed);
  if (!match) {
    throw new AmountFormatError(`Expected a decimal string, got "${input}" — money never crosses this boundary as a number`);
  }
  const [, sign, whole = '0', frac = ''] = match;
  const allZero = /^0*$/.test(whole) && /^0*$/.test(frac);
  return { negative: sign === '-' && !allZero, whole, frac };
}

/**
 * Round a decimal string to `digits` fraction digits, half-up, with the carry
 * propagated into the integer part as a BigInt. String and BigInt only.
 */
function roundDecimal(value: DecimalParts, digits: number): DecimalParts {
  if (value.frac.length <= digits) return value;

  const keep = value.frac.slice(0, digits);
  const nextDigit = value.frac.charAt(digits);
  const roundUp = nextDigit >= '5';
  if (!roundUp) return { ...value, frac: keep };

  if (digits === 0) {
    return { ...value, whole: (BigInt(value.whole) + 1n).toString(), frac: '' };
  }

  const bumped = BigInt(keep) + 1n;
  const bumpedStr = bumped.toString();
  if (bumpedStr.length > digits) {
    // The fraction carried: 0.99 → 1.0 at one digit.
    return { ...value, whole: (BigInt(value.whole) + 1n).toString(), frac: '0'.repeat(digits) };
  }
  return { ...value, frac: bumpedStr.padStart(digits, '0') };
}

/** Move the decimal point `places` to the right. Used by percent — a shift, not a multiply. */
function shiftRight(value: DecimalParts, places: number): DecimalParts {
  const padded = value.frac.padEnd(places, '0');
  const moved = padded.slice(0, places);
  const rest = padded.slice(places);
  const whole = (value.whole + moved).replace(/^0+(?=\d)/, '');
  return { negative: value.negative, whole, frac: rest };
}

// ── Intl plumbing (cached — the constructors are the expensive part) ─────────

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();
const relativeFormatCache = new Map<string, Intl.RelativeTimeFormat>();
const digitCache = new Map<string, readonly string[]>();
const separatorCache = new Map<string, string>();
const minusCache = new Map<string, string>();
const percentTemplateCache = new Map<string, { prefix: string; suffix: string }>();

function numberFormat(tag: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  let nf = numberFormatCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(tag, options);
    numberFormatCache.set(key, nf);
  }
  return nf;
}

/** The locale's own glyphs for 0–9, asked of `Intl` rather than assumed. */
function localeDigits(tag: string): readonly string[] {
  let digits = digitCache.get(tag);
  if (!digits) {
    const nf = numberFormat(tag, { useGrouping: false });
    digits = Array.from({ length: 10 }, (_, d) => nf.format(BigInt(d)));
    digitCache.set(tag, digits);
  }
  return digits;
}

function decimalSeparator(tag: string): string {
  let sep = separatorCache.get(tag);
  if (sep === undefined) {
    const parts = numberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).formatToParts(1n);
    sep = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    separatorCache.set(tag, sep);
  }
  return sep;
}

function minusSign(tag: string): string {
  let sign = minusCache.get(tag);
  if (sign === undefined) {
    const parts = numberFormat(tag, {}).formatToParts(-1n);
    sign = parts.find((p) => p.type === 'minusSign')?.value ?? '-';
    minusCache.set(tag, sign);
  }
  return sign;
}

/** ASCII digit string → the locale's numbering system. */
function toLocaleDigits(digits: string, tag: string): string {
  const glyphs = localeDigits(tag);
  if (glyphs[0] === '0') return digits;
  let out = '';
  for (const ch of digits) {
    out += glyphs[ch.charCodeAt(0) - 48] ?? ch;
  }
  return out;
}

/**
 * Render a decimal string through a formatter whose fraction digits are pinned
 * to zero, then splice our own exact fraction back in.
 */
function renderExact(value: DecimalParts, nf: Intl.NumberFormat, tag: string, minFrac: number, maxFrac: number): string {
  const rounded = roundDecimal(value, maxFrac);

  let frac = rounded.frac.slice(0, maxFrac).replace(/0+$/, '');
  if (frac.length < minFrac) frac = frac.padEnd(minFrac, '0');

  const wholeValue = BigInt(rounded.whole);
  const signed = rounded.negative ? -wholeValue : wholeValue;
  const parts = nf.formatToParts(signed);

  let lastInteger = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]?.type === 'integer') lastInteger = i;
  }

  let out = '';
  for (let i = 0; i < parts.length; i++) {
    out += parts[i]?.value ?? '';
    if (i === lastInteger && frac.length > 0) {
      out += decimalSeparator(tag) + toLocaleDigits(frac, tag);
    }
  }

  // BigInt has no negative zero, so "-0.5" would lose its sign. Put it back
  // using the locale's own minus glyph.
  if (rounded.negative && wholeValue === 0n) out = minusSign(tag) + out;

  return out;
}

// ── Money ───────────────────────────────────────────────────────────────────

export type CurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name' | 'none';

export interface MoneyFormatOptions {
  /** Defaults to the currency's ISO minor units, or 0 for assets with none. */
  readonly minFractionDigits?: number;
  /** Defaults to the currency's ISO minor units, or `DEFAULT_ASSET_DECIMALS`. Pass 18 to show everything. */
  readonly maxFractionDigits?: number;
  /**
   * How the currency itself is shown. `'name'` leaves pluralisation of the
   * currency name to `Intl`, which only sees the integer part — prefer
   * `'symbol'` or `'code'` on money surfaces.
   */
  readonly display?: CurrencyDisplay;
  readonly useGrouping?: boolean;
}

/**
 * Format a money amount for display.
 *
 * @param amount   Decimal string, exactly as it crossed the service boundary.
 *                 Never a `number` — the signature is the enforcement.
 * @param currency ISO 4217 code (formatted as currency) or an asset ticker such
 *                 as `BTC` / `USDT` (formatted as a number with the ticker).
 * @param locale   App locale code from the registry, or any BCP-47 tag.
 */
export function formatMoney(amount: string, currency: string, locale: string = DEFAULT_LOCALE, options: MoneyFormatOptions = {}): string {
  const value = splitDecimal(amount);
  const tag = intlTagFor(locale);
  const code = currency.trim().toUpperCase();
  const known = fiat(code);
  const display = options.display ?? 'symbol';

  const maxFrac = options.maxFractionDigits ?? known?.minorUnits ?? DEFAULT_ASSET_DECIMALS;
  const minFrac = Math.min(options.minFractionDigits ?? known?.minorUnits ?? 0, maxFrac);
  const useGrouping = options.useGrouping ?? true;

  // `Intl` only accepts well-formed ISO-style currency codes, and only knows
  // the ones in CLDR. Anything else (USDT, IFC, an on-chain ticker) is rendered
  // as a plain number with the ticker beside it.
  if (display === 'none' || !known) {
    const nf = numberFormat(tag, { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping });
    const rendered = renderExact(value, nf, tag, minFrac, maxFrac);
    return display === 'none' ? rendered : `${rendered} ${code}`;
  }

  const nf = numberFormat(tag, {
    style: 'currency',
    currency: known.code,
    currencyDisplay: display,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping,
  });
  return renderExact(value, nf, tag, minFrac, maxFrac);
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export interface NumberFormatOptions {
  readonly minFractionDigits?: number;
  /** Defaults to "everything the string carries" — precision is never dropped by accident. */
  readonly maxFractionDigits?: number;
  readonly useGrouping?: boolean;
  readonly notation?: 'standard' | 'compact';
}

/**
 * Format a number. Decimal strings take the exact path; `number` and `bigint`
 * go straight to `Intl`. If the value came from a balance, it is a string.
 */
export function formatNumber(value: string | number | bigint, locale: string = DEFAULT_LOCALE, options: NumberFormatOptions = {}): string {
  const tag = intlTagFor(locale);
  const useGrouping = options.useGrouping ?? true;
  const notation = options.notation ?? 'standard';

  if (typeof value !== 'string') {
    return numberFormat(tag, {
      minimumFractionDigits: options.minFractionDigits ?? 0,
      maximumFractionDigits: options.maxFractionDigits ?? Math.max(options.minFractionDigits ?? 0, 3),
      useGrouping,
      notation,
    }).format(value);
  }

  const parts = splitDecimal(value);
  const maxFrac = options.maxFractionDigits ?? parts.frac.length;
  const minFrac = Math.min(options.minFractionDigits ?? 0, maxFrac);
  const nf = numberFormat(tag, { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping });
  return renderExact(parts, nf, tag, minFrac, maxFrac);
}

// ── Percent ─────────────────────────────────────────────────────────────────

export interface PercentFormatOptions {
  readonly minFractionDigits?: number;
  readonly maxFractionDigits?: number;
  /** Prefix positive values with the locale's plus sign — for 24h change columns. */
  readonly signDisplay?: boolean;
}

function percentTemplate(tag: string): { prefix: string; suffix: string } {
  let template = percentTemplateCache.get(tag);
  if (!template) {
    const parts = numberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }).formatToParts(1n);
    const numeric = new Set<string>(['integer', 'group', 'decimal', 'fraction', 'minusSign', 'plusSign']);
    let prefix = '';
    let suffix = '';
    let seenNumber = false;
    for (const part of parts) {
      if (numeric.has(part.type)) {
        seenNumber = true;
        continue;
      }
      if (seenNumber) suffix += part.value;
      else prefix += part.value;
    }
    template = { prefix, suffix };
    percentTemplateCache.set(tag, template);
  }
  return template;
}

/**
 * Format a ratio as a percentage. `'0.0432'` → `4.32%`.
 *
 * The ×100 is a decimal-point shift on the digit string, not a multiplication,
 * so a rate quoted to 18 places stays exact.
 */
export function formatPercent(ratio: string | number, locale: string = DEFAULT_LOCALE, options: PercentFormatOptions = {}): string {
  const tag = intlTagFor(locale);
  const value = shiftRight(splitDecimal(typeof ratio === 'string' ? ratio : ratio.toFixed(10)), 2);

  const maxFrac = options.maxFractionDigits ?? 2;
  const minFrac = Math.min(options.minFractionDigits ?? 0, maxFrac);
  const nf = numberFormat(tag, { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true });

  const rendered = renderExact(value, nf, tag, minFrac, maxFrac);
  const { prefix, suffix } = percentTemplate(tag);
  const signed = options.signDisplay && !value.negative && /[1-9]/.test(value.whole + value.frac) ? `+${rendered}` : rendered;
  return `${prefix}${signed}${suffix}`;
}

// ── Dates ───────────────────────────────────────────────────────────────────

export type DateInput = Date | number | string;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new AmountFormatError(`Not a date: "${String(value)}"`);
  return date;
}

function dateFormat(tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  let df = dateFormatCache.get(key);
  if (!df) {
    df = new Intl.DateTimeFormat(tag, options);
    dateFormatCache.set(key, df);
  }
  return df;
}

/** Format a date or timestamp. Defaults to a medium date in the locale's own calendar conventions. */
export function formatDate(
  value: DateInput,
  locale: string = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return dateFormat(intlTagFor(locale), options).format(toDate(value));
}

/** Date plus time — the default for ledger and order history rows. */
export function formatDateTime(
  value: DateInput,
  locale: string = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return dateFormat(intlTagFor(locale), options).format(toDate(value));
}

export interface RelativeTimeOptions {
  /** Defaults to now. Injected in tests so relative time is deterministic. */
  readonly now?: DateInput;
  /** `'auto'` yields "yesterday" where the language has a word for it. */
  readonly numeric?: 'auto' | 'always';
}

const RELATIVE_UNITS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

/**
 * "3 minutes ago", "in 2 days" — via `Intl.RelativeTimeFormat`, which owns the
 * grammar for every language we ship.
 */
export function formatRelativeTime(value: DateInput, locale: string = DEFAULT_LOCALE, options: RelativeTimeOptions = {}): string {
  const tag = intlTagFor(locale);
  const numeric = options.numeric ?? 'auto';
  const key = `${tag}|${numeric}`;
  let rtf = relativeFormatCache.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(tag, { numeric });
    relativeFormatCache.set(key, rtf);
  }

  const from = toDate(options.now ?? Date.now()).getTime();
  const delta = toDate(value).getTime() - from;
  const magnitude = Math.abs(delta);

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (magnitude >= ms) return rtf.format(Math.round(delta / ms), unit);
  }
  return rtf.format(0, 'second');
}
