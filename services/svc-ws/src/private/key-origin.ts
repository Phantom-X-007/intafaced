/**
 * Origin allowlist on API keys for `/private/stream` and drop-copy.
 *
 * Empty list = unrestricted. Non-empty = upgrade Origin host must match.
 * Missing Origin with a non-empty list fails closed. Never invent localhost.
 */
import type { IncomingMessage } from 'node:http';

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

/** Upgrade Origin header only. Never x-forwarded-origin. */
export function requestOriginFromUpgrade(req: IncomingMessage): string | null {
  const raw = req.headers.origin;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
