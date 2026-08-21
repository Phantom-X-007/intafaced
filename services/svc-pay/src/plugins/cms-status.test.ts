import { describe, expect, it } from 'vitest';
import { PAY_PLUGIN_CMS_UNWIRED, SHIPPED_CMS_PLUGIN_FAMILY } from './cms-unwired.js';
import { describeCmsPluginStatus } from './cms-status.js';

describe('describeCmsPluginStatus — pay.plugins CMS honesty', () => {
  it('reports WooCommerce shipped and Magento/OpenCart refused', () => {
    const status = describeCmsPluginStatus();
    expect(status.shipped).toBe(true);
    expect(status.shippedFamily).toBe(SHIPPED_CMS_PLUGIN_FAMILY);

    const woo = status.families.find((f) => f.family === 'woocommerce');
    expect(woo?.shipped).toBe(true);
    expect(woo?.refuse).toBeNull();

    for (const family of ['magento', 'opencart'] as const) {
      const row = status.families.find((f) => f.family === family);
      expect(row?.shipped).toBe(false);
      expect(row?.refuse?.code).toBe(PAY_PLUGIN_CMS_UNWIRED);
      expect(row?.refuse?.family).toBe(family);
    }
  });

  it('unwired list matches refused families', () => {
    const status = describeCmsPluginStatus();
    expect(status.unwiredFamilies).toEqual(['magento', 'opencart']);
    expect(status.families.filter((f) => !f.shipped).map((f) => f.family)).toEqual(['magento', 'opencart']);
  });
});
