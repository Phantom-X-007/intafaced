/**
 * Convert a QuantLib IEEE-754 binary64 into a decimal string at the adapter
 * boundary. Exact (the actual float, not a rounded marketing figure).
 *
 * Never returns a `number`. Non-finite values refuse — they are not Greeks.
 */

export class IeeeNonFiniteError extends Error {
  constructor() {
    super('QuantLib returned a non-finite IEEE value — refusing rather than inventing a Greek');
    this.name = 'IeeeNonFiniteError';
  }
}

/**
 * Exact decimal representation of a finite float64.
 *
 * `value = mantissa × 2^exp2` with mantissa an integer (implicit 52-bit
 * fraction plus hidden bit, or subnormal). Negative powers of two become
 * `mantissa × 5^p / 10^p`.
 */
export function ieeeFloat64ToDecimalString(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new IeeeNonFiniteError();
  }
  if (value === 0) return '0';

  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  const bits = view.getBigUint64(0, true);

  const negative = bits >> 63n === 1n;
  const expBits = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);

  let mantissa: bigint;
  let exp2: number;
  if (expBits === 0) {
    mantissa = frac;
    exp2 = -1022 - 52;
  } else {
    mantissa = frac + (1n << 52n);
    exp2 = expBits - 1023 - 52;
  }

  let digits: string;
  if (exp2 >= 0) {
    digits = (mantissa << BigInt(exp2)).toString();
  } else {
    const p = -exp2;
    const scaled = mantissa * 5n ** BigInt(p);
    const s = scaled.toString().padStart(p + 1, '0');
    const cut = s.length - p;
    const whole = s.slice(0, cut);
    const fracPart = s.slice(cut).replace(/0+$/, '');
    digits = fracPart.length === 0 ? whole : `${whole}.${fracPart}`;
  }

  return negative ? `-${digits}` : digits;
}
