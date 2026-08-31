/**
 * Enrolled passkey at the HTTP session door.
 * A session without it cannot place. Refuse if verify is unavailable.
 * Never invent a challenge — identity's library already minted it.
 */

import { serviceAuthHeaders } from '@intafaced/contracts';

export class SessionPasskeyError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.passkey_missing' | 'auth.passkey_verify_unavailable',
  ) {
    super(message);
    this.name = 'SessionPasskeyError';
  }
}

function unwrap(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const envelope = body as {
    result?: { data?: { json?: unknown } };
  };
  return envelope.result?.data?.json ?? envelope.result?.data ?? body;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Identity body only. Never invent enrolled creds. Missing field → undefined (not []). */
export function optionalPasskeyCreds(body: unknown): unknown[] | undefined {
  const data = unwrap(body);
  if (!data || typeof data !== 'object') return undefined;
  const rec = data as Record<string, unknown>;
  const raw = rec.webauthnCreds ?? rec.webauthn_creds;
  return Array.isArray(raw) ? raw : undefined;
}

/** Identity body only. Never invent a clock. */
export function optionalLastVerifiedAt(body: unknown): string | undefined {
  const data = unwrap(body);
  if (!data || typeof data !== 'object') return undefined;
  const rec = data as Record<string, unknown>;
  const top = nonEmptyString(rec.lastVerifiedAt ?? rec.last_verified_at);
  if (top) return top;
  const creds = optionalPasskeyCreds(data);
  if (!creds) return undefined;
  for (const cred of creds) {
    if (!cred || typeof cred !== 'object') continue;
    const row = cred as Record<string, unknown>;
    const at = nonEmptyString(row.lastVerifiedAt ?? row.last_verified_at);
    if (at) return at;
  }
  return undefined;
}

/** Identity body only. Never invent verified. */
export function optionalPasskeyVerified(body: unknown): boolean | undefined {
  const data = unwrap(body);
  if (!data || typeof data !== 'object') return undefined;
  const rec = data as Record<string, unknown>;
  const raw = rec.passkeyVerified;
  return typeof raw === 'boolean' ? raw : undefined;
}

function unavailable(message = 'passkey verify is unavailable'): never {
  throw new SessionPasskeyError(message, 'auth.passkey_verify_unavailable');
}

/** A session without an enrolled+verified passkey cannot place. Missing verify refuses. */
export function assertSessionPasskey(body: unknown): void {
  if (optionalPasskeyVerified(body) === true) return;
  if (optionalLastVerifiedAt(body)) return;
  const creds = optionalPasskeyCreds(body);
  if (creds === undefined) unavailable();
  if (creds.length === 0) {
    throw new SessionPasskeyError('No enrolled passkey', 'auth.passkey_missing');
  }
  unavailable();
}

export interface LoadSessionPasskeyOptions {
  readonly identityUrl: string;
  readonly userId: string;
  readonly identityOwnershipSecret: string;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Identity GET /internal/account/:userId extras (webauthn lastVerifiedAt).
 * Transport / non-OK / parse / mismatch → verify unavailable (fail-closed).
 * Empty creds → cannot place. Never invent a challenge.
 */
export async function assertIdentitySessionPasskey(options: LoadSessionPasskeyOptions): Promise<void> {
  const id = typeof options.userId === 'string' ? options.userId.trim() : '';
  if (!id) unavailable();
  const base = options.identityUrl.replace(/\/+$/, '');
  const fetchFn = options.fetch ?? globalThis.fetch;
  const headers = serviceAuthHeaders('svc-edge', options.identityOwnershipSecret);
  let response: Response;
  try {
    response = await fetchFn(`${base}/internal/account/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    unavailable();
  }
  if (!response.ok) unavailable();
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    unavailable();
  }
  if (body && typeof body === 'object' && 'userId' in body) {
    const userId = (body as { userId?: unknown }).userId;
    if (typeof userId === 'string' && userId !== id) unavailable();
  }
  assertSessionPasskey(body);
}
