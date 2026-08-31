/**
 * ws.gateway product policy — depth/trade/private fan-out honesty (§5.2 / D26-P4-06).
 *
 * Empty book stays empty. No fake depth, no invent mid, no seed fills as live tape.
 * Pure mechanism: consolidates the public-door posture already enforced in the hubs.
 */

import {
  DEPTH_MARKET_DELISTED,
  DEPTH_MARKET_EXPIRED,
  DEPTH_MARKET_HALTED,
  DEPTH_MARKET_PRELAUNCH,
  DEPTH_VENUE_HALTED,
  ORDERS_MARKET_DELISTED,
  ORDERS_MARKET_EXPIRED,
  ORDERS_MARKET_HALTED,
  ORDERS_MARKET_PRELAUNCH,
  ORDERS_VENUE_HALTED,
} from './matching-trading.js';

export {
  DEPTH_MARKET_DELISTED,
  DEPTH_MARKET_EXPIRED,
  DEPTH_MARKET_HALTED,
  DEPTH_MARKET_PRELAUNCH,
  DEPTH_VENUE_HALTED,
  ORDERS_MARKET_DELISTED,
  ORDERS_MARKET_EXPIRED,
  ORDERS_MARKET_HALTED,
  ORDERS_MARKET_PRELAUNCH,
  ORDERS_VENUE_HALTED,
};

/** Mirrors `depth/hub.ts` — named unavailability, not a priced empty ladder. */
export const DEPTH_ENGINE_UNAVAILABLE = 'depth.engine_unavailable' as const;

/**
 * Engine does not publish true L3 / market-by-order / queue-position events.
 * JSON L2 depth is not L3 — refuse, never synthesize.
 */
export const DEPTH_L3_UNAVAILABLE = 'depth.l3_unavailable' as const;

/**
 * No binary/SBE feed exists on this door. JSON depth is not binary — refuse,
 * never pretend a text frame is a schema-id'd SBE payload.
 */
export const DEPTH_BINARY_UNAVAILABLE = 'depth.binary_unavailable' as const;

export type MarketDataFeedRefuseCode = typeof DEPTH_L3_UNAVAILABLE | typeof DEPTH_BINARY_UNAVAILABLE;

/** HTTP status for an explicit L3/binary subscribe the product does not publish. */
export const MARKET_DATA_FEED_REFUSE_HTTP = 409 as const;

const L3_TOKENS = new Set([
  'l3',
  'mbo',
  'market-by-order',
  'market_by_order',
  'order-by-order',
  'order_by_order',
  'orderbyorder',
  'queue',
  'queue-position',
  'queue_position',
  'queueposition',
  'fill-probability',
  'fill_probability',
  'fillprobability',
]);

const BINARY_TOKENS = new Set(['sbe', 'binary', 'sbe-like', 'sbe_like']);

function normToken(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function firstParam(params: URLSearchParams, keys: readonly string[]): string {
  for (const key of keys) {
    const value = normToken(params.get(key));
    if (value !== '') return value;
  }
  return '';
}

/**
 * Named refuse for L3/queue or binary/SBE asks. L3 wins when both are present
 * so a `channel=l3&format=sbe` client is not told "try JSON L3" next.
 */
export function marketDataFeedRefuse(params: URLSearchParams): MarketDataFeedRefuseCode | null {
  const channel = firstParam(params, ['channel']);
  const level = firstParam(params, ['level', 'book', 'dataLevel', 'data_level']);
  const format = firstParam(params, ['format', 'encoding', 'protocol', 'codec', 'schema']);

  if (L3_TOKENS.has(channel) || L3_TOKENS.has(level) || level === '3' || params.get('l3') === '1' || params.get('mbo') === '1') {
    return DEPTH_L3_UNAVAILABLE;
  }

  if (BINARY_TOKENS.has(channel) || BINARY_TOKENS.has(format) || params.get('sbe') === '1' || params.get('binary') === '1') {
    return DEPTH_BINARY_UNAVAILABLE;
  }

  return null;
}

export function marketDataFeedRefuseMessage(code: MarketDataFeedRefuseCode): string {
  if (code === DEPTH_L3_UNAVAILABLE) {
    return 'L3 / order-by-order / queue-position is not published; L2 depth is not L3';
  }
  return 'binary/SBE feed does not exist; JSON depth is not binary';
}

export function marketDataFeedRefusePayload(code: MarketDataFeedRefuseCode): {
  readonly type: 'status';
  readonly code: MarketDataFeedRefuseCode;
  readonly message: string;
} {
  return { type: 'status', code, message: marketDataFeedRefuseMessage(code) };
}

/** Upgrade-time refuse: JSON body with the named code, never an L2/JSON socket. */
export function writeMarketDataFeedRefuse(
  socket: { write(chunk: string): unknown; destroy(): void },
  code: MarketDataFeedRefuseCode,
): void {
  const body = JSON.stringify(marketDataFeedRefusePayload(code));
  socket.write(
    `HTTP/1.1 ${MARKET_DATA_FEED_REFUSE_HTTP} Conflict\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
  socket.destroy();
}

/**
 * Mirrors `private/hub.ts` — matching-down on the private orders stream.
 * Honest private name in the `*.engine_unavailable` family; not a blank blotter.
 */
export const ORDERS_ENGINE_UNAVAILABLE = 'orders.engine_unavailable' as const;

/** HTTP + WS refuse/close codes on the public depth door. */
export const GATEWAY_DEPTH_REFUSE_CODES = [
  'NoBook',
  'MarketNotFound',
  DEPTH_ENGINE_UNAVAILABLE,
  DEPTH_L3_UNAVAILABLE,
  DEPTH_BINARY_UNAVAILABLE,
  DEPTH_MARKET_HALTED,
  DEPTH_VENUE_HALTED,
  DEPTH_MARKET_PRELAUNCH,
  DEPTH_MARKET_EXPIRED,
  DEPTH_MARKET_DELISTED,
] as const;

/** Named unavailability on the authenticated private orders/fills stream. */
export const GATEWAY_PRIVATE_REFUSE_CODES = [
  ORDERS_ENGINE_UNAVAILABLE,
  ORDERS_MARKET_HALTED,
  ORDERS_VENUE_HALTED,
  ORDERS_MARKET_PRELAUNCH,
  ORDERS_MARKET_EXPIRED,
  ORDERS_MARKET_DELISTED,
] as const;

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
    noSynthesizeL3FromL2: true as const,
    noPretendJsonIsBinary: true as const,
    l3FeedPublished: false as const,
    binaryFeedPublished: false as const,
    noInventMid: true as const,
    noSeedFillsAsLiveTape: true as const,
    engineDownNamesUnavailable: true as const,
    matchingNotTradableNamed: true as const,
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

/** A resting ladder on the wire while matching refuses submits looks tradable. */
export function wouldInventTradableWhileMatchingClosed(hasRestingDepth: boolean, matchingNotTradable: boolean): boolean {
  return hasRestingDepth && matchingNotTradable;
}
