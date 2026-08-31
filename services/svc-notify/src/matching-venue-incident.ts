/**
 * Matching venue halt-all / one-market halt for notify customer-truth (M18).
 *
 * Consume matching GET /markets (`venueHalted`, `halted[]`). Missing source is
 * unavailable — never invent live, never invent a halt, never POST /halt-all,
 * never invent an operator. GET /health on matching does not carry halt today.
 */

export type MatchingVenueBoard = {
  readonly venueHalted: boolean;
  readonly haltedMarkets: readonly string[];
};

export type MatchingVenueLoad =
  { readonly kind: 'unwired' } | { readonly kind: 'unavailable' } | { readonly kind: 'board'; readonly board: MatchingVenueBoard };

/** Matching halt-all body only. Never invent a halt from an array or a string. */
export function optionalVenueHalted(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.venueHalted ?? rec.venue_halted;
  if (typeof raw !== 'boolean') return undefined;
  return raw;
}

/** One-market halt ids. Missing / non-array is empty — do not invent a halt list. */
export function optionalHaltedMarkets(body: unknown): readonly string[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as Record<string, unknown>).halted;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Trimmed matching base, or null. Empty is missing — never invent localhost. */
export function readMatchingUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.replace(/\/+$/, '');
}

export interface LoadMatchingVenueIncidentOptions {
  readonly matchingUrl?: string | null;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Matching GET /markets. Unset URL is unwired (do not invent a fetch).
 * Transport / non-OK / parse / missing `venueHalted` → unavailable (fail-closed,
 * not live). Never POST /halt-all.
 */
export async function loadMatchingVenueIncident(options: LoadMatchingVenueIncidentOptions): Promise<MatchingVenueLoad> {
  const base = readMatchingUrl(options.matchingUrl);
  if (!base) return { kind: 'unwired' };
  const fetchFn = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchFn(`${base}/markets`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { kind: 'unavailable' };
  }
  if (!response.ok) return { kind: 'unavailable' };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'unavailable' };
  }
  const venueHalted = optionalVenueHalted(body);
  if (typeof venueHalted !== 'boolean') return { kind: 'unavailable' };
  return {
    kind: 'board',
    board: { venueHalted, haltedMarkets: optionalHaltedMarkets(body) },
  };
}
