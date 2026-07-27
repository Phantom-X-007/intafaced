/**
 * Money.
 *
 * Postgres stores numeric(38,18). In TypeScript that is a scaled bigint — never
 * a `number`. A float cannot represent 0.1, and the ledger reconciles to 18
 * decimal places (§4.2), so floats are simply not allowed anywhere near a
 * balance. The wire format is a decimal string; the internal format is bigint
 * scaled by 10^18.
 *
 * Rounding is always explicit. There is no default rounding mode, because
 * "whichever way the language rounds" is how a book drifts.
 */

export const DECIMALS = 18;
export const SCALE = 10n ** BigInt(DECIMALS);

/** A decimal string as it crosses a service boundary, e.g. "1234.5". */
export type AmountString = string;

/** Scaled integer representation: value * 10^18. */
export type Amount = bigint;

const AMOUNT_RE = /^(-)?(\d+)(?:\.(\d+))?$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Parse a decimal string into the scaled bigint. Rejects anything lossy. */
export function parseAmount(input: AmountString | Amount): Amount {
  if (typeof input === 'bigint') return input;
  if (typeof input !== 'string') throw new MoneyError(`Amount must be a decimal string, got ${typeof input}`);

  const trimmed = input.trim();
  const m = AMOUNT_RE.exec(trimmed);
  if (!m) throw new MoneyError(`Malformed amount "${input}" — expected an optionally signed decimal string`);

  const [, sign, whole, frac = ''] = m;
  if (frac.length > DECIMALS) {
    throw new MoneyError(`Amount "${input}" has ${frac.length} decimal places; the ledger carries ${DECIMALS}`);
  }

  const padded = frac.padEnd(DECIMALS, '0');
  const value = BigInt(whole ?? '0') * SCALE + BigInt(padded || '0');
  return sign === '-' ? -value : value;
}

/** Canonical decimal string: no trailing zeros, no exponent, "0" for zero. */
export function formatAmount(value: Amount): AmountString {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = abs % SCALE;

  if (frac === 0n) return `${negative ? '-' : ''}${whole}`;

  const fracStr = frac.toString().padStart(DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}.${fracStr}`;
}

export const ZERO: Amount = 0n;

export function add(a: Amount, b: Amount): Amount {
  return a + b;
}

export function sub(a: Amount, b: Amount): Amount {
  return a - b;
}

export function neg(a: Amount): Amount {
  return -a;
}

export function abs(a: Amount): Amount {
  return a < 0n ? -a : a;
}

export function isZero(a: Amount): boolean {
  return a === 0n;
}

export function isNegative(a: Amount): boolean {
  return a < 0n;
}

export function compare(a: Amount, b: Amount): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function min(a: Amount, b: Amount): Amount {
  return a < b ? a : b;
}

export function max(a: Amount, b: Amount): Amount {
  return a > b ? a : b;
}

export type Rounding = 'floor' | 'ceil' | 'half-up';

function divideScaled(numerator: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');

  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;

  let q = n / d;
  const r = n % d;

  if (r !== 0n) {
    switch (rounding) {
      case 'ceil':
        // Ceil on the true value: away from zero for positives, toward zero for negatives.
        if (!negative) q += 1n;
        break;
      case 'floor':
        if (negative) q += 1n;
        break;
      case 'half-up':
        if (r * 2n >= d) q += 1n;
        break;
    }
  }

  return negative ? -q : q;
}

/**
 * Multiply two scaled amounts (e.g. price × quantity). Rounding must be stated.
 */
export function mul(a: Amount, b: Amount, rounding: Rounding = 'half-up'): Amount {
  return divideScaled(a * b, SCALE, rounding);
}

/** Divide two scaled amounts. Rounding must be stated. */
export function div(a: Amount, b: Amount, rounding: Rounding = 'half-up'): Amount {
  if (b === 0n) throw new MoneyError('Division by zero');
  return divideScaled(a * SCALE, b, rounding);
}

/**
 * Apply a basis-point rate (1 bps = 0.01%).
 *
 * Fees round `ceil` by default: a fee that rounds to zero is a fee the house
 * pays. Anything credited TO a user should pass 'floor' explicitly, so rounding
 * never invents value that has to come from somewhere.
 */
export function mulBps(amount: Amount, bps: number, rounding: Rounding = 'ceil'): Amount {
  if (!Number.isInteger(bps) || bps < 0) throw new MoneyError(`bps must be a non-negative integer, got ${bps}`);
  return divideScaled(amount * BigInt(bps), 10_000n, rounding);
}

/** Sum with no intermediate rounding. */
export function sum(amounts: readonly Amount[]): Amount {
  let total = 0n;
  for (const a of amounts) total += a;
  return total;
}

/**
 * Split an amount into `parts` weighted shares with zero remainder.
 *
 * Used for pro-rata staking rewards and PPLNS mining payouts: floor every
 * share, then hand the leftover dust out one unit at a time to the largest
 * remainders. The result always sums back to exactly `total` — the ledger will
 * not accept anything less.
 */
export function proRata(total: Amount, weights: readonly Amount[]): Amount[] {
  const totalWeight = sum(weights);
  if (totalWeight <= 0n) throw new MoneyError('proRata requires a positive total weight');

  const shares: Amount[] = [];
  const remainders: Array<{ index: number; remainder: bigint }> = [];

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0n;
    const numerator = total * w;
    const share = numerator / totalWeight;
    shares.push(share);
    remainders.push({ index: i, remainder: numerator % totalWeight });
  }

  let dust = total - sum(shares);
  remainders.sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1));

  for (const { index } of remainders) {
    if (dust === 0n) break;
    const step = dust > 0n ? 1n : -1n;
    shares[index] = (shares[index] ?? 0n) + step;
    dust -= step;
  }

  return shares;
}

/** Convenience for tests and seeds: `amount("10.5")`. */
export const amount = parseAmount;
