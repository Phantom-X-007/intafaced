/**
 * Matching venue halt-all at the HTTP session door (M03 / M05).
 * When matching is halt-all, NEW order traffic cannot open as live.
 * Cancels still let the user out. Consume matching GET /health — no second store.
 * Missing halt source refuses (do not invent live). Never invent an operator.
 */

import type { FastifyInstance } from 'fastify';
import {
  ALWAYS_ALLOWED_PROCEDURES,
  ALWAYS_ALLOWED_REST,
  MODULE_BY_PREFIX,
  procedureLeaf,
  proceduresOf,
  resolvedPathname,
} from './kill-switch.js';
import { userCopy } from './user-copy.js';

export class MatchingVenueHaltError extends Error {
  constructor(
    message: string,
    readonly code: 'edge.venue_halted' | 'edge.venue_halt_unavailable',
  ) {
    super(message);
    this.name = 'MatchingVenueHaltError';
  }
}

/** Matching halt-all body only. Never invent a halt. */
export function optionalVenueHalted(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.venueHalted ?? rec.halted;
  if (typeof raw !== 'boolean') return undefined;
  return raw;
}

export function venueIsHalted(halted: boolean | null | undefined): boolean {
  return halted === true;
}

/**
 * Missing halt source cannot be treated as live. `true` is halt-all.
 * `false` proceeds. Undefined / null refuses — do not invent open.
 */
export function assertMatchingHaltSource(halted: boolean | null | undefined): void {
  if (halted === true) {
    throw new MatchingVenueHaltError('all markets are halted — new submits are refused', 'edge.venue_halted');
  }
  if (halted === false) return;
  throw new MatchingVenueHaltError('matching halt-all status is missing', 'edge.venue_halt_unavailable');
}

/** Trimmed matching base, or null. Empty is missing — never invent localhost. */
export function readMatchingUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.replace(/\/+$/, '');
}

/**
 * NEW order / amend / other trade write. Cancels and reads are not this door.
 * Pay, identity, and non-trade prefixes stay out — matching halt-all is the book.
 */
export function isNewOrderTraffic(pathname: string, method: string): boolean {
  const prefixes = [...MODULE_BY_PREFIX.entries()].filter(([, module]) => module === 'trade').map(([prefix]) => prefix);
  const prefix = prefixes.sort((a, b) => b.length - a.length).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!prefix) return false;

  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false;

  const procedures = proceduresOf(pathname);
  if (procedures !== null && procedures.length > 0 && procedures.every((p) => ALWAYS_ALLOWED_PROCEDURES.includes(procedureLeaf(p)))) {
    return false;
  }

  const path = pathname.split('?')[0] ?? pathname;
  if (ALWAYS_ALLOWED_REST.some((r) => r.method === verb && r.pattern.test(path))) return false;

  return true;
}

export interface LoadMatchingVenueHaltOptions {
  readonly matchingUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Matching GET /health. Transport / non-OK / parse / missing `halted` → unavailable
 * (fail-closed, not live). `halted`/`venueHalted: true` → halt-all. Never POST
 * /halt-all and never send an operator — the edge does not invent a caller.
 */
export async function assertMatchingVenueNotHaltAll(options: LoadMatchingVenueHaltOptions): Promise<void> {
  const base = readMatchingUrl(options.matchingUrl);
  if (!base) {
    throw new MatchingVenueHaltError('matching halt-all source is missing', 'edge.venue_halt_unavailable');
  }
  const fetchFn = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchFn(`${base}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new MatchingVenueHaltError('matching halt-all source is missing', 'edge.venue_halt_unavailable');
  }
  if (!response.ok) {
    throw new MatchingVenueHaltError('matching halt-all source is missing', 'edge.venue_halt_unavailable');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MatchingVenueHaltError('matching halt-all source is missing', 'edge.venue_halt_unavailable');
  }
  assertMatchingHaltSource(optionalVenueHalted(body));
}

export interface MatchingVenueHaltGuardOptions {
  readonly matchingUrl?: string | null;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Matching venue halt-all on NEW trade writes (`/api/v1` + `/api/trade`).
 *
 * Unset MATCHING_URL: matching is not wired at this door — do not invent a URL
 * or an operator. A set URL whose halt field is missing refuses NEW (not live).
 * Cancels still pass. GET /health only — never POST /halt-all.
 */
export function registerMatchingVenueHaltGuard(app: FastifyInstance, options: MatchingVenueHaltGuardOptions = {}): void {
  const matchingUrl = readMatchingUrl(options.matchingUrl);
  app.addHook('onRequest', async (req, reply) => {
    const pathname = resolvedPathname(req.url);
    if (pathname === null) return;
    if (!isNewOrderTraffic(pathname, req.method)) return;
    if (!matchingUrl) return;

    try {
      await assertMatchingVenueNotHaltAll({ matchingUrl, fetch: options.fetch });
    } catch (err) {
      const code = err instanceof MatchingVenueHaltError ? err.code : 'edge.venue_halt_unavailable';
      req.log.warn({ path: pathname, code }, 'edge: refused — matching venue halt-all');
      return reply
        .code(503)
        .header('retry-after', '30')
        .send({
          error: userCopy(code),
          code,
        });
    }
  });
}
