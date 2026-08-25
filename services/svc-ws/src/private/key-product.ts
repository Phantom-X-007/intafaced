/**
 * Product/module allowlist on API keys for `/private/stream` and drop-copy.
 *
 * Empty list = unset (full grantor intersection, no default product).
 * Non-empty = presented module must match an entry.
 * Unknown names (spot, wildcards, full scopes) never match.
 * These doors present `trade`. Never invent spot/perp or a default product.
 */
import { SCOPES } from '@intafaced/auth';

/** Stream module for private + drop-copy. Not a market type. */
export const STREAM_PRODUCT = 'trade';

const PRODUCT_SET: ReadonlySet<string> = new Set(SCOPES.map((s) => s.slice(0, s.indexOf(':'))).filter((p) => p.length > 0));

/** Trim + lowercase module name. Null for blank, wildcard, or unknown. */
export function normalizeProduct(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes('*') || trimmed.includes(':')) return null;
  return PRODUCT_SET.has(trimmed) ? trimmed : null;
}

export function apiKeyProductAllowed(list: readonly string[], presented: string | null | undefined): boolean {
  if (list.length === 0) return true;
  const product = normalizeProduct(presented);
  if (!product) return false;
  for (const entry of list) {
    const allowed = normalizeProduct(entry);
    if (!allowed) continue;
    if (product === allowed) return true;
  }
  return false;
}
