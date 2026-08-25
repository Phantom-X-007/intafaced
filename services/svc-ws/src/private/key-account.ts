/**
 * API-key account bind on `/private/stream` (M01 / M05).
 * Bound key + presented account must be the same id. Unbound stays open.
 * Missing account when the key is bound refuses. Never invent a bind.
 */
import type { IncomingMessage } from 'node:http';

export class KeyAccountError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.account_required' | 'auth.account_mismatch',
  ) {
    super(message);
    this.name = 'KeyAccountError';
  }
}

/** Empty / missing is a missing account — never invent primary. */
export function optionalAccountId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id.length > 0 ? id : undefined;
}

/** Identity body only. Never invent a bind. */
export function optionalAccountIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  return optionalAccountId(rec.accountId ?? rec.account_id);
}

/** Bound key + presented account must be the same non-empty id. */
export function apiKeyAccountAllowed(boundAccountId: string | null | undefined, presentedAccountId: string | null | undefined): boolean {
  const bound = typeof boundAccountId === 'string' ? boundAccountId.trim() : '';
  const presented = typeof presentedAccountId === 'string' ? presentedAccountId.trim() : '';
  if (!bound || !presented) return false;
  return bound === presented;
}

/**
 * Bound key must name that account. Unbound (no bound id) stays open.
 * Bound + missing presented refuses. Never invent a bind.
 */
export function assertApiKeyAccount(boundAccountId: string | null | undefined, presentedAccountId: string | null | undefined): void {
  const bound = optionalAccountId(boundAccountId ?? undefined);
  const presented = optionalAccountId(presentedAccountId ?? undefined);
  if (!bound) return;
  if (!presented) {
    throw new KeyAccountError('accountId is required', 'auth.account_required');
  }
  if (!apiKeyAccountAllowed(bound, presented)) {
    throw new KeyAccountError('API key is not bound to this account', 'auth.account_mismatch');
  }
}

/** Client-presented account on the upgrade. Not x-intafaced-*. */
export function requestAccountIdFromUpgrade(req: IncomingMessage): string | undefined {
  const raw = req.headers['x-account-id'] ?? req.headers['account-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return optionalAccountId(value);
}
