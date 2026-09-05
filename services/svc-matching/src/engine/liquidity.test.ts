import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import './l3-queue.js';
import {
  REBATE_PROGRAM_UNSET,
  REBATE_WASH,
  UNSOURCED_DEPTH,
  installLiquidity,
  payRebate,
  qualityTelemetry,
  rebateProgramUnset,
} from './liquidity.js';
import type { EngineOrder } from './types.js';

installLiquidity();

const MARKET = 'BTC-USDT';
const BUY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function engine(): MatchingEngine {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
}

function limitBuy(): EngineOrder {
  return {
    orderId: BUY,
    accountId: 'desk',
    type: 'limit',
    side: 'buy',
    qty: parseAmount('1'),
    price: parseAmount('100'),
    stopPrice: null,
    tif: 'GTC',
  };
}

type LiquidityHost = MatchingEngine & {
  sourcedDepth: (
    marketId: string,
    input?: { source?: string | null; external?: boolean | null; limit?: number | null },
  ) => {
    accepted: boolean;
    source: string | null;
    native: boolean;
    bids: readonly unknown[];
    rejected?: { code: string };
  };
  payRebate: (cmd: { makerAccountId?: string; takerAccountId?: string }) => { accepted: boolean; paid: null; rejected: { code: string } };
  qualityTelemetry: (marketId: string, samples?: number) => { provenLiquid: boolean; samples: number };
};

describe('liquidity — sourced depth, unset rebate, telemetry is not liquid', () => {
  it('native depth is sourced matching', async () => {
    const live = engine() as LiquidityHost;
    await live.submit(MARKET, limitBuy());
    const depth = live.sourcedDepth(MARKET, { limit: 50 });
    expect(depth.accepted).toBe(true);
    expect(depth.source).toBe('matching');
    expect(depth.native).toBe(true);
    expect(depth.bids.length).toBeGreaterThan(0);
    expect(typeof limitBuy().qty).toBe('bigint');
  });

  it('native depth without a limit refuses (no invent 50)', async () => {
    const live = engine() as LiquidityHost;
    await live.submit(MARKET, limitBuy());
    expect(() => live.sourcedDepth(MARKET)).toThrow(/refuse to invent 50/);
    expect(() => live.sourcedDepth(MARKET, { limit: null })).toThrow(/refuse to invent 50/);
  });

  it('external depth without a source refuses — no invented venue', () => {
    const live = engine() as LiquidityHost;
    const depth = live.sourcedDepth(MARKET, { external: true });
    expect(depth.accepted).toBe(false);
    expect(depth.source).toBeNull();
    expect(depth.native).toBe(false);
    expect(depth.rejected?.code).toBe(UNSOURCED_DEPTH);
  });

  it('external depth carries the visible source and is not native', () => {
    const live = engine() as LiquidityHost;
    const depth = live.sourcedDepth(MARKET, { external: true, source: 'venue.alpha' });
    expect(depth.accepted).toBe(true);
    expect(depth.source).toBe('venue.alpha');
    expect(depth.native).toBe(false);
    expect(depth.bids).toEqual([]);
  });

  it('unset rebate program does not pay — paid is null, never a zero rebate', () => {
    expect(rebateProgramUnset()).toBe(true);
    const paid = payRebate({ makerAccountId: 'mm', takerAccountId: 'desk' });
    expect(paid.accepted).toBe(false);
    expect(paid.paid).toBeNull();
    expect(paid.rejected.code).toBe(REBATE_PROGRAM_UNSET);
    expect(process.env.MATCHING_REBATE_PROGRAM).toBeUndefined();
  });

  it('same-account maker/taker is wash — not paid', () => {
    const live = engine() as LiquidityHost;
    const paid = live.payRebate({ makerAccountId: 'desk', takerAccountId: 'desk' });
    expect(paid.accepted).toBe(false);
    expect(paid.paid).toBeNull();
    expect(paid.rejected.code).toBe(REBATE_WASH);
  });

  it('quality telemetry may exist without proving liquid', () => {
    const live = engine() as LiquidityHost;
    const tel = live.qualityTelemetry(MARKET, 12);
    expect(tel.samples).toBe(12);
    expect(tel.provenLiquid).toBe(false);
    expect(qualityTelemetry(MARKET).provenLiquid).toBe(false);
  });
});
