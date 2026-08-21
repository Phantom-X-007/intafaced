import { describe, expect, it } from 'vitest';
import {
  DEPTH_ENGINE_UNAVAILABLE,
  GATEWAY_DEPTH_REFUSE_CODES,
  allowsConnectDepthSnapshot,
  describeGatewayPolicy,
  wouldInventInitialEmptyLadder,
  wouldInventQuietMarketFromEngineDown,
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
    expect(p.noInventMid).toBe(true);
    expect(p.noSeedFillsAsLiveTape).toBe(true);
    expect(p.engineDownNamesUnavailable).toBe(true);
    expect(p.holeNotSyntheticEmptyBook).toBe(true);
    expect(p.refuseCodes).toEqual([...GATEWAY_DEPTH_REFUSE_CODES]);
    expect(p.refuseCodes).toContain(DEPTH_ENGINE_UNAVAILABLE);
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
});
