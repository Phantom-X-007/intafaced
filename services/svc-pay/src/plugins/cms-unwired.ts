/**
 * D26-P1-P8 — named §13 refuse for first-party Woo/Magento/OpenCart PHP trees.
 *
 * The shipped plugin path is the TypeScript reference client in this folder.
 * Callers must not treat Woo / Magento / OpenCart as shipped product.
 */

export const PAY_PLUGIN_CMS_UNWIRED = 'pay.plugin_cms_unwired' as const;

export const CMS_PLUGIN_SOCKET = 'socket.pay-plugin-cms-php' as const;

export const CMS_PLUGIN_FAMILIES = ['woocommerce', 'magento', 'opencart'] as const;

export type CmsPluginFamily = (typeof CMS_PLUGIN_FAMILIES)[number];

export type CmsPluginRefuse = {
  readonly status: 'refuse';
  readonly code: typeof PAY_PLUGIN_CMS_UNWIRED;
  readonly socket: typeof CMS_PLUGIN_SOCKET;
  readonly family: CmsPluginFamily;
  readonly shipped: false;
  readonly phpTree: false;
  readonly message: string;
};

export function refuseCmsPlugin(family: CmsPluginFamily): CmsPluginRefuse {
  return {
    status: 'refuse',
    code: PAY_PLUGIN_CMS_UNWIRED,
    socket: CMS_PLUGIN_SOCKET,
    family,
    shipped: false,
    phpTree: false,
    message: `First-party ${family} PHP plugin is unwired (§13 ${CMS_PLUGIN_SOCKET}). Use the TypeScript reference client.`,
  };
}

export function refuseAllCmsPlugins(): readonly CmsPluginRefuse[] {
  return CMS_PLUGIN_FAMILIES.map(refuseCmsPlugin);
}

/** Always false — Woo/Magento/OpenCart trees are not a product path in this repo. */
export function cmsPluginsShipped(): false {
  return false;
}
