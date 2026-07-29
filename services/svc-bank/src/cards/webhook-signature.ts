import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * WEBHOOK SIGNATURE VERIFICATION, for card issuer adapters.
 *
 * ⚠ This is the same algorithm as `services/svc-pay/src/rails/webhook-signature.ts`.
 * It is duplicated rather than imported because AGENT_PROTOCOL §2 forbids one
 * service importing another's internals, and promoting it to a shared package
 * is its own PR (noted in the README). Duplicating a security primitive is a
 * real cost; importing across a service boundary is a worse one, and a third
 * copy is the point at which the package becomes mandatory.
 *
 * The rules, and why each is here:
 *
 *  1. Sign the RAW body. A signature covers bytes. Parse-then-reserialise
 *     changes key order and whitespace and breaks honest deliveries.
 *  2. Sign the timestamp WITH the body, or a signature stays valid forever and
 *     anyone who observes one delivery can replay it indefinitely.
 *  3. Compare in constant time. `===` on a hex string returns as soon as two
 *     bytes differ, and an attacker who can measure that forges a signature one
 *     byte at a time. A forged webhook here says "captured" about money that
 *     never moved.
 *  4. `timingSafeEqual` THROWS on length mismatch — itself a length oracle and,
 *     worse, an unhandled exception on a public endpoint. Length is compared
 *     first and separately. Length is not a secret; the bytes are.
 *  5. Never throw. Garbage in returns false, every time.
 */

export interface SignatureCheck {
  readonly body: string;
  readonly signature: string | undefined;
  /** Unix seconds the sender claims to have signed at. */
  readonly timestamp: string | undefined;
  readonly secret: string;
  readonly toleranceSeconds: number;
  readonly now: Date;
}

/** `HMAC-SHA256(secret, "<timestamp>.<body>")`, hex. Exported so tests and the sender agree. */
export function signCardPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyCardSignature(check: SignatureCheck): boolean {
  const { signature, timestamp, secret, body } = check;

  if (!signature || !timestamp || !secret) return false;

  // Freshness first, and outside the constant-time comparison: a stale but
  // correctly signed delivery is a replay, and there is no secret to leak in
  // refusing it.
  const signedAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(signedAt)) return false;
  if (Math.abs(check.now.getTime() / 1000 - signedAt) > check.toleranceSeconds) return false;

  const expected = signCardPayload(secret, timestamp, body);

  // Hex only. `Buffer.from(x, 'hex')` silently truncates at the first invalid
  // character, so "zz" becomes a zero-length buffer that compares equal to
  // another zero-length buffer — a signature of nothing verifying nothing.
  if (!/^[0-9a-f]+$/i.test(signature)) return false;

  const provided = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (provided.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(provided, expectedBuf);
  } catch {
    // Unreachable given the length check, and kept anyway: the contract with
    // the adapters is that this never throws.
    return false;
  }
}
