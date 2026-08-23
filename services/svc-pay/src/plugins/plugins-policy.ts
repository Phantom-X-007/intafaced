/**
 * pay.plugins product policy — reference path + CMS §13 socket honesty (D26-P1-P8).
 *
 * WooCommerce adapter shipped; Magento/OpenCart refuse until owner wires PHP trees.
 * Contract pins come from reference-client + webhook-vectors — no second checkout book.
 */
import { CMS_PLUGIN_SOCKET, SHIPPED_CMS_PLUGIN_FAMILY, UNWIRED_CMS_PLUGIN_FAMILIES, cmsPluginsShipped } from './cms-unwired.js';
import { PAY_PUBLIC_API_BASE } from './reference-client.js';
import { MERCHANT_WEBHOOK_HEADERS } from './webhook-vectors.js';
import { listReferenceCmsAdapters } from './cms-adapters.js';

export type PluginsPolicySummary = ReturnType<typeof describePluginsPolicy>;

/** Public honesty board for pay.plugins — integrators read before wiring CMS UI. */
export function describePluginsPolicy() {
  return {
    publicApiBase: PAY_PUBLIC_API_BASE,
    cmsSocket: CMS_PLUGIN_SOCKET,
    cmsShipped: cmsPluginsShipped(),
    cmsShippedFamily: SHIPPED_CMS_PLUGIN_FAMILY,
    cmsUnwiredFamilies: [...UNWIRED_CMS_PLUGIN_FAMILIES],
    referenceAdapters: [...listReferenceCmsAdapters()],
    webhookHeaders: { ...MERCHANT_WEBHOOK_HEADERS },
    amountWireFormat: 'decimal-string' as const,
    moneyPostRequiresIdempotencyKey: true as const,
    webhookUrlHttpsOnly: true as const,
    inventsProviderCredentials: false as const,
    inventsSecondCheckoutBook: false as const,
  };
}
