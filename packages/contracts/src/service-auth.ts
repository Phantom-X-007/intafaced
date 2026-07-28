import { createHmac, timingSafeEqual } from 'node:crypto';
import { TRPCError } from '@trpc/server';

/**
 * SERVICE-TO-SERVICE AUTHENTICATION (§2, §9).
 *
 * Distinct from the edge principal, and needed for a different reason.
 *
 * `packages/auth` deliberately has no `ledger:write` scope: a user token must
 * never be able to move value directly. svc-ledger's `post` documented that as
 * the reason it was safe —
 *
 *     "there is no user-facing write ... which is why packages/auth has no
 *      ledger:write scope at all"
 *
 * — and then declared `post` a `publicProcedure`. The reasoning is inverted.
 * `publicProcedure` does not check a scope, so the ABSENCE of `ledger:write`
 * protects nothing; it just means there is no scope left to check. Every one of
 * the six services calling svc-ledger over HTTP sent `content-type` and nothing
 * else, so there was no credential to verify either.
 *
 * The consequence, once svc-ledger is mounted: anyone who can reach the port
 * posts a balanced two-entry transaction crediting `railBoundary` (a `treasury`
 * account, and treasury is the one owner type allowed to run negative) and
 * debiting their own `available`. That is the `deposit` recipe. Every invariant
 * passes — sum-to-zero, non-negative, paired locks — because the transaction is
 * genuinely well-formed. It is simply not authorised, and nothing was asking.
 *
 * So callers now prove which service they are.
 *
 * ── What this signs, and what it deliberately does not ──────────────────────
 *
 * The signature covers `service` and a timestamp, NOT the request body.
 *
 * Body signing would need the raw bytes at context-creation time, and Fastify
 * has already parsed and discarded them by the time the tRPC plugin builds a
 * context. Plumbing a raw-body buffer through every mounted service to get it
 * is a large change to make in a hurry on the path that moves money.
 *
 * What this does buy is the control that was actually missing: the caller is a
 * service holding the shared secret, not an arbitrary party who found the port.
 * Body integrity between two services that both hold the secret is a smaller
 * risk than no authentication at all, and the timestamp bounds replay.
 *
 * Recorded rather than hidden: per-service keypairs and body signing are the
 * next step, and belong in their own PR.
 */

export const SERVICE_HEADER = 'x-intafaced-service';
export const SERVICE_TIMESTAMP_HEADER = 'x-intafaced-service-ts';
export const SERVICE_SIGNATURE_HEADER = 'x-intafaced-service-sig';

/** How far out of date a service call may be. Bounds replay of a captured header. */
export const SERVICE_CALL_MAX_SKEW_SECONDS = 300;

const MIN_SECRET_LENGTH = 32;

export class ServiceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceAuthError';
  }
}

function assertSecret(secret: string, context: string): void {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new ServiceAuthError(
      `${context}: INTERNAL_SERVICE_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
        'Without it, service-to-service calls are unauthenticated and `ledger.post` accepts anyone (§2).',
    );
  }
}

export function signServiceCall(service: string, secret: string, timestamp: number): string {
  assertSecret(secret, 'signServiceCall');
  // Newline-separated so ('ab', 1) and ('a', 'b1') cannot produce the same
  // preimage — a delimiter-free concatenation is forgeable across fields.
  return createHmac('sha256', secret).update(`${service}\n${timestamp}`, 'utf8').digest('hex');
}

/** The three headers a calling service must send. */
export function serviceAuthHeaders(service: string, secret: string, now: Date = new Date()): Record<string, string> {
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    [SERVICE_HEADER]: service,
    [SERVICE_TIMESTAMP_HEADER]: String(timestamp),
    [SERVICE_SIGNATURE_HEADER]: signServiceCall(service, secret, timestamp),
  };
}

export interface ServiceVerifyResult {
  service: string | null;
  rejected: 'missing' | 'bad-signature' | 'stale' | null;
}

/**
 * Verify a service caller. Fails closed: any problem yields `null`, never a
 * partially-trusted caller.
 */
export function verifyServiceCall(
  service: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: string,
  now: Date = new Date(),
): ServiceVerifyResult {
  if (!service || !timestamp || !signature) return { service: null, rejected: 'missing' };

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return { service: null, rejected: 'missing' };

  // Freshness BEFORE the comparison, so a captured header stops working even
  // though its signature stays valid forever.
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - ts);
  if (skew > SERVICE_CALL_MAX_SKEW_SECONDS) return { service: null, rejected: 'stale' };

  const expected = signServiceCall(service, secret, ts);

  // Length checked separately: timingSafeEqual THROWS on a length mismatch, and
  // non-hex must be rejected outright because Buffer.from('zz','hex') yields an
  // empty buffer and two empty buffers compare equal.
  if (signature.length !== expected.length) return { service: null, rejected: 'bad-signature' };
  if (!/^[0-9a-f]+$/.test(signature)) return { service: null, rejected: 'bad-signature' };
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return { service: null, rejected: 'bad-signature' };
  }

  return { service, rejected: null };
}

/** Read a header that may arrive repeated. */
export function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function verifyServiceHeaders(
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  now: Date = new Date(),
): ServiceVerifyResult {
  return verifyServiceCall(
    headerValue(headers, SERVICE_HEADER),
    headerValue(headers, SERVICE_TIMESTAMP_HEADER),
    headerValue(headers, SERVICE_SIGNATURE_HEADER),
    secret,
    now,
  );
}

/**
 * Guard for a procedure that only another service may call.
 *
 * Throws UNAUTHORIZED — not FORBIDDEN — because the caller has not identified
 * itself at all. A service that IS authenticated but not permitted would be a
 * different answer, and the two must stay distinguishable to a caller.
 */
export function requireServiceCaller(service: string | null): asserts service is string {
  if (!service) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'This procedure is callable only by another INTAFACED service with valid service credentials (§2)',
    });
  }
}
