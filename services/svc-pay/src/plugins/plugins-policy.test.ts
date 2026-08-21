import { describe, expect, it } from 'vitest';
import { CMS_PLUGIN_SOCKET, SHIPPED_CMS_PLUGIN_FAMILY, UNWIRED_CMS_PLUGIN_FAMILIES } from './cms-unwired.js';
import { describePluginsPolicy } from './plugins-policy.js';
import { PAY_PUBLIC_API_BASE } from './reference-client.js';
import { MERCHANT_WEBHOOK_HEADERS } from './webhook-vectors.js';

describe('describePluginsPolicy', () => {
  it('states reference-path and CMS honesty without inventing credentials or a second book', () => {
    const p = describePluginsPolicy();
    expect(p.publicApiBase).toBe(PAY_PUBLIC_API_BASE);
    expect(p.cmsSocket).toBe(CMS_PLUGIN_SOCKET);
    expect(p.cmsShipped).toBe(true);
    expect(p.cmsShippedFamily).toBe(SHIPPED_CMS_PLUGIN_FAMILY);
    expect(p.cmsUnwiredFamilies).toEqual([...UNWIRED_CMS_PLUGIN_FAMILIES]);
    expect(p.webhookHeaders).toEqual({ ...MERCHANT_WEBHOOK_HEADERS });
    expect(p.amountWireFormat).toBe('decimal-string');
    expect(p.moneyPostRequiresIdempotencyKey).toBe(true);
    expect(p.webhookUrlHttpsOnly).toBe(true);
    expect(p.inventsProviderCredentials).toBe(false);
    expect(p.inventsSecondCheckoutBook).toBe(false);
  });
});
