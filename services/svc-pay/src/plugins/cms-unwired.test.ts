/**
 * D26-P1-P8 — named §13 CMS refuse + honesty pins.
 *
 * Fail if Woo/Magento/OpenCart PHP trees appear, if money amount serialises as
 * a JSON number, or if webhook verify accepts missing/bad HMAC.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CMS_PLUGIN_FAMILIES,
  CMS_PLUGIN_SOCKET,
  cmsPluginsShipped,
  PAY_PLUGIN_CMS_UNWIRED,
  refuseAllCmsPlugins,
  refuseCmsPlugin,
} from './cms-unwired.js';
import { buildCreatePaymentRequest, buildRefundRequest, verifyMerchantWebhook } from './reference-client.js';
import { frozenWebhookVectors } from './webhook-vectors.js';

const here = dirname(fileURLToPath(import.meta.url));

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

describe('D26-P1-P8 pay.plugin_cms_unwired', () => {
  it('exports a named refuse so Woo/Magento/OpenCart cannot be read as shipped', () => {
    expect(PAY_PLUGIN_CMS_UNWIRED).toBe('pay.plugin_cms_unwired');
    expect(CMS_PLUGIN_SOCKET).toBe('socket.pay-plugin-cms-php');
    expect(cmsPluginsShipped()).toBe(false);
    expect([...CMS_PLUGIN_FAMILIES]).toEqual(['woocommerce', 'magento', 'opencart']);

    const all = refuseAllCmsPlugins();
    expect(all).toHaveLength(3);
    for (const family of CMS_PLUGIN_FAMILIES) {
      const r = refuseCmsPlugin(family);
      expect(r.status).toBe('refuse');
      expect(r.code).toBe(PAY_PLUGIN_CMS_UNWIRED);
      expect(r.socket).toBe(CMS_PLUGIN_SOCKET);
      expect(r.family).toBe(family);
      expect(r.shipped).toBe(false);
      expect(r.phpTree).toBe(false);
      expect(r.message).toMatch(/§13/);
    }
  });

  it('fails if PHP CMS trees appear under plugins/', () => {
    const files = walkFiles(here);
    const php = files.filter((f) => extname(f).toLowerCase() === '.php');
    expect(php, 'no PHP plugin trees in svc-pay/src/plugins').toEqual([]);

    // Real PHP integration markers — assembled so this test file does not match itself.
    const phpMarkers = new RegExp(['woocommerce_api', 'Mage::', 'class ControllerExtensionPayment'].join('|'), 'i');
    for (const f of files) {
      if (!/\.(ts|js|mjs)$/.test(f) || f.endsWith('.test.ts')) continue;
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(phpMarkers);
    }
  });

  it('fails if money amount serialises as a JSON number', () => {
    const opts = { baseUrl: 'https://pay.example.test', apiKey: 'ifc_test_fixture_not_live' };
    const create = buildCreatePaymentRequest(opts, { merchantId: 'm1', amount: '10.50', assetId: 'USDT', method: 'card' }, 'amt-1');
    expect(create.body).not.toMatch(/"amount"\s*:\s*\d/);
    expect(typeof (JSON.parse(create.body!) as { amount: unknown }).amount).toBe('string');

    const refund = buildRefundRequest(opts, 'pay_1', { amount: '1.00' }, 'amt-refund-1');
    expect(refund.body).not.toMatch(/"amount"\s*:\s*\d/);
    expect(typeof (JSON.parse(refund.body!) as { amount: unknown }).amount).toBe('string');
  });

  it('webhook verify rejects missing and bad HMAC', () => {
    const v = frozenWebhookVectors()[0]!;
    const now = new Date(Number(v.timestampSeconds) * 1000);
    const base = {
      secret: v.secret,
      rawBody: v.rawBody,
      timestampSeconds: v.timestampSeconds,
      now,
    };

    expect(verifyMerchantWebhook({ ...base, signatureHex: v.signatureHex })).toBe(true);
    expect(verifyMerchantWebhook({ ...base, signatureHex: undefined })).toBe(false);
    expect(verifyMerchantWebhook({ ...base, signatureHex: '' })).toBe(false);
    expect(verifyMerchantWebhook({ ...base, signatureHex: 'not-hex' })).toBe(false);
    expect(verifyMerchantWebhook({ ...base, signatureHex: '00'.repeat(32) })).toBe(false);
    expect(verifyMerchantWebhook({ ...base, signatureHex: v.signatureHex.slice(0, -2) + 'ff' })).toBe(false);
    expect(verifyMerchantWebhook({ ...base, timestampSeconds: undefined, signatureHex: v.signatureHex })).toBe(false);
  });
});
