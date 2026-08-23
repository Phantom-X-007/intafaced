/**
 * REQUEST REGION RESOLUTION — mechanism half of socket.geo-region-resolution.
 *
 * TRK-ops.compliance / socket.geo-region-resolution: region must never come from
 * an untrusted caller (they would choose their own regulator). Closing the socket
 * fully needs a deployment-topology decision (which CDN/proxy fronts the edge).
 *
 * This module is the pure mechanism product residual that CAN ship without Class X
 * geo-vendor invent:
 *
 *   · DEFAULT_REGION alone → stamped constant (today's behaviour).
 *   · EDGE_GEO_COUNTRY_HEADER + EDGE_TRUST_PROXY → read a trusted upstream header.
 *   · Header absent / invalid / untrusted → unresolved `XX` (regionResolved false).
 *   · Never invent a country from the socket IP without a named trusted header.
 *
 * List content (which regions to block) stays counsel/Nitro Class X.
 */

import { UNRESOLVED_REGION, isRegionResolved } from '@intafaced/config';

/** Env: trusted geo country header name (e.g. `cf-ipcountry`). Empty = not wired. */
export const EDGE_GEO_COUNTRY_HEADER_ENV = 'EDGE_GEO_COUNTRY_HEADER';

export type RegionSource = 'default' | 'trusted_header' | 'unresolved' | 'header_ignored_no_trust';

/** Missing or untrusted geo header — caller must not set region. */
export const EDGE_REGION_UNTRUSTED = 'edge.region_untrusted' as const;

export type RequestRegionResolution = {
  /** Two-letter code stamped onto the principal. */
  readonly region: string;
  /** False for XX / unresolved sentinel — never paint "screened clean" from silence. */
  readonly regionResolved: boolean;
  readonly source: RegionSource;
  /** Header name consulted, or null when default-only. */
  readonly headerName: string | null;
  /** One sentence an operator can act on. */
  readonly note: string;
  /** Set when a named header is missing, invalid, or untrusted (forge path). */
  readonly refuseCode: typeof EDGE_REGION_UNTRUSTED | null;
};

function normalizeRegionCode(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const v = raw.trim().toUpperCase();
  // ISO-3166-ish alpha-2 only. Reject XX from header (unresolved is server-side).
  if (!/^[A-Z]{2}$/.test(v)) return null;
  if (v === UNRESOLVED_REGION) return null;
  return v;
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== key) continue;
    if (Array.isArray(v)) return v[0];
    return v;
  }
  return undefined;
}

/**
 * Resolve the caller's region for one request.
 *
 * Hostile path blocked: a client-set region without trustProxy is ignored (or,
 * when a geo header is configured without trust, we refuse to invent a code and
 * fall back to default with an explicit `header_ignored_no_trust` source).
 */
export function resolveRequestRegion(input: {
  readonly defaultRegion: string;
  /** True when Fastify trustProxy / EDGE_TRUST_PROXY is set. */
  readonly trustProxy: boolean;
  /** EDGE_GEO_COUNTRY_HEADER value — empty/undefined means not wired. */
  readonly geoHeaderName?: string | null;
  readonly headers?: Record<string, string | string[] | undefined>;
}): RequestRegionResolution {
  const defaultRegion = (input.defaultRegion.trim().toUpperCase() || UNRESOLVED_REGION).slice(0, 2);
  const headerNameRaw = input.geoHeaderName?.trim() ?? '';
  const headerName = headerNameRaw.length > 0 ? headerNameRaw : null;

  if (!headerName) {
    return {
      region: defaultRegion,
      regionResolved: isRegionResolved(defaultRegion),
      source: 'default',
      headerName: null,
      refuseCode: null,
      note:
        'region: DEFAULT_REGION only — no EDGE_GEO_COUNTRY_HEADER. ' +
        'Per-request geo is residual until a trusted upstream header is named (socket.geo-region-resolution).',
    };
  }

  if (!input.trustProxy) {
    // Header name configured but trustProxy off — reading it would accept
    // client-forged country. Refuse; never stamp a caller-chosen regulator.
    return {
      region: UNRESOLVED_REGION,
      regionResolved: false,
      source: 'header_ignored_no_trust',
      headerName,
      refuseCode: EDGE_REGION_UNTRUSTED,
      note:
        `region: EDGE_GEO_COUNTRY_HEADER=${headerName} is set but EDGE_TRUST_PROXY is unset — ` +
        `${EDGE_REGION_UNTRUSTED}. Set EDGE_TRUST_PROXY to the reverse-proxy hop first.`,
    };
  }

  const raw = headerValue(input.headers ?? {}, headerName);
  const fromHeader = normalizeRegionCode(raw);
  if (!fromHeader) {
    return {
      region: UNRESOLVED_REGION,
      regionResolved: false,
      source: 'unresolved',
      headerName,
      refuseCode: EDGE_REGION_UNTRUSTED,
      note: `region: trusted header "${headerName}" missing or invalid — ${EDGE_REGION_UNTRUSTED}. Caller cannot set region.`,
    };
  }

  return {
    region: fromHeader,
    regionResolved: true,
    source: 'trusted_header',
    headerName,
    refuseCode: null,
    note: `region: ${fromHeader} from trusted header ${headerName}.`,
  };
}

/** Compact status line for /admin/status and logs. */
export function regionResolutionStatusLine(r: RequestRegionResolution): string {
  return `region=${r.region} resolved=${r.regionResolved ? 1 : 0} source=${r.source}`;
}
