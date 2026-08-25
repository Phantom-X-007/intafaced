/**
 * Client IP at the edge. Exact IPv4/IPv6 after trim. No invented CIDR.
 * Empty / missing is a missing IP (identity fails closed when a key is bound).
 */
import { isIP } from 'node:net';

/** Trim + IPv4/IPv6 literal. Null for blank, CIDR, hostname, or junk. */
export function normalizeIp(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isIP(trimmed) === 0 ? null : trimmed;
}

/** First hop of x-forwarded-for, else x-real-ip. Never invent an address. */
export function requestClientIp(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers['x-forwarded-for'] ?? headers['x-real-ip'] ?? headers['X-Forwarded-For'] ?? headers['X-Real-Ip'];
  const forwarded = Array.isArray(raw) ? raw[0] : raw;
  if (typeof forwarded !== 'string') return null;
  return normalizeIp(forwarded.split(',')[0] ?? '');
}
