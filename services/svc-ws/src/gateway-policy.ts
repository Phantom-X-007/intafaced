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
    refuseCodes: [...GATEWAY_DEPTH_REFUSE_CODES],
    privateRefuseCodes: [...GATEWAY_PRIVATE_REFUSE_CODES],
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
