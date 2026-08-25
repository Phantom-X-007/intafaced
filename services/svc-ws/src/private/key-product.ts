/**
 * Product/module list on API keys for `/private/stream` and drop-copy.
 *
 * Empty list = unrestricted. Non-empty = presented product must match a module.
 * Missing product with a non-empty list fails closed. Never invent a default.
 * Unknown names (spot, wildcards, full scopes) never match.
 */
import type { IncomingMessage } from 'node:http';
import { SCOPES } from '@intafaced/auth';

const PRODUCT_SET: ReadonlySet<string> = new Set(SCOPES.map((s) => s.slice(0, s.indexOf(':'))).filter((p) => p.length > 0));

export class KeyProductError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.product_not_allowed',
  ) {
    super(message);
    this.name = 'KeyProductError';
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

/**
 * Bound list must name that product. Empty / omitted list stays open.
 * Bound + missing presented refuses. Never invent a default product.
 */
export function assertApiKeyProduct(list: readonly string[] | undefined, presented: string | null | undefined): void {
  const bound = list ?? [];
  if (bound.length === 0) return;
  if (apiKeyProductAllowed(bound, presented)) return;
  throw new KeyProductError('API key is not allowed for this product', 'auth.product_not_allowed');
}

/** Identity body only. Never invent a product list. */
export function optionalProductScopes(body: unknown): readonly string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.productScopes ?? rec.product_scopes;
  if (!Array.isArray(raw)) return undefined;
  if (!raw.every((entry) => typeof entry === 'string')) return undefined;
  return raw;
}

/** Client-presented product on the upgrade. Not x-intafaced-*. */
export function requestProductFromUpgrade(req: IncomingMessage): string | undefined {
  const raw = req.headers['x-product'] ?? req.headers.product;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
