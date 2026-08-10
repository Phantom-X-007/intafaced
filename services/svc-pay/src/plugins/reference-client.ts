/**
 * pay.plugins — TypeScript reference client (not Woo/Magento/OpenCart PHP).
 *
 * Harvest / LANE-CLOSEOUT: "Wrong stack; pay.plugins is residual craft on our
 * API" → one reference client whose tests fail when the public API contract
 * breaks, plus frozen webhook signature vectors.
 *
 * Merchants embed this shape in their storefront/backend. We do not ship three
 * CMS plugins; we ship the contract + vectors they all share.
 *
 * No money moves here. No second book. Amounts are always decimal strings.
 */

import { createHmac } from 'node:crypto';

/** Public REST base path (ADR pay.public-api / merchant quickstart). */
export const PAY_PUBLIC_API_BASE = '/api/pay/v1';

/** Scopes a merchant key may carry. */
export type PayPluginScope = 'pay:read' | 'pay:write' | 'pay:refund';

export type PayPluginKeyMode = 'live' | 'sandbox';

export interface PayPluginClientOptions {
  /** Edge origin, e.g. https://pay.example.com — no trailing slash. */
  readonly baseUrl: string;
  /** Raw API key (shown once at create). Never logged by this client. */
  readonly apiKey: string;
  /** Optional fetch inject for tests. */
  readonly fetch?: typeof fetch;
}

export interface CreatePaymentBody {
  readonly merchantId: string;
  /** Decimal string — never a JSON number. */
  readonly amount: string;
  readonly assetId: string;
  readonly method: string;
  readonly railAdapter?: string;
  readonly profileId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PluginRequest {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

/**
 * Build (do not send) a create-payment request with the public contract pins:
 * Authorization Bearer, Content-Type JSON, Idempotency-Key, decimal amount string.
 */
export function buildCreatePaymentRequest(opts: PayPluginClientOptions, body: CreatePaymentBody, idempotencyKey: string): PluginRequest {
  if (!idempotencyKey.trim()) {
    throw new Error('pay.plugins: Idempotency-Key is required on money POSTs');
  }
  assertDecimalAmount(body.amount);
  const raw = JSON.stringify(body);
  // Guard: JSON must not re-encode amount as a number.
  const parsed = JSON.parse(raw) as { amount: unknown };
  if (typeof parsed.amount !== 'string') {
    throw new Error('pay.plugins: amount must serialise as a JSON string');
  }
  return {
    method: 'POST',
    path: `${PAY_PUBLIC_API_BASE}/payments`,
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: raw,
  };
}

export function buildGetPaymentRequest(opts: PayPluginClientOptions, paymentId: string): PluginRequest {
  if (!paymentId.trim()) throw new Error('pay.plugins: paymentId required');
  return {
    method: 'GET',
    path: `${PAY_PUBLIC_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
    },
  };
}

export function buildRefundRequest(
  opts: PayPluginClientOptions,
  paymentId: string,
  body: { amount: string; refundId?: string },
  idempotencyKey: string,
): PluginRequest {
  if (!idempotencyKey.trim()) {
    throw new Error('pay.plugins: Idempotency-Key is required on money POSTs');
  }
  assertDecimalAmount(body.amount);
  return {
    method: 'POST',
    path: `${PAY_PUBLIC_API_BASE}/payments/${encodeURIComponent(paymentId)}/refund`,
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  };
}

export function absoluteUrl(opts: PayPluginClientOptions, path: string): string {
  const base = opts.baseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Decimal string pin — money is never a JS number on the wire. */
export function assertDecimalAmount(amount: string): void {
  if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount.trim())) {
    throw new Error(`pay.plugins: amount must be a non-negative decimal string, got ${JSON.stringify(amount)}`);
  }
}

/**
 * Verify an outbound merchant webhook delivery (ADR §2.4).
 * Header names match merchant-webhooks.ts: X-Intafaced-Signature + timestamp.
 */
export function verifyMerchantWebhook(input: {
  readonly secret: string;
  readonly rawBody: string;
  readonly signatureHex: string | undefined;
  readonly timestampSeconds: string | undefined;
  readonly now?: Date;
  readonly toleranceSeconds?: number;
}): boolean {
  const { secret, rawBody, signatureHex, timestampSeconds } = input;
  if (!signatureHex || !timestampSeconds || !secret) return false;
  const signedAt = Number.parseInt(timestampSeconds, 10);
  if (!Number.isFinite(signedAt)) return false;
  const now = input.now ?? new Date();
  const tol = input.toleranceSeconds ?? 300;
  if (Math.abs(now.getTime() / 1000 - signedAt) > tol) return false;
  if (!/^[0-9a-f]+$/i.test(signatureHex)) return false;
  const expected = signMerchantWebhook(secret, timestampSeconds, rawBody);
  if (expected.length !== signatureHex.length) return false;
  // Constant-time compare via hmac digest buffers.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHex, 'hex');
  if (a.length !== b.length) return false;
  let ok = 0;
  for (let i = 0; i < a.length; i++) ok |= a[i]! ^ b[i]!;
  return ok === 0;
}

/** Same construction as rails/webhook-signature.signPayload + merchant-webhooks. */
export function signMerchantWebhook(secret: string, timestampSeconds: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
}

/**
 * Minimal live client: send a pre-built request. Tests inject fetch.
 * Production plugins call this after build* helpers.
 */
export async function sendPluginRequest(opts: PayPluginClientOptions, req: PluginRequest): Promise<{ status: number; body: unknown }> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  if (!fetchFn) throw new Error('pay.plugins: fetch is not available');
  const res = await fetchFn(absoluteUrl(opts, req.path), {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }
  return { status: res.status, body };
}
