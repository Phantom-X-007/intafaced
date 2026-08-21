/**
 * ops.kb-workflow product policy — spine catalog honesty (i18n keys only).
 *
 * No SLA timings, no vendor names in keys, no invented refund amounts.
 */
import { listPlatformKb, PLATFORM_KB_SPINE, type KbCatalogErrorCode } from './kb-catalog.js';

export const KB_KEY_PREFIX = 'support.kb.' as const;

export const KB_CATALOG_REFUSE_CODES = [
  'support.kb_invalid',
  'support.kb_vendor_name',
  'support.kb_version_unknown',
] as const satisfies readonly KbCatalogErrorCode[];

export type KbPolicySummary = ReturnType<typeof describeKbPolicy>;

/** Public honesty board for ops.kb-workflow — catalog shape only, not article bodies. */
export function describeKbPolicy() {
  const published = listPlatformKb();
  return {
    spineArticleCount: published.length,
    spineIds: published.map((a) => a.id),
    keyPrefix: KB_KEY_PREFIX,
    keysUnderSupportKb: published.every((a) => a.titleKey.startsWith(KB_KEY_PREFIX) && a.bodyKey.startsWith(KB_KEY_PREFIX)),
    vendorNamesForbidden: true as const,
    slaTimingsForbidden: true as const,
    emptyQueryReturnsLatestOnly: true as const,
    inventsRefundAmounts: false as const,
    refuseCodes: KB_CATALOG_REFUSE_CODES,
    platformSpineSize: PLATFORM_KB_SPINE.length,
  };
}
