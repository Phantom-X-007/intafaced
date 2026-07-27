import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * WEBHOOK SIGNATURE VERIFICATION.
 *
 * Both v1 adapters use this, and every future adapter that speaks HMAC should.
 * It exists as one function rather than one per adapter because there is
 * exactly one way to get this right and several ways to get it subtly wrong,
 * and the wrong ways all look like working code.
 *
 * The rules, and why each one is here:
 *
 *  1. Sign the RAW body. A signature covers bytes. Parse-then-reserialise
 *     changes key order and whitespace and breaks honest deliveries.
 *
 *  2. Sign the timestamp WITH the body. Signing the body alone means a
 *     signature stays valid forever, so anyone who ever observes one delivery
 *     can replay it indefinitely.
 *
 *  3. Compare in constant time (`crypto.timingSafeEqual`). `===` on a hex
 *     string returns as soon as two bytes differ, and that difference is
 *     measurable. An attacker who can measure it forges a signature one byte at
 *     a time — and a forged webhook here says "captured" about money that never
 *     moved.
 *
 *  4. `timingSafeEqual` THROWS when the two buffers differ in length, which is
 *     itself a length oracle and, worse, an unhandled exception on a public
 *     endpoint. Length is compared first and separately, and a mismatch returns
 *     false rather than throwing. Length is not a secret; the bytes are.
 *
 *  5. Never throw. A webhook endpoint is reachable by anyone on the internet.
 *     Garbage in returns false, every time.
 */

export interface SignatureCheck {
  /** The raw request body, exactly as received. */
  readonly body: string;
  /** Hex signature the sender supplied. */
  readonly signature: string | undefined;
  /** Unix seconds the sender claims to have signed at. */
  readonly timestamp: string | undefined;
  readonly secret: string;
  /** Deliveries older than this are replays. */
  readonly toleranceSeconds: number;
  readonly now: Date;
}

/** `HMAC-SHA256(secret, "<timestamp>.<body>")`, hex. Exported so tests and the sender agree. */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifySignature(check: SignatureCheck): boolean {
  const { signature, timestamp, secret, body } = check;

  if (!signature || !timestamp || !secret) return false;

  // Freshness first, and outside the constant-time comparison: a stale but
  // correctly signed delivery is a replay, and there is no secret to leak in
  // rejecting it.
  const signedAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(signedAt)) return false;
  const ageSeconds = Math.abs(check.now.getTime() / 1000 - signedAt);
  if (ageSeconds > check.toleranceSeconds) return false;

  const expected = signPayload(secret, timestamp, body);

  // Hex only. `Buffer.from(x, 'hex')` silently truncates at the first invalid
  // character, so "zz" would become a zero-length buffer and compare equal to
  // another zero-length buffer — a signature of nothing verifying nothing.
  if (!/^[0-9a-f]+$/i.test(signature)) return false;

  const provided = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  // See rule 4: length is checked here so timingSafeEqual cannot throw.
  if (provided.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(provided, expectedBuf);
  } catch {
    // Unreachable given the length check, and kept anyway: this function's
    // contract with the adapters is that it never throws.
    return false;
  }
}
