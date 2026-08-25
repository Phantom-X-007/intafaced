/**
 * Identity product/module list at the edge session door (#3333).
 * Non-empty list refuses a foreign / missing product. Empty list stays
 * grantor intersection — never invent a default product.
 * Identity exchange body only — no second store.
 */

export class KeyProductError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.domain_not_allowed',
  ) {
    super(message);
    this.name = 'KeyProductError';
  }
}

/** Trim + lowercase module name. Null for blank, wildcard, or full scopes. */
export function normalizeProduct(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes('*') || trimmed.includes(':')) return null;
  return trimmed;
}

/** Identity / exchange body only. Never invent a list or a default product. */
export function optionalProductScopes(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.productScopes ?? rec.product_scopes;
  if (raw === null || raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const list: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const product = normalizeProduct(entry);
    if (product) list.push(product);
  }
  return list;
}

/** Walk a tRPC envelope or a bare body. Never invent a list. */
export function optionalProductScopesFromExchange(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const envelope = body as {
    result?: { data?: { json?: unknown; productScopes?: unknown; product_scopes?: unknown } };
    productScopes?: unknown;
    product_scopes?: unknown;
  };
  const data = envelope.result?.data?.json ?? envelope.result?.data ?? body;
  return optionalProductScopes(data);
}

/** Client-presented product. Not x-intafaced-* (those are stripped). */
export function requestProduct(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers['x-product'] ?? headers['X-Product'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const product = normalizeProduct(value);
  return product ?? undefined;
}

/**
 * Empty list = unrestricted (grantor intersection). Non-empty = presented
 * product must match an entry. Missing product with a non-empty list fails closed.
 */
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

/**
 * Bound list refuses a foreign / missing product. Empty / missing list stays open.
 * Never invent a default product.
 */
export function assertApiKeyProduct(list: readonly string[] | null | undefined, presented: string | null | undefined): void {
  const products = list ?? [];
  if (products.length === 0) return;
  if (!apiKeyProductAllowed(products, presented)) {
    throw new KeyProductError('API key is not allowed for this product', 'auth.domain_not_allowed');
  }
}
