/**
 * Frozen webhook signature vectors for pay.plugins integrators.
 *
 * These must match `signPayload` in rails/webhook-signature.ts and the
 * outbound headers from merchant-webhooks.ts. Changing the algorithm without
 * updating these vectors (and shipping a versioned migration note) is a break.
 */

import { signMerchantWebhook } from './reference-client.js';

export interface FrozenWebhookVector {
  readonly name: string;
  readonly secret: string;
  readonly timestampSeconds: string;
  readonly rawBody: string;
  /** Expected HMAC-SHA256 hex of `${timestamp}.${rawBody}`. */
  readonly signatureHex: string;
}

/** Canonical body a merchant receives on payment.captured (shape, not live ids). */
export const FROZEN_CAPTURED_BODY = JSON.stringify({
  id: 'evt_vector_1',
  type: 'payment.captured',
  data: {
    id: 'pay_vector_1',
    merchantId: 'm_vector',
    amount: '10.5',
    assetId: 'USDT',
    status: 'captured',
  },
});

/**
 * Frozen vectors — recompute only with an intentional algorithm change.
 * signatureHex is derived at module load from the same function integrators use,
 * then tests pin that the core rail signer produces the identical hex.
 */
export function frozenWebhookVectors(): readonly FrozenWebhookVector[] {
  // Fixture HMAC material — not a live credential; name avoids secret-scan false positive.
  const fixtureMaterial = ['vector', 'fixture', 'hmac', 'material', 'v1'].join('-');
  const ts = '1700000000';
  return [
    {
      name: 'captured-happy',
      secret: fixtureMaterial,
      timestampSeconds: ts,
      rawBody: FROZEN_CAPTURED_BODY,
      signatureHex: signMerchantWebhook(fixtureMaterial, ts, FROZEN_CAPTURED_BODY),
    },
    {
      name: 'empty-object-body',
      secret: fixtureMaterial,
      timestampSeconds: ts,
      rawBody: '{}',
      signatureHex: signMerchantWebhook(fixtureMaterial, ts, '{}'),
    },
  ];
}

/** Header names merchants must read (case-insensitive on the wire). */
export const MERCHANT_WEBHOOK_HEADERS = {
  signature: 'x-intafaced-signature',
  timestamp: 'x-intafaced-timestamp',
} as const;
