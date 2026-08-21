/**
 * D26-P1-P8 — pay.plugins mount vs tracker honest gaps.
 *
 * WooCommerce adapter + TS reference path shipped; Magento/OpenCart §13 unwired.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAY_PLUGINS_TRACKER_ID = 'pay.plugins' as const;

export const PLUGINS_MOUNTED_DOORS = ['policy', 'publicBase', 'cmsStatus'] as const;

export const PLUGINS_DONE_BAR_TEST_FILES = [
  'plugins-done-bar.test.ts',
  'woocommerce-contract.test.ts',
  'plugins-policy.test.ts',
  'reference-client.test.ts',
] as const;

export const PLUGINS_HONEST_GAPS = ['gap.magento_opencart_unwired', 'gap.php_cms_not_three_trees'] as const;

export const WOOCOMMERCE_PLUGIN_PATH = 'plugins/woocommerce-intafaced-pay/intafaced-pay.php';

export function pluginsDoorsInRouterSource(): readonly (typeof PLUGINS_MOUNTED_DOORS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '..', 'router.ts'), 'utf8');
  const start = src.search(/^\s{4}plugins:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return PLUGINS_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

export function pluginsPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'plugins-policy.ts'), 'utf8');
  return (
    /describePluginsPolicy/.test(src) && /inventsProviderCredentials:\s*false/.test(src) && /inventsSecondCheckoutBook:\s*false/.test(src)
  );
}

export function pluginsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return PLUGINS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function woocommercePluginPresent(repoRoot: string): boolean {
  return existsSync(join(repoRoot, WOOCOMMERCE_PLUGIN_PATH));
}

export function payPluginsTrackerBackendDoneBarMet(repoRoot: string): boolean {
  return (
    pluginsDoorsInRouterSource().length === PLUGINS_MOUNTED_DOORS.length &&
    pluginsPolicyHonestInSource() &&
    pluginsDoneBarTestsPresent() &&
    woocommercePluginPresent(repoRoot)
  );
}

export function payPluginsMountVsTrackerBoardCard(repoRoot: string): {
  readonly tracker: typeof PAY_PLUGINS_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const mounted = pluginsDoorsInRouterSource();
  return {
    tracker: PAY_PLUGINS_TRACKER_ID,
    doors: PLUGINS_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: PLUGINS_HONEST_GAPS.length,
    backendDoneBarMet: payPluginsTrackerBackendDoneBarMet(repoRoot),
  };
}
