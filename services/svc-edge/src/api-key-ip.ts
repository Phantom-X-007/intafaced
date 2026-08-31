/**
 * Identity IP allowlist at the edge session door.
 * Non-empty list refuses a foreign / missing IP. Empty list stays open.
 * Never invent a CIDR. Identity body only — no second store.
 */
import { normalizeIp } from './request-client-ip.js';

export class KeyIpError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.ip_not_allowed',
  ) {
    super(message);
    this.name = 'KeyIpError';
  }
}

/** Identity / exchange / ownership body only. Never invent a list. */
export function optionalIpAllowlist(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.ipAllowlist ?? rec.ip_allowlist;
  if (raw === null || raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const list: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const ip = entry.trim();
    if (ip.length > 0) list.push(ip);
  }
  return list;
}

/** Walk a tRPC envelope or a bare body. Never invent a list. */
export function optionalIpAllowlistFromExchange(body: unknown): string[] | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const envelope = body as {
    result?: { data?: { json?: unknown; ipAllowlist?: unknown; ip_allowlist?: unknown } };
    ipAllowlist?: unknown;
    ip_allowlist?: unknown;
  };
  const data = envelope.result?.data?.json ?? envelope.result?.data ?? body;
  return optionalIpAllowlist(data);
}

/**
 * Empty list = unrestricted. Non-empty = request IP must exactly match an entry
 * after trim (IPv4 or IPv6). Missing IP with a non-empty list fails closed.
 * CIDR / hostname / junk list entries never match. No invented CIDR.
 */
export function apiKeyIpAllowed(allowlist: readonly string[], requestIp: string | null | undefined): boolean {
  if (allowlist.length === 0) return true;
  const ip = normalizeIp(requestIp);
  if (!ip) return false;
  for (const entry of allowlist) {
    const allowed = normalizeIp(entry);
    if (!allowed) continue;
    if (ip === allowed) return true;
  }
  return false;
}

/**
 * Bound list refuses a foreign / missing IP. Empty / missing list stays open.
 * Never invent a CIDR.
 */
export function assertApiKeyIp(allowlist: readonly string[] | null | undefined, requestIp: string | null | undefined): void {
  const list = allowlist ?? [];
  if (list.length === 0) return;
  if (!apiKeyIpAllowed(list, requestIp)) {
    throw new KeyIpError('API key is not allowed from this IP', 'auth.ip_not_allowed');
  }
}
