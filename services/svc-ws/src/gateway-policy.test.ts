import { describe, expect, it } from 'vitest';
import {
  DEPTH_ENGINE_UNAVAILABLE,
  DEPTH_L3_UNAVAILABLE,
  DEPTH_BINARY_UNAVAILABLE,
  COD_LEASE_RANGE_UNCONFIGURED,
  DROP_COPY_COMMON_UPSTREAM_FAILURE,
  DROP_COPY_GAP,
  DROP_COPY_RECOVERY_REQUIRED,
  GATEWAY_COD_REFUSE_CODES,
  GATEWAY_DEPTH_REFUSE_CODES,
  GATEWAY_DROP_COPY_REFUSE_CODES,
  GATEWAY_PRIVATE_REFUSE_CODES,
  ORDERS_ENGINE_UNAVAILABLE,
  allowsConnectDepthSnapshot,
  describeGatewayPolicy,
  marketDataFeedRefuse,
  wouldInventInitialEmptyLadder,
  wouldInventQuietMarketFromEngineDown,
  wouldInventTradableWhileMatchingClosed,
  DEPTH_MARKET_HALTED,
} from './gateway-policy.js';

const MARKET = 'BTC-USDT';

function emptySnapshot(marketId = MARKET) {
  return { type: 'snapshot' as const, marketId, sequence: 0, bids: [] as const, asks: [] as const };
}

function liveSnapshot(sequence: number, marketId = MARKET) {
  return {
    type: 'snapshot' as const,
    marketId,
    sequence,
    bids: [['100', '1']] as const,
    asks: [['101', '1']] as const,
  };
}

describe('describeGatewayPolicy', () => {
  it('states fan-out honesty without promising fake liquidity', () => {
    const p = describeGatewayPolicy();
    expect(p.emptyBookStaysEmpty).toBe(true);
    expect(p.emptyNotZeroOnWire).toBe(true);
    expect(p.noFakeDepth).toBe(true);
    expect(p.noSynthesizeL3FromL2).toBe(true);
    expect(p.noPretendJsonIsBinary).toBe(true);
    expect(p.l3FeedPublished).toBe(false);
    expect(p.binaryFeedPublished).toBe(false);
    expect(p.noInventMid).toBe(true);
    expect(p.noSeedFillsAsLiveTape).toBe(true);
    expect(p.engineDownNamesUnavailable).toBe(true);
    expect(p.matchingNotTradableNamed).toBe(true);
    expect(p.holeNotSyntheticEmptyBook).toBe(true);
    expect(p.refuseCodes).toEqual([...GATEWAY_DEPTH_REFUSE_CODES]);
    expect(p.refuseCodes).toContain(DEPTH_ENGINE_UNAVAILABLE);
    expect(p.refuseCodes).toContain(DEPTH_L3_UNAVAILABLE);
    expect(p.refuseCodes).toContain(DEPTH_BINARY_UNAVAILABLE);
    expect(p.refuseCodes).toContain(DEPTH_MARKET_HALTED);
    expect(p.privateRefuseCodes).toEqual([...GATEWAY_PRIVATE_REFUSE_CODES]);
    expect(p.privateRefuseCodes).toContain(ORDERS_ENGINE_UNAVAILABLE);
    expect(p.dropCopyIndependentOfTradingSession).toBe(true);
    expect(p.dropCopyReadOnly).toBe(true);
    expect(p.dropCopyReplayDurable).toBe(false);
    expect(p.dropCopyRefuseCodes).toEqual([...GATEWAY_DROP_COPY_REFUSE_CODES]);
    expect(p.dropCopyRefuseCodes).toEqual([DROP_COPY_RECOVERY_REQUIRED, DROP_COPY_COMMON_UPSTREAM_FAILURE, DROP_COPY_GAP]);
    expect(p.cancelOnDisconnectLease).toBe(true);
    expect(p.codClientClockIgnored).toBe(true);
    expect(p.codInventedMassSuccess).toBe(false);
    expect(p.codRefuseCodes).toEqual([...GATEWAY_COD_REFUSE_CODES]);
    expect(p.codRefuseCodes).toContain(COD_LEASE_RANGE_UNCONFIGURED);
    expect(p.inventsQuietMarket).toBe(false);
    expect(p.inventsFuturesPositions).toBe(false);
  });
});

describe('gateway policy enforcement', () => {
  it('allows connect snapshot only when resting depth exists or a prior book is being repaired', () => {
    expect(allowsConnectDepthSnapshot(true, false)).toBe(true);
    expect(allowsConnectDepthSnapshot(false, true)).toBe(true);
    expect(allowsConnectDepthSnapshot(false, false)).toBe(false);
  });

  it('detects initial priced empty ladders — empty book stays absent, not zero', () => {
    expect(wouldInventInitialEmptyLadder(emptySnapshot(), false)).toBe(true);
    expect(wouldInventInitialEmptyLadder(liveSnapshot(1), false)).toBe(false);
    expect(wouldInventInitialEmptyLadder(emptySnapshot(), true)).toBe(false);
  });

  it('detects engine-down masquerading as a quiet empty market', () => {
    expect(wouldInventQuietMarketFromEngineDown(true, false)).toBe(true);
    expect(wouldInventQuietMarketFromEngineDown(true, true)).toBe(false);
    expect(wouldInventQuietMarketFromEngineDown(false, false)).toBe(false);
  });

  it('detects a resting book on the wire while matching is not taking submits', () => {
    expect(wouldInventTradableWhileMatchingClosed(true, true)).toBe(true);
    expect(wouldInventTradableWhileMatchingClosed(true, false)).toBe(false);
    expect(wouldInventTradableWhileMatchingClosed(false, true)).toBe(false);
    expect(GATEWAY_DEPTH_REFUSE_CODES).toContain(DEPTH_MARKET_HALTED);
  });
});

describe('marketDataFeedRefuse', () => {
  function q(search: string): URLSearchParams {
    return new URLSearchParams(search);
  }

  it('leaves L2 depth and public trades alone', () => {
    expect(marketDataFeedRefuse(q(''))).toBeNull();
    expect(marketDataFeedRefuse(q('channel=depth'))).toBeNull();
    expect(marketDataFeedRefuse(q('channel=trades'))).toBeNull();
    expect(marketDataFeedRefuse(q('level=5'))).toBeNull();
    expect(marketDataFeedRefuse(q('level=20'))).toBeNull();
    expect(marketDataFeedRefuse(q('channel=orders'))).toBeNull();
  });

  it('names L3 / order-by-order / queue-position — never an L2 stand-in', () => {
    expect(marketDataFeedRefuse(q('channel=l3'))).toBe(DEPTH_L3_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('channel=order-by-order'))).toBe(DEPTH_L3_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('channel=queue-position'))).toBe(DEPTH_L3_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('level=3'))).toBe(DEPTH_L3_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('book=mbo'))).toBe(DEPTH_L3_UNAVAILABLE);
  });

  it('names binary/SBE — never JSON-as-binary', () => {
    expect(marketDataFeedRefuse(q('format=sbe'))).toBe(DEPTH_BINARY_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('encoding=binary'))).toBe(DEPTH_BINARY_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('channel=sbe'))).toBe(DEPTH_BINARY_UNAVAILABLE);
    expect(marketDataFeedRefuse(q('channel=depth&format=binary'))).toBe(DEPTH_BINARY_UNAVAILABLE);
  });

  it('prefers L3 when a client asks for both', () => {
    expect(marketDataFeedRefuse(q('channel=l3&format=sbe'))).toBe(DEPTH_L3_UNAVAILABLE);
  });
});
