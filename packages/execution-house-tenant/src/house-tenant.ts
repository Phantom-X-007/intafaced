/**
 * Sealed house-desk tenancy mechanism — ADR D26-P0-01 Stage-1.
 *
 * Law: docs/adr/2026-08-08-house-desk-and-market-making-fairness.md
 *   · Mechanism (keys, namespace, audit, kill) may be built.
 *   · Internal-venue half stays blocked — refuse, never silently no-op.
 *   · Kill-switches apply FIRST (ADR rule 5).
 *   · Matching treats the house tenant as an ordinary participant — this
 *     package must not import svc-matching or branch on tenant identity there.
 *   · No queue privilege. No alpha/strategies in repo.
 */

export type HouseTenantId = string;

export type HouseKeyNamespace = `execution.tenant.${string}`;

export function keyNamespaceFor(tenantId: HouseTenantId): HouseKeyNamespace {
  return `execution.tenant.${tenantId}`;
}

/**
 * Where the tenant is asked to quote/route.
 *
 * External venue ids are opaque strings — this package does not invent a venue
 * list, mids, or fees. `internal` and `matching-book` are the blocked half.
 */
export type TenantVenueTarget =
  { readonly kind: 'internal' } | { readonly kind: 'matching-book' } | { readonly kind: 'external'; readonly venueId: string };

export function isExternalVenueTarget(target: TenantVenueTarget): target is { readonly kind: 'external'; readonly venueId: string } {
  return target.kind === 'external';
}

/** Same reason token as `refuseInternalMm` in `@intafaced/execution-mm`. */
export type TenantRefuseReason = 'internal_venue' | 'kill_switch' | 'unknown_tenant' | 'invalid_venue';

export interface TenantRefusal {
  readonly ok: false;
  readonly reason: TenantRefuseReason;
  readonly detail: string;
}

export interface TenantClear {
  readonly ok: true;
  readonly tenantId: HouseTenantId;
  readonly keyNamespace: HouseKeyNamespace;
  readonly venueId: string;
}

export type TenantAuthorizeResult = TenantClear | TenantRefusal;

export type TenantAuditOp = 'register' | 'admin_kill' | 'authorize';

export interface TenantAuditRecord {
  readonly at: string;
  readonly tenantId: HouseTenantId;
  readonly actor: string;
  readonly op: TenantAuditOp;
  readonly outcome: 'ok' | TenantRefuseReason;
  readonly detail: string;
}

export interface HouseTenant {
  readonly tenantId: HouseTenantId;
  readonly keyNamespace: HouseKeyNamespace;
  killed: boolean;
}

export interface TenantDescribe {
  readonly tenantId: HouseTenantId;
  readonly keyNamespace: HouseKeyNamespace;
  readonly killed: boolean;
  readonly auditCount: number;
}

/** Honest refuse copy — mirrors `refuseInternalMm` / `internal_venue`. */
export const HOUSE_INTERNAL_VENUE_DETAIL =
  'D26-P0-01 — internal market-making / matching-book half blocked (house desk external-only for v1); pointing this tenant at our book stays blocked until a later owner ruling';

export function refuseInternalVenue(detail?: string): TenantRefusal {
  return {
    ok: false,
    reason: 'internal_venue',
    detail: detail ?? HOUSE_INTERNAL_VENUE_DETAIL,
  };
}

export function adminKill(tenant: HouseTenant, actor: string, at: string): TenantAuditRecord {
  tenant.killed = true;
  return {
    at,
    tenantId: tenant.tenantId,
    actor,
    op: 'admin_kill',
    outcome: 'ok',
    detail: 'admin kill-switch applied first (ADR rule 5) — tenant cannot quote or route',
  };
}

/**
 * Authorize quote/route against a venue target.
 *
 * Kill is evaluated FIRST. A killed tenant cannot quote/route even externally.
 * Internal / matching-book targets refuse with `internal_venue` only after kill
 * is clear — so a killed+internal call still reports `kill_switch`.
 */
export function authorizeTenantVenue(tenant: HouseTenant, target: TenantVenueTarget): TenantAuthorizeResult {
  if (tenant.killed) {
    return {
      ok: false,
      reason: 'kill_switch',
      detail: 'tenant killed — cannot quote or route (including external venues)',
    };
  }
  if (target.kind === 'internal' || target.kind === 'matching-book') {
    return refuseInternalVenue();
  }
  const venueId = target.venueId.trim();
  if (venueId.length === 0) {
    return {
      ok: false,
      reason: 'invalid_venue',
      detail: 'external venue id must be a non-empty opaque string — no venue list is invented',
    };
  }
  return {
    ok: true,
    tenantId: tenant.tenantId,
    keyNamespace: tenant.keyNamespace,
    venueId,
  };
}

export class SealedHouseTenantRegistry {
  private readonly tenants = new Map<HouseTenantId, HouseTenant>();
  private readonly audit: TenantAuditRecord[] = [];

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  register(tenantId: HouseTenantId, actor: string): HouseTenant | TenantRefusal {
    const id = tenantId.trim();
    if (id.length === 0) {
      return { ok: false, reason: 'invalid_venue', detail: 'tenantId must be a non-empty string' };
    }
    const existing = this.tenants.get(id);
    if (existing) return existing;
    const tenant: HouseTenant = {
      tenantId: id,
      keyNamespace: keyNamespaceFor(id),
      killed: false,
    };
    this.tenants.set(id, tenant);
    this.audit.push({
      at: this.now(),
      tenantId: id,
      actor,
      op: 'register',
      outcome: 'ok',
      detail: `sealed namespace ${tenant.keyNamespace}`,
    });
    return tenant;
  }

  get(tenantId: HouseTenantId): HouseTenant | undefined {
    return this.tenants.get(tenantId);
  }

  describe(tenantId: HouseTenantId): TenantDescribe | TenantRefusal {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return { ok: false, reason: 'unknown_tenant', detail: `no sealed tenant ${tenantId}` };
    }
    return {
      tenantId: tenant.tenantId,
      keyNamespace: tenant.keyNamespace,
      killed: tenant.killed,
      auditCount: this.audit.filter((row) => row.tenantId === tenant.tenantId).length,
    };
  }

  kill(tenantId: HouseTenantId, actor: string): TenantAuditRecord | TenantRefusal {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return { ok: false, reason: 'unknown_tenant', detail: `no sealed tenant ${tenantId}` };
    }
    const record = adminKill(tenant, actor, this.now());
    this.audit.push(record);
    return record;
  }

  authorize(tenantId: HouseTenantId, target: TenantVenueTarget, actor: string): TenantAuthorizeResult {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return { ok: false, reason: 'unknown_tenant', detail: `no sealed tenant ${tenantId}` };
    }
    const result = authorizeTenantVenue(tenant, target);
    this.audit.push({
      at: this.now(),
      tenantId,
      actor,
      op: 'authorize',
      outcome: result.ok ? 'ok' : result.reason,
      detail: result.ok ? `external venue ${result.venueId}` : result.detail,
    });
    return result;
  }

  auditFor(tenantId: HouseTenantId): readonly TenantAuditRecord[] {
    return this.audit.filter((row) => row.tenantId === tenantId);
  }
}
