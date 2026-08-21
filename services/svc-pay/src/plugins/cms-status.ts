/**
 * pay.plugins CMS family status — honest §13 surface for integrators.
 */
import {
  CMS_PLUGIN_FAMILIES,
  CMS_PLUGIN_SOCKET,
  SHIPPED_CMS_PLUGIN_FAMILY,
  UNWIRED_CMS_PLUGIN_FAMILIES,
  cmsPluginsShipped,
  refuseCmsPlugin,
  type CmsPluginFamily,
  type CmsPluginRefuse,
  type UnwiredCmsPluginFamily,
} from './cms-unwired.js';

export type CmsPluginFamilyStatus =
  | { readonly family: typeof SHIPPED_CMS_PLUGIN_FAMILY; readonly shipped: true; readonly refuse: null }
  | { readonly family: UnwiredCmsPluginFamily; readonly shipped: false; readonly refuse: CmsPluginRefuse };

export type CmsPluginStatusSummary = {
  socket: typeof CMS_PLUGIN_SOCKET;
  shipped: boolean;
  shippedFamily: typeof SHIPPED_CMS_PLUGIN_FAMILY;
  unwiredFamilies: UnwiredCmsPluginFamily[];
  families: CmsPluginFamilyStatus[];
};

function familyStatus(family: CmsPluginFamily): CmsPluginFamilyStatus {
  if (family === SHIPPED_CMS_PLUGIN_FAMILY) {
    return { family: SHIPPED_CMS_PLUGIN_FAMILY, shipped: true, refuse: null };
  }
  return { family, shipped: false, refuse: refuseCmsPlugin(family) };
}

/** Full CMS plugin honesty board — WooCommerce shipped; Magento/OpenCart refuse. */
export function describeCmsPluginStatus(): CmsPluginStatusSummary {
  return {
    socket: CMS_PLUGIN_SOCKET,
    shipped: cmsPluginsShipped(),
    shippedFamily: SHIPPED_CMS_PLUGIN_FAMILY,
    unwiredFamilies: [...UNWIRED_CMS_PLUGIN_FAMILIES],
    families: CMS_PLUGIN_FAMILIES.map(familyStatus),
  };
}
