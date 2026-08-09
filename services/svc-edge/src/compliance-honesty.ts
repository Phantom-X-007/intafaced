/**
 * EDGE OPS HONESTY — wire packages/config + contracts analytics refuse to the door.
 *
 * TRK-ops.compliance / ops.analytics residual after #1551 (pure config) and
 * Stage-1 warehouse contracts: operators must SEE unset≠clear, partner_cleared
 * refuse, sole ledger freeze authority, and dark analytics — not invent green
 * ticks from silence on `/admin/status`.
 *
 * No sanctions list content (Class X). No VPN vendor invent. No fake cubes.
 * No second freeze path. Money freeze remains ledger-only.
 */

import {
  FREEZE_AUTHORITY_FLAG_KEY,
  NETWORK_SIGNAL_CONFIGURED_ENV,
  NETWORK_SIGNAL_FAIL_CLOSED_ENV,
  applyComplianceQueueDisposition,
  assertFreezeAuthority,
  assertScreeningConfigured,
  checkNetworkAccess,
  complianceQueueSnapshot,
  freezeAuthorityNote,
  inventFreezeOutsideLedger,
  listFreezeAuthorities,
  networkSignalStatusLine,
  resolveNetworkSignal,
  type ComplianceQueueDispositionRequest,
  type ComplianceQueueDispositionResult,
  type ComplianceQueueItem,
  type ComplianceQueueSnapshot,
  type FreezeAuthorityCheck,
  type NetworkAccessDecision,
  type NetworkSignalObservation,
  type NetworkSignalStatus,
} from '@intafaced/config';
import {
  assertAnalyticsReplicaRole,
  listConfiguredAnalyticsReplicaUrls,
  queryWarehouseSurface,
  warehouseSurfaceStatusLine,
  type WarehouseSurfaceResult,
} from '@intafaced/contracts';

export type EdgeNetworkHonesty = {
  readonly signal: NetworkSignalStatus;
  readonly access: NetworkAccessDecision;
  /** Compact line for logs / status. */
  readonly statusLine: string;
  /**
   * Env keys this surface reads — names only, never secrets or vendor brands.
   * Operators set fail-closed when they mean enforcement (Class X partner first).
   */
  readonly envKeys: {
    readonly configured: typeof NETWORK_SIGNAL_CONFIGURED_ENV;
    readonly failClosed: typeof NETWORK_SIGNAL_FAIL_CLOSED_ENV;
  };
};

export type EdgeFreezeHonesty = {
  readonly soleKey: typeof FREEZE_AUTHORITY_FLAG_KEY;
  readonly note: string;
  readonly authorities: readonly string[];
  /**
   * Hostile path: free-text invent freezes ("trade freeze") must refuse.
   * Always evaluated for the probe labels below so status cannot stay silent.
   */
  readonly inventProbes: Readonly<Record<'trade freeze' | 'pay freeze' | 'ledger.posting', FreezeAuthorityCheck>>;
};

export type EdgeAnalyticsHonesty = {
  readonly replicaConfigured: boolean;
  readonly replicaCount: number;
  /** Writer-looking URLs refuse before any cube is painted. */
  readonly refuse: string | null;
  readonly surface: WarehouseSurfaceResult;
  readonly statusLine: string;
};

export type EdgeComplianceHonesty = {
  readonly network: EdgeNetworkHonesty;
  readonly freeze: EdgeFreezeHonesty;
  readonly complianceQueue: ComplianceQueueSnapshot;
  readonly analytics: EdgeAnalyticsHonesty;
  /**
   * Screening list posture already asserted at boot — partnerConfigured for the
   * queue is the screening list being configured (listed OR reviewed-empty),
   * never invent of a vendor pass.
   */
  readonly screeningPartnerConfigured: boolean;
};

/**
 * Resolve all edge-facing ops honesty from env + optional network observation.
 *
 * Pure enough for unit tests: pass env maps; no I/O, no list content invent.
 */
export function edgeComplianceHonesty(
  env: Record<string, string | undefined> = process.env,
  options: {
    readonly networkObservation?: NetworkSignalObservation | null;
    readonly queueItems?: readonly ComplianceQueueItem[];
  } = {},
): EdgeComplianceHonesty {
  const signal = resolveNetworkSignal(env, options.networkObservation);
  const access = checkNetworkAccess(env, options.networkObservation);
  const screening = assertScreeningConfigured(env);
  const partnerConfigured = screening.configured;

  const inventProbes = {
    'trade freeze': inventFreezeOutsideLedger('trade freeze'),
    'pay freeze': inventFreezeOutsideLedger('pay freeze'),
    'ledger.posting': inventFreezeOutsideLedger('ledger.posting'),
  } as const;

  const authorities = listFreezeAuthorities().map((f) => f.key);
  // Sole authority must still assert clean — misconfigured registry is a halt lie.
  const sole = assertFreezeAuthority(FREEZE_AUTHORITY_FLAG_KEY);
  if (!sole.ok) {
    // freezeAuthorityNote already spells MISCONFIGURED; keep authorities empty of lies.
  }

  return {
    network: {
      signal,
      access,
      statusLine: networkSignalStatusLine(env, options.networkObservation),
      envKeys: {
        configured: NETWORK_SIGNAL_CONFIGURED_ENV,
        failClosed: NETWORK_SIGNAL_FAIL_CLOSED_ENV,
      },
    },
    freeze: {
      soleKey: FREEZE_AUTHORITY_FLAG_KEY,
      note: freezeAuthorityNote(),
      authorities,
      inventProbes,
    },
    complianceQueue: complianceQueueSnapshot(options.queueItems ?? [], partnerConfigured),
    analytics: analyticsHonesty(env),
    screeningPartnerConfigured: partnerConfigured,
  };
}

function analyticsHonesty(env: Record<string, string | undefined>): EdgeAnalyticsHonesty {
  const listed = listConfiguredAnalyticsReplicaUrls(env);
  if (listed.length === 0) {
    const surface = queryWarehouseSurface({ replicaConfigured: false, lagSeconds: null, facts: [] });
    return {
      replicaConfigured: false,
      replicaCount: 0,
      refuse: null,
      surface,
      statusLine: warehouseSurfaceStatusLine(surface),
    };
  }

  for (const { source, url } of listed) {
    const role = assertAnalyticsReplicaRole(url, 'readonly');
    if (!role.ok) {
      const surface = queryWarehouseSurface({ replicaConfigured: false, lagSeconds: null, facts: [] });
      return {
        replicaConfigured: false,
        replicaCount: listed.length,
        refuse: `analytics replica ${source}: ${role.reason}`,
        surface,
        statusLine: `status=refuse reason=writer_or_bad_role source=${source} live=0`,
      };
    }
  }

  // Replica URLs present and role-clean, but this edge does not run lag probes
  // or ETL. Surface is honest dark/unavailable — never invent live cubes.
  const surface = queryWarehouseSurface({
    replicaConfigured: true,
    lagSeconds: null,
    lagSource: 'unknown',
    facts: [],
  });
  return {
    replicaConfigured: true,
    replicaCount: listed.length,
    refuse: null,
    surface,
    statusLine: warehouseSurfaceStatusLine(surface),
  };
}

/**
 * In-memory compliance queue for the operator door.
 *
 * Persistence/UI product remains residual. Mechanism Done bar: partner_cleared
 * refuses without screening partner; empty is honest empty; no invent cases.
 */
export class EdgeComplianceQueue {
  private readonly items = new Map<string, ComplianceQueueItem>();

  constructor(private readonly env: () => Record<string, string | undefined> = () => process.env) {}

  snapshot(): ComplianceQueueSnapshot {
    return complianceQueueSnapshot([...this.items.values()], assertScreeningConfigured(this.env()).configured);
  }

  /**
   * Seed a case for review. Does not invent cases on empty — caller must open.
   * Used by tests and by a future ticket intake path; not auto-filled.
   */
  open(item: ComplianceQueueItem): ComplianceQueueSnapshot {
    const id = item.id.trim();
    if (id === '') throw new Error('compliance queue: item id required');
    if (this.items.has(id)) throw new Error(`compliance queue: item ${id} already open`);
    this.items.set(id, { ...item, id });
    return this.snapshot();
  }

  dispose(itemId: string, request: ComplianceQueueDispositionRequest): ComplianceQueueDispositionResult {
    const item = this.items.get(itemId.trim()) ?? null;
    const partnerConfigured = assertScreeningConfigured(this.env()).configured;
    const result = applyComplianceQueueDisposition(item, request, partnerConfigured);
    if (result.ok && result.status !== 'pending') {
      this.items.delete(itemId.trim());
    }
    return result;
  }
}
