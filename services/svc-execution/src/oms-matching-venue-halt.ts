/**
 * Matching venue halt-all for TWAP/VWAP/POV start / approve / release (M25 / M03).
 *
 * Consume matching GET /markets (`venueHalted`). Missing source refuses —
 * never invent live, never invent a halt, never POST /halt-all, never invent
 * an operator. One-market halt is a different door.
 */

export type MatchingVenueHalt = {
  readonly venueHalted: boolean;
};

export type MatchingVenueHaltRefuse =
  | { readonly ok: false; readonly reason: 'venue_halted'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'venue_halt_unavailable'; readonly detail: string };

export type MatchingVenueHaltPort =
  MatchingVenueHalt | (() => MatchingVenueHalt | Promise<MatchingVenueHalt | null | undefined> | null | undefined) | null | undefined;

/** Matching halt-all body only. Never invent a halt from an array or a string. */
export function optionalVenueHalted(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.venueHalted ?? rec.venue_halted;
  if (typeof raw !== 'boolean') return undefined;
  return raw;
}

/** Trimmed matching base, or null. Empty is missing — never invent localhost. */
export function readMatchingUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.replace(/\/+$/, '');
}

export function matchingVenueHaltRefuse(source: MatchingVenueHalt | null | undefined): MatchingVenueHaltRefuse | null {
  if (!source || typeof source.venueHalted !== 'boolean') {
    return {
      ok: false,
      reason: 'venue_halt_unavailable',
      detail: 'matching halt-all source is missing — refusing to invent live',
    };
  }
  if (source.venueHalted === true) {
    return {
      ok: false,
      reason: 'venue_halted',
      detail: 'all markets are halted — TWAP/VWAP/POV start/approve/release refused',
    };
  }
  return null;
}

export async function resolveMatchingVenueHalt(port: MatchingVenueHaltPort): Promise<MatchingVenueHalt | undefined> {
  if (port == null) return undefined;
  if (typeof port === 'function') {
    const out = await port();
    return out ?? undefined;
  }
  return port;
}

export interface LoadMatchingVenueHaltOptions {
  readonly matchingUrl?: string | null;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Matching GET /markets. Transport / non-OK / parse / missing `venueHalted`
 * → unavailable (fail-closed, not live). Never POST /halt-all.
 */
export async function loadMatchingVenueHalt(options: LoadMatchingVenueHaltOptions): Promise<MatchingVenueHalt | undefined> {
  const base = readMatchingUrl(options.matchingUrl);
  if (!base) return undefined;
  const fetchFn = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchFn(`${base}/markets`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  const venueHalted = optionalVenueHalted(body);
  if (typeof venueHalted !== 'boolean') return undefined;
  return { venueHalted };
}
