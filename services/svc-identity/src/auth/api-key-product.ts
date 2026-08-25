/**
 * Product/module scope list on API keys (M05-R06).
 *
 * Empty list = unset: full grantor intersection, no default product.
 * Non-empty = presented product must match an entry (module prefix).
 * Missing product with a non-empty list fails closed.
 * Unknown names (spot, wildcards, full scopes) never match and refuse at bind.
 */
import { SCOPES, expandScopes } from '@intafaced/auth';

const PRODUCT_SET: ReadonlySet<string> = new Set(SCOPES.map((s) => s.slice(0, s.indexOf(':'))).filter((p) => p.length > 0));

export class ApiKeyProductError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.product_invalid' | 'auth.product_widen' | 'auth.product_outside' | 'auth.not_found',
  ) {
    super(message);
    this.name = 'ApiKeyProductError';
  }
}

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

/** Bound products cannot name a module the grantor does not hold. Empty list is unset. */
export function assertProductsDelegatable(products: readonly string[], grantorScopes: readonly string[]): void {
  if (products.length === 0) return;
  const held = new Set<string>();
  for (const scope of expandScopes(grantorScopes)) {
    const mod = scope.slice(0, scope.indexOf(':'));
    if (mod) held.add(mod);
  }
  const notHeld = products.filter((p) => {
    const n = normalizeProduct(p);
    return !n || !held.has(n);
  });
  if (notHeld.length > 0) {
    throw new ApiKeyProductError(`Cannot bind products the granting session does not hold: ${notHeld.join(', ')}`, 'auth.product_widen');
  }
}

/** Key scopes must sit inside the product list. Empty list does not constrain. */
export function scopesWithinProducts(scopes: readonly string[], products: readonly string[]): boolean {
  if (products.length === 0) return true;
  const allowed = new Set<string>();
  for (const p of products) {
    const n = normalizeProduct(p);
    if (n) allowed.add(n);
  }
  for (const scope of scopes) {
    const mod = typeof scope === 'string' ? scope.trim().split(':')[0]?.toLowerCase() : '';
    if (!mod || !allowed.has(mod)) return false;
  }
  return true;
}
