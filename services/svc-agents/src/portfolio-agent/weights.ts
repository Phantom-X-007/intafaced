/**
 * Decimal-string weights. Scaled bigint in memory — never `number` for money-shaped values.
 */

const SCALE = 8n;
const UNIT = 10n ** SCALE;

export function parseWeight(raw: string): bigint | null {
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)(\.\d+)?$/.test(raw)) return null;
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > Number(SCALE)) return null;
  const n = BigInt(whole) * UNIT + BigInt(frac.padEnd(Number(SCALE), '0') || '0');
  if (n < 0n || n > UNIT) return null;
  return n;
}

export function formatWeight(n: bigint): string {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const whole = a / UNIT;
  const frac = (a % UNIT).toString().padStart(Number(SCALE), '0').replace(/0+$/, '');
  const s = frac.length === 0 ? `${whole}` : `${whole}.${frac}`;
  return neg ? `-${s}` : s;
}

export function weightUnit(): bigint {
  return UNIT;
}
