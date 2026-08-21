/**
 * Named §13 refuse for Magento / OpenCart PHP trees.
 *
 * WooCommerce is the first shipped CMS adapter (`plugins/woocommerce-intafaced-pay/`).
 * Callers must not treat Magento / OpenCart as shipped product.
 */

export const PAY_PLUGIN_CMS_UNWIRED = 'pay.plugin_cms_unwired' as const;

export const CMS_PLUGIN_SOCKET = 'socket.pay-plugin-cms-php' as const;

export const CMS_PLUGIN_FAMILIES = ['woocommerce', 'magento', 'opencart'] as const;

export const UNWIRED_CMS_PLUGIN_FAMILIES = ['magento', 'opencart'] as const;

export const SHIPPED_CMS_PLUGIN_FAMILY = 'woocommerce' as const;

export type CmsPluginFamily = (typeof CMS_PLUGIN_FAMILIES)[number];

export type UnwiredCmsPluginFamily = (typeof UNWIRED_CMS_PLUGIN_FAMILIES)[number];

export type CmsPluginRefuse = {
  readonly status: 'refuse';
  readonly code: typeof PAY_PLUGIN_CMS_UNWIRED;
  readonly socket: typeof CMS_PLUGIN_SOCKET;
  readonly family: UnwiredCmsPluginFamily;
  readonly shipped: false;
  readonly phpTree: false;
  readonly message: string;
};

export function isCmsPluginShipped(family: CmsPluginFamily): boolean {
  return family === SHIPPED_CMS_PLUGIN_FAMILY;
}

export function refuseCmsPlugin(family: UnwiredCmsPluginFamily): CmsPluginRefuse {
  return {
    status: 'refuse',
    code: PAY_PLUGIN_CMS_UNWIRED,
    socket: CMS_PLUGIN_SOCKET,
    family,
    shipped: false,
    phpTree: false,
    message: `First-party ${family} PHP plugin is unwired (§13 ${CMS_PLUGIN_SOCKET}). Use the TypeScript reference client or the WooCommerce adapter.`,
  };
}

export function refuseAllCmsPlugins(): readonly CmsPluginRefuse[] {
  return UNWIRED_CMS_PLUGIN_FAMILIES.map(refuseCmsPlugin);
}

/** WooCommerce PHP adapter is the shipped CMS path; Magento/OpenCart stay unwired. */
export function cmsPluginsShipped(): boolean {
  return true;
}

export type CmsPluginShipped = {
  readonly status: 'shipped';
  readonly family: typeof SHIPPED_CMS_PLUGIN_FAMILY;
  readonly shipped: true;
  readonly phpTree: true;
};

export type CmsPluginStatus = {
  readonly socket: typeof CMS_PLUGIN_SOCKET;
  readonly code: typeof PAY_PLUGIN_CMS_UNWIRED;
  readonly shippedFamily: typeof SHIPPED_CMS_PLUGIN_FAMILY;
  readonly cmsPluginsShipped: boolean;
  readonly families: readonly CmsPluginFamily[];
  readonly unwiredFamilies: readonly UnwiredCmsPluginFamily[];
  readonly shipped: CmsPluginShipped;
  readonly refuse: readonly CmsPluginRefuse[];
};

/** Public door for pay.plugins.cmsStatus — Woo shipped, Magento/OpenCart refused. */
export function getCmsPluginStatus(): CmsPluginStatus {
  return {
    socket: CMS_PLUGIN_SOCKET,
    code: PAY_PLUGIN_CMS_UNWIRED,
    shippedFamily: SHIPPED_CMS_PLUGIN_FAMILY,
    cmsPluginsShipped: cmsPluginsShipped(),
    families: CMS_PLUGIN_FAMILIES,
    unwiredFamilies: UNWIRED_CMS_PLUGIN_FAMILIES,
    shipped: {
      status: 'shipped',
      family: SHIPPED_CMS_PLUGIN_FAMILY,
      shipped: true,
      phpTree: true,
    },
    refuse: refuseAllCmsPlugins(),
  };
}
