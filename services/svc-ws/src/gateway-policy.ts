/**
 * ws.gateway product policy — depth/trade/private fan-out honesty (§5.2 / D26-P4-06).
 *
 * Empty book stays empty. No fake depth, no invent mid, no seed fills as live tape.
 * Pure mechanism: consolidates the public-door posture already enforced in the hubs.
 */

/** Mirrors `depth/hub.ts` — named unavailability, not a priced empty ladder. */
export const DEPTH_ENGINE_UNAVAILABLE = 'depth.engine_unavailable' as const;

/**
 * Mirrors `private/hub.ts` — matching-down on the private orders stream.
 * Honest private name in the `*.engine_unavailable` family; not a blank blotter.
 */
export const ORDERS_ENGINE_UNAVAILABLE = 'orders.engine_unavailable' as const;

/** HTTP + WS refuse/close codes on the public depth door. */
export const GATEWAY_DEPTH_REFUSE_CODES = ['NoBook', 'MarketNotFound', DEPTH_ENGINE_UNAVAILABLE] as const;

/** Named unavailability on the authenticated private orders/fills stream. */
export const GATEWAY_PRIVATE_REFUSE_CODES = [ORDERS_ENGINE_UNAVAILABLE] as const;

/** Connect watermark: this replica is not a durable historical drop-copy tape. */
export const DROP_COPY_RECOVERY_REQUIRED = 'drop_copy.recovery_required' as const;
/** Drop-copy JetStream consumer is down — not an empty complete tape. */
export const DROP_COPY_COMMON_UPSTREAM_FAILURE = 'drop_copy.common_upstream_failure' as const;
/** A live seat missed an execution (slow consumer). Not invented. */
export const DROP_COPY_GAP = 'drop_copy.gap' as const;

export const GATEWAY_DROP_COPY_REFUSE_CODES = [DROP_COPY_RECOVERY_REQUIRED, DROP_COPY_COMMON_UPSTREAM_FAILURE, DROP_COPY_GAP] as const;

/** PX-S03 §11 — owner lease range blank; client clock is not a substitute. */
export const COD_LEASE_RANGE_UNCONFIGURED = 'cod.lease_range_unconfigured' as const;
export const COD_TRADE_NOT_REACHED = 'cod.trade_not_reached' as const;
export const COD_SESSION_SCOPE_NOT_MAPPED = 'cod.session_scope_not_mapped' as const;

export const GATEWAY_COD_REFUSE_CODES = [
  'cod.malformed',
  COD_LEASE_RANGE_UNCONFIGURED,
  'cod.write_required',
  'cod.excluded_classes_unconfigured',
  'cod.scope_unsupported',
  'cod.ttl_out_of_range',
  'cod.unarmed',
] as const;

export interface DepthSnapshotSides {
  readonly bids: readonly (readonly [string, string])[];
  readonly asks: readonly (readonly [string, string])[];
}

export type GatewayPolicySummary = ReturnType<typeof describeGatewayPolicy>;

/** Resting depth on either side. Empty sides are absence, not a live zero book. */
export function snapshotHasRestingDepth(snapshot: DepthSnapshotSides): boolean {
  return snapshot.bids.length > 0 || snapshot.asks.length > 0;
}

/** Public honesty board for ws.gateway HTTP + websocket fan-out. */
export function describeGatewayPolicy() {
  return {
    emptyBookStaysEmpty: true as const,
    emptyNotZeroOnWire: true as const,
    noFakeDepth: true as const,
    noInventMid: true as const,
    noSeedFillsAsLiveTape: true as const,
    engineDownNamesUnavailable: true as const,
    unknownMarketTypedClose: true as const,
    holeNotSyntheticEmptyBook: true as const,
    depthWorksWithoutNats: true as const,
    privateRequiresAuth: true as const,
    dropCopyIndependentOfTradingSession: true as const,
    dropCopyReadOnly: true as const,
    dropCopyReplayDurable: false as const,
    cancelOnDisconnectLease: true as const,
    codClientClockIgnored: true as const,
    codInventedMassSuccess: false as const,
    refuseCodes: [...GATEWAY_DEPTH_REFUSE_CODES],
    privateRefuseCodes: [...GATEWAY_PRIVATE_REFUSE_CODES],
    dropCopyRefuseCodes: [...GATEWAY_DROP_COPY_REFUSE_CODES],
    codRefuseCodes: [...GATEWAY_COD_REFUSE_CODES],
    inventsQuietMarket: false as const,
    inventsFuturesPositions: false as const,
  };
}

/**
 * First depth frame on connect. Absence beats bids/asks `[]` — a listed never-traded
 * market stays open with no frames until resting depth exists.
 */
export function allowsConnectDepthSnapshot(hasRestingDepth: boolean, hasPriorBook: boolean): boolean {
  return hasRestingDepth || hasPriorBook;
}

/**
 * seq-0 (or any snapshot) with empty sides reads as a priced zero book when there
 * was no prior hub book. That is invention, not honest empty.
 */
export function wouldInventInitialEmptyLadder(snapshot: DepthSnapshotSides, hasPriorBook: boolean): boolean {
  return !hasPriorBook && !snapshotHasRestingDepth(snapshot);
}

/**
 * Matching-down / seed-fail must disclose `depth.engine_unavailable`, not a silent
 * seq-0 empty ladder that looks like a quiet market.
 */
export function wouldInventQuietMarketFromEngineDown(wouldSendEmptySnapshot: boolean, engineAvailable: boolean): boolean {
  return !engineAvailable && wouldSendEmptySnapshot;
}
