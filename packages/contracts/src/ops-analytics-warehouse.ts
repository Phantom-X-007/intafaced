/**
 * OPS ANALYTICS — Stage-1 warehouse read replica + honest empty surface
 * (TRK-ops.analytics).
 *
 * Slice A law in code:
 *   · which source DBs may feed a read replica
 *   · analytics connections are read-only (never writer credentials on primary)
 *   · lag fail-closed for "live" labels
 *   · empty / unconfigured warehouse → empty|unavailable — never invent volume
 *
 * No warehouse process, no OLTP write, no fabricated trading KPIs.
 */

import { z } from 'zod';
import {
  ANALYTICS_SOURCE_DBS,
  assertMetricPoint,
  lagFreshness,
  mayLabelLive,
  type AnalyticsSourceDb,
  type LagFreshness,
} from './ops-analytics.js';
import type { CubeFactRow, CubePoint } from './ops-analytics-cube.js';
import { evaluateCubeFixtures } from './ops-analytics-cube.js';

/** Replica sources documented for Stage-1 (OLTP remains SoT). */
export const WAREHOUSE_REPLICA_SOURCES = ANALYTICS_SOURCE_DBS;

/** Only read-only roles may attach to analytics replica URLs. */
export const ANALYTICS_REPLICA_ROLES = ['readonly'] as const;
export type AnalyticsReplicaRole = (typeof ANALYTICS_REPLICA_ROLES)[number];

/**
 * Writer / primary role name fragments that MUST NOT appear in analytics
 * connection strings. Fail-closed: if the URL looks like a service writer, refuse.
 */
export const FORBIDDEN_ANALYTICS_WRITER_USER_FRAGMENTS = [
  'svc_ledger',
  'svc_trade',
  'svc_identity',
  'intafaced_ops',
  'postgres',
  'migrator',
  'owner',
  'admin',
  'writer',
  'rw_',
] as const;

/**
 * Writer words no read-only marker may rescue.
 *
 * `admin_ro` is still admin. These are refused before the marker is consulted —
 * which is the half the original ordering got wrong.
 */
const NEVER_READONLY_USER_FRAGMENTS = ['postgres', 'migrator', 'owner', 'admin', 'writer', 'rw_'] as const;

/**
 * Service-owned names a genuine read-only marker DOES rescue.
 *
 * This is the documented intent — "`svc_ledger_ro` is allowed; bare
 * `svc_ledger` is not" — and it is the only class where a marker wins.
 */
const SERVICE_OWNED_USER_FRAGMENTS = ['svc_ledger', 'svc_trade', 'svc_identity', 'intafaced_ops'] as const;

/**
 * Read-only username markers, matched as a SUFFIX or the whole username.
 *
 * Anchored on purpose. Matched with `includes`, `_ro` is a substring of `_role`
 * and `_root`, and `analytics_ro` is a substring of `analytics_root` — so
 * `postgres_root`, `writer_role`, `admin_role` and `svc_ledger_rw_rotator` all
 * presented as read-only. A suffix is what a read-only role actually looks
 * like, and anything that misses now fails closed rather than open.
 */
export const ALLOWED_ANALYTICS_READONLY_USER_MARKERS = ['_ro', 'readonly', 'analytics_ro', 'replica_ro'] as const;

export const analyticsReplicaEndpointSchema = z.object({
  source: z.enum(ANALYTICS_SOURCE_DBS),
  /** Connection URL — must use a read-only role; never primary writer. */
  url: z
    .string()
    .url()
    .or(z.string().regex(/^postgres(ql)?:\/\//)),
  role: z.literal('readonly'),
  /** Observed replication lag in seconds; null/undefined → unknown freshness. */
  lagSeconds: z.number().finite().nonnegative().nullable().optional(),
});

export type AnalyticsReplicaEndpoint = z.infer<typeof analyticsReplicaEndpointSchema>;

export type ReplicaRoleCheck = { readonly ok: true; readonly username: string } | { readonly ok: false; readonly reason: string };

/**
 * Extract the username from a postgres URL. Invalid URL → empty string.
 */
export function analyticsReplicaUsername(url: string): string {
  try {
    const normalized = url.replace(/^postgres(ql)?:\/\//i, 'http://');
    return new URL(normalized).username || '';
  } catch {
    return '';
  }
}

/**
 * Fail-closed: analytics may only use read-only replica credentials.
 * Writer-looking usernames are refused even if role claims "readonly".
 */
export function assertAnalyticsReplicaRole(url: string, role: string): ReplicaRoleCheck {
  if (role !== 'readonly') {
    return { ok: false, reason: `analytics replica role must be "readonly", got "${role}"` };
  }
  const username = analyticsReplicaUsername(url);
  if (!username) {
    return { ok: false, reason: 'analytics replica URL missing username' };
  }
  const lower = username.toLowerCase();

  // A writer word is never rescued by a marker. `admin_ro` is still admin, and
  // this class has to be refused BEFORE the marker is consulted — the previous
  // order returned early on the marker and never reached this loop at all.
  for (const frag of NEVER_READONLY_USER_FRAGMENTS) {
    if (lower.includes(frag)) {
      return {
        ok: false,
        reason: `refuse writer-looking username "${username}" — analytics must not use primary credentials`,
      };
    }
  }

  // The marker rescues a SERVICE name and nothing else, which is the documented
  // intent: `svc_ledger_ro` is allowed, bare `svc_ledger` is not.
  //
  // Anchored, because `includes` was the second half of the bug: `_ro` is a
  // substring of `_role` and `_root`, and `analytics_ro` is a substring of
  // `analytics_root`. A suffix (or the whole username) is what a read-only role
  // actually looks like.
  if (ALLOWED_ANALYTICS_READONLY_USER_MARKERS.some((m) => lower === m || lower.endsWith(m))) {
    return { ok: true, username };
  }

  for (const frag of SERVICE_OWNED_USER_FRAGMENTS) {
    if (lower.includes(frag)) {
      return {
        ok: false,
        reason: `refuse writer-looking username "${username}" — analytics must not use primary credentials`,
      };
    }
  }
  return {
    ok: false,
    reason: `username "${username}" lacks a read-only marker (${ALLOWED_ANALYTICS_READONLY_USER_MARKERS.join(', ')})`,
  };
}

/**
 * Validate a replica endpoint (schema + role law).
 */
export function validateAnalyticsReplicaEndpoint(
  endpoint: AnalyticsReplicaEndpoint,
): ReplicaRoleCheck | { readonly ok: true; readonly endpoint: AnalyticsReplicaEndpoint } {
  const parsed = analyticsReplicaEndpointSchema.safeParse(endpoint);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? 'invalid replica endpoint' };
  }
  const roleCheck = assertAnalyticsReplicaRole(parsed.data.url, parsed.data.role);
  if (!roleCheck.ok) return roleCheck;
  return { ok: true, endpoint: parsed.data };
}

/** Stage-1 registry: which sources replicate (documented; wiring is env-side). */
export type WarehouseReplicaPlan = {
  readonly sources: readonly AnalyticsSourceDb[];
  readonly liveMaxLagSeconds: number;
  readonly forbidWriterOnPrimary: true;
};

export const WAREHOUSE_REPLICA_PLAN_V0: WarehouseReplicaPlan = {
  sources: WAREHOUSE_REPLICA_SOURCES,
  liveMaxLagSeconds: 60,
  forbidWriterOnPrimary: true,
};

export function listWarehouseReplicaSources(): readonly AnalyticsSourceDb[] {
  return WAREHOUSE_REPLICA_PLAN_V0.sources;
}

export type WarehouseSurfaceStatus = 'ok' | 'empty' | 'unavailable' | 'refuse';

export type WarehouseSurfaceResult =
  | {
      readonly status: 'ok';
      readonly points: readonly CubePoint[];
      readonly freshness: LagFreshness;
      readonly mayLabelLive: boolean;
    }
  | {
      readonly status: 'empty';
      readonly reason: 'no_facts';
      readonly freshness: LagFreshness;
      readonly mayLabelLive: false;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'replica_unconfigured' | 'lag_unknown' | 'lag_stale';
      readonly freshness: LagFreshness;
      readonly mayLabelLive: false;
    }
  | {
      readonly status: 'refuse';
      readonly reason: string;
      readonly mayLabelLive: false;
    };

export type WarehouseSurfaceInput = {
  /** False until ANALYTICS_REPLICA_* URLs are configured for the process. */
  readonly replicaConfigured: boolean;
  /** Observed lag; null/undefined → unknown (never "live"). */
  readonly lagSeconds: number | null | undefined;
  /**
   * Fixture / replica fact rows. Empty or omitted → empty surface
   * (never invent trading volume).
   */
  readonly facts?: readonly CubeFactRow[] | null;
};

/**
 * Read-only analytics surface.
 *
 * Honest empty warehouse: no facts → `empty`. Unconfigured replica or lag that
 * fails the live SLO → `unavailable`. Never fabricates volume series.
 */
export function queryWarehouseSurface(input: WarehouseSurfaceInput): WarehouseSurfaceResult {
  if (!input.replicaConfigured) {
    return {
      status: 'unavailable',
      reason: 'replica_unconfigured',
      freshness: 'unknown',
      mayLabelLive: false,
    };
  }

  const freshness = lagFreshness(input.lagSeconds);
  if (freshness === 'unknown') {
    return {
      status: 'unavailable',
      reason: 'lag_unknown',
      freshness: 'unknown',
      mayLabelLive: false,
    };
  }
  if (freshness === 'stale') {
    return {
      status: 'unavailable',
      reason: 'lag_stale',
      freshness: 'stale',
      mayLabelLive: false,
    };
  }

  const facts = input.facts ?? [];
  if (facts.length === 0) {
    return {
      status: 'empty',
      reason: 'no_facts',
      freshness,
      mayLabelLive: false,
    };
  }

  const evaluated = evaluateCubeFixtures(facts);
  if (evaluated.status === 'refuse') {
    return { status: 'refuse', reason: evaluated.reason, mayLabelLive: false };
  }

  for (const p of evaluated.points) {
    const check = assertMetricPoint(p.metricId, p.value);
    if (!check.ok) {
      return { status: 'refuse', reason: `${p.metricId}: ${check.reason}`, mayLabelLive: false };
    }
  }

  return {
    status: 'ok',
    points: evaluated.points,
    freshness,
    mayLabelLive: mayLabelLive(input.lagSeconds),
  };
}

/**
 * Operator-facing one-liner. Never implies live volume when surface is empty.
 */
export function warehouseSurfaceStatusLine(result: WarehouseSurfaceResult): string {
  if (result.status === 'ok') {
    return `status=ok points=${result.points.length} freshness=${result.freshness} live=${result.mayLabelLive ? '1' : '0'}`;
  }
  if (result.status === 'empty') {
    return `status=empty reason=${result.reason} freshness=${result.freshness} live=0`;
  }
  if (result.status === 'unavailable') {
    return `status=unavailable reason=${result.reason} freshness=${result.freshness} live=0`;
  }
  return `status=refuse reason=${result.reason} live=0`;
}
