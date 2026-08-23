import { randomBytes } from 'node:crypto';

/** Stage-1 MPC custody: three named shares, with two required to reconstruct. */
export type MpcShare = Readonly<{
  holder: string;
  /** Public interpolation coordinate. The secret is never represented here. */
  x: number;
  /** Decimal wire encoding of the field element. */
  y: string;
  /** Byte length needed to preserve leading zeroes on reconstruction. */
  byteLength: number;
}>;

export class MpcCustodyRefuseError extends Error {
  constructor(
    message: string,
    readonly code: 'mpc.invalid_secret' | 'mpc.invalid_share' | 'mpc.threshold' | 'mpc.holder',
  ) {
    super(message);
    this.name = 'MpcCustodyRefuseError';
  }
}

// A 521-bit prime comfortably carries a 64-byte stage-1 secret.
const PRIME = (1n << 521n) - 1n;
const THRESHOLD = 2;
const PARTICIPANTS = 3;

function bytesToInteger(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function integerToBytes(value: bigint, byteLength: number): Uint8Array {
  const result = new Uint8Array(byteLength);
  let remaining = value;
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return result;
}

function randomFieldElement(): bigint {
  const bytes = randomBytes(66);
  let value = bytesToInteger(bytes) % PRIME;
  // A zero slope is valid but needlessly weakens a split, so sample again.
  while (value === 0n) value = bytesToInteger(randomBytes(66)) % PRIME;
  return value;
}

function mod(value: bigint): bigint {
  const result = value % PRIME;
  return result < 0n ? result + PRIME : result;
}

function inverse(value: bigint): bigint {
  // Fermat's little theorem; PRIME is prime.
  let base = mod(value);
  let exponent = PRIME - 2n;
  let result = 1n;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % PRIME;
    base = (base * base) % PRIME;
    exponent >>= 1n;
  }
  return result;
}

function validateHolders(holders: readonly string[]): [string, string, string] {
  if (holders.length !== PARTICIPANTS || holders.some((holder) => holder.trim().length === 0)) {
    throw new MpcCustodyRefuseError('exactly three named holders are required', 'mpc.holder');
  }
  const names = holders.map((holder) => holder.trim());
  if (new Set(names).size !== PARTICIPANTS) {
    throw new MpcCustodyRefuseError('holder names must be distinct', 'mpc.holder');
  }
  return names as [string, string, string];
}

export function splitSecret(secret: Uint8Array, holders: readonly string[]): MpcShare[] {
  const names = validateHolders(holders);
  if (secret.length === 0 || secret.length > 64) {
    throw new MpcCustodyRefuseError('secret must be between 1 and 64 bytes', 'mpc.invalid_secret');
  }
  const value = bytesToInteger(secret);
  if (value >= PRIME) throw new MpcCustodyRefuseError('secret is outside the field', 'mpc.invalid_secret');
  const slope = randomFieldElement();
  return names.map((holder, index) => {
    const x = BigInt(index + 1);
    return { holder, x: index + 1, y: mod(value + slope * x).toString(10), byteLength: secret.length };
  });
}

export function reconstructSecret(shares: readonly MpcShare[]): Uint8Array {
  if (shares.length < THRESHOLD) {
    throw new MpcCustodyRefuseError('two named shares are required; one share is insufficient', 'mpc.threshold');
  }
  const selected = shares.slice(0, THRESHOLD);
  if (new Set(selected.map((share) => share.holder)).size !== THRESHOLD || new Set(selected.map((share) => share.x)).size !== THRESHOLD) {
    throw new MpcCustodyRefuseError('two distinct named shares are required', 'mpc.invalid_share');
  }
  const first = selected[0]!;
  const byteLength = first.byteLength;
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > 64) {
    throw new MpcCustodyRefuseError('invalid share encoding', 'mpc.invalid_share');
  }
  const secret = selected.reduce((accumulator, share, index) => {
    const x = BigInt(share.x);
    const y = BigInt(share.y);
    if (x < 1n || x > 3n || y < 0n || y >= PRIME || share.byteLength !== byteLength) {
      throw new MpcCustodyRefuseError('invalid share encoding', 'mpc.invalid_share');
    }
    const otherX = BigInt(selected[1 - index]!.x);
    const coefficient = mod(otherX * inverse(otherX - x));
    return mod(accumulator + y * coefficient);
  }, 0n);
  if (secret >= 1n << BigInt(byteLength * 8)) {
    throw new MpcCustodyRefuseError('reconstructed secret is invalid', 'mpc.invalid_share');
  }
  return integerToBytes(secret, byteLength);
}

/** In-memory holder; production wrapping/HSM remains an explicit Class-X seam. */
export class MpcCustodyStage1 {
  readonly holders: readonly [string, string, string];
  private readonly held = new Map<string, MpcShare>();

  constructor(holders: readonly string[]) {
    this.holders = validateHolders(holders);
  }

  hold(share: MpcShare): void {
    if (!this.holders.includes(share.holder)) throw new MpcCustodyRefuseError('unknown holder', 'mpc.holder');
    this.held.set(share.holder, share);
  }

  reconstruct(): Uint8Array {
    return reconstructSecret([...this.held.values()]);
  }
}

export const MpcCustody = MpcCustodyStage1;
