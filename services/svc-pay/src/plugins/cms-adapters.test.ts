import { describe, expect, it } from 'vitest';
import { frozenWebhookVectors } from './webhook-vectors.js';
import { listReferenceCmsAdapters, magentoAdapter, opencartAdapter } from './cms-adapters.js';

describe('TypeScript CMS reference adapters', () => {
  it('lists WooCommerce, Magento, and OpenCart reference paths', () => {
    expect(listReferenceCmsAdapters()).toEqual(['woocommerce', 'magento', 'opencart']);
  });

  it('keeps Magento/OpenCart decimal strings, idempotency, and shared HMAC vectors', () => {
    const options = { baseUrl: 'https://pay.example', apiKey: 'ifc_test_key' };
    for (const adapter of [magentoAdapter, opencartAdapter]) {
      const request = adapter.createPayment(
        options,
        { merchantId: 'm', amount: '12.50', assetId: 'IFC', method: 'card' },
        `${adapter.family}-order-1`,
      );
      expect(request.headers['idempotency-key']).toBe(`${adapter.family}-order-1`);
      expect(JSON.parse(request.body!).amount).toBe('12.50');
      expect(JSON.parse(request.body!).metadata.cms).toBe(adapter.family);
      const vector = frozenWebhookVectors()[0]!;
      expect(adapter.signWebhook(vector.secret, vector.timestampSeconds, vector.rawBody)).toBe(vector.signatureHex);
    }
  });
});
