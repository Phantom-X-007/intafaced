/**
 * D26-P1-P8 — Magento/OpenCart stay unwired; WooCommerce is the shipped CMS adapter.
 *
 * Fail if Magento/OpenCart PHP trees appear under svc-pay/src/plugins, if money
 * amount serialises as a JSON number, or if webhook verify accepts missing/bad HMAC.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CMS_PLUGIN_FAMILIES,
  CMS_PLUGIN_SOCKET,
  SHIPPED_CMS_PLUGIN_FAMILY,
  UNWIRED_CMS_PLUGIN_FAMILIES,
  cmsPluginsShipped,
  getCmsPluginStatus,
  isCmsPluginShipped,
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
  it('getCmsPluginStatus exposes shipped WooCommerce and refused Magento/OpenCart', () => {
    const status = getCmsPluginStatus();
    expect(status.socket).toBe(CMS_PLUGIN_SOCKET);
    expect(status.code).toBe(PAY_PLUGIN_CMS_UNWIRED);
    expect(status.shippedFamily).toBe(SHIPPED_CMS_PLUGIN_FAMILY);
    expect(status.cmsPluginsShipped).toBe(true);
    expect([...status.families]).toEqual(['woocommerce', 'magento', 'opencart']);
    expect([...status.unwiredFamilies]).toEqual(['magento', 'opencart']);
    expect(status.shipped).toEqual({
      status: 'shipped',
      family: 'woocommerce',
      shipped: true,
      phpTree: true,
    });
    expect(status.refuse).toHaveLength(2);
    expect(status.refuse.map((r) => r.family)).toEqual(['magento', 'opencart']);
    for (const r of status.refuse) {
      expect(r.status).toBe('refuse');
      expect(r.code).toBe(PAY_PLUGIN_CMS_UNWIRED);
      expect(r.shipped).toBe(false);
      expect(r.phpTree).toBe(false);
    }
  });

  it('ships WooCommerce and refuses Magento/OpenCart', () => {
    expect(PAY_PLUGIN_CMS_UNWIRED).toBe('pay.plugin_cms_unwired');
    expect(CMS_PLUGIN_SOCKET).toBe('socket.pay-plugin-cms-php');
    expect(cmsPluginsShipped()).toBe(true);
    expect(SHIPPED_CMS_PLUGIN_FAMILY).toBe('woocommerce');
    expect([...CMS_PLUGIN_FAMILIES]).toEqual(['woocommerce', 'magento', 'opencart']);
    expect([...UNWIRED_CMS_PLUGIN_FAMILIES]).toEqual(['magento', 'opencart']);
    expect(isCmsPluginShipped('woocommerce')).toBe(true);
    expect(isCmsPluginShipped('magento')).toBe(false);
    expect(isCmsPluginShipped('opencart')).toBe(false);

    const all = refuseAllCmsPlugins();
    expect(all).toHaveLength(2);
    for (const family of UNWIRED_CMS_PLUGIN_FAMILIES) {
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

  it('fails if PHP CMS trees appear under svc-pay/src/plugins', () => {
    const files = walkFiles(here);
    const php = files.filter((f) => extname(f).toLowerCase() === '.php');
    expect(php, 'no PHP plugin trees in svc-pay/src/plugins').toEqual([]);

    // Magento / OpenCart integration markers — assembled so this test file does not match itself.
    const phpMarkers = new RegExp(['Mage::', 'class ControllerExtensionPayment'].join('|'), 'i');
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
      toleranceSeconds: 300,
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
