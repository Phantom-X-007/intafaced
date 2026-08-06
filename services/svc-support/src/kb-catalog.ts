/**
 * Support Stage-2 — KB catalog (TRK-ops.support).
 *
 * i18n-keyed articles only. No third-party product/vendor names in keys.
 * No money advice that invents rates or refund amounts.
 */

import type { SupportKbArticle } from '@intafaced/contracts';

/**
 * Day-one platform KB spine. Keys are catalog ids for @intafaced/i18n —
 * strings here are keys, not user-facing English copy.
 */
export const PLATFORM_KB_SPINE: readonly SupportKbArticle[] = [
  {
    id: 'kb-account-access',
    titleKey: 'support.kb.account_access.title',
    bodyKey: 'support.kb.account_access.body',
  },
  {
    id: 'kb-security-basics',
    titleKey: 'support.kb.security_basics.title',
    bodyKey: 'support.kb.security_basics.body',
  },
  {
    id: 'kb-orders-status',
    titleKey: 'support.kb.orders_status.title',
    bodyKey: 'support.kb.orders_status.body',
  },
  {
    id: 'kb-deposit-withdraw-honest',
    titleKey: 'support.kb.deposit_withdraw.title',
    bodyKey: 'support.kb.deposit_withdraw.body',
  },
  {
    id: 'kb-paper-vs-live',
    titleKey: 'support.kb.paper_vs_live.title',
    bodyKey: 'support.kb.paper_vs_live.body',
  },
] as const;

const VENDOR_SMELL = /\b(binance|coinbase|kraken|okx|bybit|deriv|metatrader|tradingview)\b/i;

export type KbCatalogErrorCode = 'support.kb_invalid' | 'support.kb_vendor_name';

export class KbCatalogError extends Error {
  constructor(
    message: string,
    readonly code: KbCatalogErrorCode,
  ) {
    super(message);
    this.name = 'KbCatalogError';
  }
}

/** Validate a single article shape — refuse empty keys and vendor smuggle in keys. */
export function assertKbArticle(article: SupportKbArticle): SupportKbArticle {
  if (!article.id?.trim() || !article.titleKey?.trim() || !article.bodyKey?.trim()) {
    throw new KbCatalogError('KB article requires id, titleKey, bodyKey', 'support.kb_invalid');
  }
  const blob = `${article.id} ${article.titleKey} ${article.bodyKey}`;
  if (VENDOR_SMELL.test(blob)) {
    throw new KbCatalogError('KB keys must stay vendor-clean', 'support.kb_vendor_name');
  }
  if (!article.titleKey.startsWith('support.kb.') || !article.bodyKey.startsWith('support.kb.')) {
    throw new KbCatalogError('KB keys must live under support.kb.*', 'support.kb_invalid');
  }
  return article;
}

/** List platform spine (immutable copy). */
export function listPlatformKb(): readonly SupportKbArticle[] {
  return PLATFORM_KB_SPINE.map((a) => assertKbArticle({ ...a }));
}

/**
 * Search by id substring or key fragment. Empty query → full spine.
 * Never invents articles for unknown queries.
 */
export function searchKb(query: string, catalog: readonly SupportKbArticle[] = PLATFORM_KB_SPINE): readonly SupportKbArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.map((a) => ({ ...a }));
  return catalog.filter(
    (a) => a.id.toLowerCase().includes(q) || a.titleKey.toLowerCase().includes(q) || a.bodyKey.toLowerCase().includes(q),
  );
}

export function getKbById(id: string, catalog: readonly SupportKbArticle[] = PLATFORM_KB_SPINE): SupportKbArticle | null {
  const hit = catalog.find((a) => a.id === id);
  return hit ? { ...hit } : null;
}
