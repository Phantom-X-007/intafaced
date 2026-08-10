import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { signPayload } from '../rails/webhook-signature.js';
import {
  assertDecimalAmount,
  buildCreatePaymentRequest,
  buildGetPaymentRequest,
  buildRefundRequest,
  PAY_PUBLIC_API_BASE,
  signMerchantWebhook,
  verifyMerchantWebhook,
} from './reference-client.js';
import { FROZEN_CAPTURED_BODY, frozenWebhookVectors, MERCHANT_WEBHOOK_HEADERS } from './webhook-vectors.js';

/**
 * Unit card — pay.plugins · wave 13 L02
 *
 * 1. Promise: harvest/closeout — not three CMS plugins; TS reference client +
 *    frozen webhook vectors; tests fail when API contract breaks.
 * 2. Reachable break on tip: zero plugin path under svc-pay/src/plugins.
 * 3. Done bar: one real integration path (TS client) + vectors matching core signer.
 * 4. Class N.
 * 5. Paths: services/svc-pay/src/plugins/** (+ docs/pay decision, not quickstart).
 * 6. RED first.
 * 7. Collision: clear of Denon #1625 quickstart / public-rest / payment-service.
 */

const here = dirname(fileURLToPath(import.meta.url));
const clientOpts = {
  baseUrl: 'https://pay.example.test',
  apiKey: 'ifc_test_vector_key',
};

describe('pay.plugins — TypeScript reference client', () => {
  it('pins public API base path', () => {
    expect(PAY_PUBLIC_API_BASE).toBe('/api/pay/v1');
    const req = buildCreatePaymentRequest(clientOpts, { merchantId: 'm1', amount: '1.1', assetId: 'USDT', method: 'card' }, 'order-1');
    expect(req.path).toBe('/api/pay/v1/payments');
    expect(req.method).toBe('POST');
    expect(req.headers.authorization).toBe('Bearer ifc_test_vector_key');
    expect(req.headers['idempotency-key']).toBe('order-1');
    expect(req.headers['content-type']).toBe('application/json');
  });

  it('refuses money POST without Idempotency-Key', () => {
    expect(() => buildCreatePaymentRequest(clientOpts, { merchantId: 'm1', amount: '1', assetId: 'USDT', method: 'card' }, '  ')).toThrow(
      /Idempotency-Key/,
    );
  });

  it('amount is a decimal string on the wire — never a JSON number', () => {
    expect(() => assertDecimalAmount(1.1 as unknown as string)).toThrow(/decimal string/);
    expect(() => assertDecimalAmount('1.1')).not.toThrow();
    const req = buildCreatePaymentRequest(clientOpts, { merchantId: 'm1', amount: '10.50', assetId: 'USDT', method: 'crypto' }, 'ord-2');
    const body = JSON.parse(req.body!) as { amount: unknown };
    expect(typeof body.amount).toBe('string');
    expect(body.amount).toBe('10.50');
  });

  it('get payment and refund paths follow the public contract', () => {
    const get = buildGetPaymentRequest(clientOpts, 'pay_abc');
    expect(get.path).toBe('/api/pay/v1/payments/pay_abc');
    expect(get.method).toBe('GET');

    const refund = buildRefundRequest(clientOpts, 'pay_abc', { amount: '1', refundId: 'r1' }, 'refund-key-1');
    expect(refund.path).toBe('/api/pay/v1/payments/pay_abc/refund');
    expect(refund.headers['idempotency-key']).toBe('refund-key-1');
  });

  it('frozen webhook vectors match the core rail signPayload', () => {
    for (const v of frozenWebhookVectors()) {
      const core = signPayload(v.secret, v.timestampSeconds, v.rawBody);
      expect(core, v.name).toBe(v.signatureHex);
      expect(signMerchantWebhook(v.secret, v.timestampSeconds, v.rawBody)).toBe(v.signatureHex);
      expect(
        verifyMerchantWebhook({
          secret: v.secret,
          rawBody: v.rawBody,
          signatureHex: v.signatureHex,
          timestampSeconds: v.timestampSeconds,
          now: new Date(Number(v.timestampSeconds) * 1000),
        }),
      ).toBe(true);
    }
  });

  it('rejects tampered body and stale timestamps', () => {
    const v = frozenWebhookVectors()[0]!;
    expect(
      verifyMerchantWebhook({
        secret: v.secret,
        rawBody: v.rawBody + ' ',
        signatureHex: v.signatureHex,
        timestampSeconds: v.timestampSeconds,
        now: new Date(Number(v.timestampSeconds) * 1000),
      }),
    ).toBe(false);

    expect(
      verifyMerchantWebhook({
        secret: v.secret,
        rawBody: v.rawBody,
        signatureHex: v.signatureHex,
        timestampSeconds: v.timestampSeconds,
        now: new Date((Number(v.timestampSeconds) + 10_000) * 1000),
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });

  it('documents header names merchants must verify', () => {
    expect(MERCHANT_WEBHOOK_HEADERS.signature).toBe('x-intafaced-signature');
    expect(MERCHANT_WEBHOOK_HEADERS.timestamp).toBe('x-intafaced-timestamp');
    // Core merchant-webhooks must still advertise the signature header.
    const mw = readFileSync(join(here, '../merchant-webhooks.ts'), 'utf8');
    expect(mw).toMatch(/x-intafaced-signature/i);
    expect(mw).toMatch(/X-Intafaced-Signature/);
  });

  it('captured vector body keeps amount as a string (contract break detector)', () => {
    const parsed = JSON.parse(FROZEN_CAPTURED_BODY) as { data: { amount: unknown } };
    expect(typeof parsed.data.amount).toBe('string');
  });

  it('does not ship PHP CMS plugin trees (honest reclassify)', () => {
    // Presence of this module IS the product path; PHP CMS adapters stay out of CI.
    const src = readFileSync(join(here, 'reference-client.ts'), 'utf8');
    expect(src).toMatch(/not Woo\/Magento\/OpenCart PHP/);
    // Real PHP integration markers — not English product names in comments.
    expect(src).not.toMatch(/woocommerce_api|Mage::|class ControllerExtensionPayment/i);
  });
});
