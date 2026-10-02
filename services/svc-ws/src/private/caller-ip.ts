/**
 * Caller IP on the private stream. Exact IPv4/IPv6 after trim. No invented CIDR.
 * Empty list on the key stays open. Missing IP with a non-empty list fails closed.
 */
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

export function normalizeIp(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Strip IPv4-mapped IPv6 prefix so a bound v4 still matches the socket form.
  const mapped = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  return isIP(mapped) === 0 ? null : mapped;
}

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
 * The TCP peer. This socket is outside svc-edge, which is the door that
 * strips a client x-forwarded-for and writes the real one. A header here
 * is the caller talking. Never invent an address.
 */
export function callerIpFromUpgrade(req: IncomingMessage): string | null {
  return normalizeIp(req.socket.remoteAddress);
}
