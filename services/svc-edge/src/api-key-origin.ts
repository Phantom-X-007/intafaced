/**
 * Identity origin allowlist at the edge session door (#3323).
 * Non-empty list refuses a foreign / missing Origin. Empty list stays open.
 * Never invent localhost. Identity exchange body only — no second store.
 */

export class KeyOriginError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.domain_not_allowed',
  ) {
    super(message);
    this.name = 'KeyOriginError';
  }
}

/** Identity / exchange body only. Never invent a list. */
export function optionalOriginAllowlist(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.originAllowlist ?? rec.domainWhitelist ?? rec.domain_whitelist;
  if (raw === null || raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const list: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const origin = entry.trim();
    if (origin.length > 0) list.push(origin);
  }
  return list;
}

/** Walk a tRPC envelope or a bare body. Never invent a list. */
export function optionalOriginAllowlistFromExchange(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const envelope = body as {
    result?: { data?: { json?: unknown; originAllowlist?: unknown; domainWhitelist?: unknown; domain_whitelist?: unknown } };
    originAllowlist?: unknown;
    domainWhitelist?: unknown;
    domain_whitelist?: unknown;
  };
  const data = envelope.result?.data?.json ?? envelope.result?.data ?? body;
  return optionalOriginAllowlist(data);
}

export function normalizeOriginHost(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname || null;
    }
    const hostPart = trimmed.split('/')[0] ?? '';
    const host = hostPart.split(':')[0] ?? '';
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

/**
 * Empty list = unrestricted. Non-empty = Origin host must match an entry.
 * Missing Origin with a non-empty list fails closed.
 */
export function apiKeyOriginAllowed(whitelist: readonly string[], requestOrigin: string | null | undefined): boolean {
  if (whitelist.length === 0) return true;
  const host = normalizeOriginHost(requestOrigin);
  if (!host) return false;
  for (const entry of whitelist) {
    const allowed = normalizeOriginHost(entry);
    if (!allowed) continue;
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

/**
 * Bound list refuses a foreign / missing Origin. Empty / missing list stays open.
 * Never invent localhost.
 */
export function assertApiKeyOrigin(whitelist: readonly string[] | null | undefined, requestOrigin: string | null | undefined): void {
  const list = whitelist ?? [];
  if (list.length === 0) return;
  if (!apiKeyOriginAllowed(list, requestOrigin)) {
    throw new KeyOriginError('API key is not allowed from this origin', 'auth.domain_not_allowed');
  }
}
