import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal, replay } from './journal.js';
import { AUCTION_UNSUPPORTED } from './auction.js';
import {
  AUCTION_STATE,
  UNCROSSING_UNSET,
  installAuctionUncross,
  uncrossingRulesUnset,
  type,
} from './auction-uncross.js';
import type { AuctionUncrossResult, EngineOrder, OrderSide } from './types.js';

installAuctionUncross();

/**
 * CARD D-auction hitch. Uncrossing rules unset: uncross / auction-state refuse.
 * Do not invent an uncross. Existing auction:true mill stays.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';
const MISS = '33333333-3333-4333-8333-333333333333';

type UncrossEngine = MatchingEngine & {
  uncross(marketId: string): Promise<AuctionUncrossResult>;
  enterAuction(marketId: string): Promise<AuctionUncrossResult>;
  leaveAuction(marketId: string): Promise<AuctionUncrossResult>;
  [typeof AUCTION_STATE]?: Set<string>;
};

function order(spec: {
  id: string;
  account?: string;
  side: OrderSide;
  qty: string;
  price: string;
  auction?: boolean;
}): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
    ...(spec.auction !== undefined ? { auction: spec.auction } : {}),
  };
}

function liveIds(engine: MatchingEngine, marketId: string): string[] {
  const book = engine.existingBook(marketId);
  if (!book) return [];
  const state = book.toState();
  return [
    ...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
  ];
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as UncrossEngine;
  return { journal, bus, engine };
}

describe('auction-uncross — refuse unset uncross, never invent a crossing', () => {
  it('uncross with rules unset is refused; book identical; no fills', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const beforeJournal = journal.length;
    const beforeBook = engine.book(MARKET).toState();

    const result = await engine.uncross(MARKET);

    expect(uncrossingRulesUnset()).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(UNCROSSING_UNSET);
    expect(result.rejected?.message).toBe('uncrossing rules are unset; the engine does not invent an uncross');
    expect(result.fills).toEqual([]);
    expect(engine.book(MARKET).toState()).toEqual(beforeBook);
    expect(liveIds(engine, MARKET)).toEqual([ASK]);
    expect(journal.length).toBe(beforeJournal);
    expect(journal.read().some((record) => record.kind === 'uncross')).toBe(false);
  });

  it('enterAuction / leaveAuction refuse while rules unset — auction cannot open', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const beforeJournal = journal.length;
    const beforeBook = engine.book(MARKET).toState();

    const entered = await engine.enterAuction(MARKET);
    expect(entered.accepted).toBe(false);
    expect(entered.rejected?.code).toBe(UNCROSSING_UNSET);
    expect(entered.fills).toEqual([]);

    const left = await engine.leaveAuction(MARKET);
    expect(left.accepted).toBe(false);
    expect(left.rejected?.code).toBe(UNCROSSING_UNSET);
    expect(left.fills).toEqual([]);

    expect(engine.book(MARKET).toState()).toEqual(beforeBook);
    expect(journal.length).toBe(beforeJournal);
  });

  it('auction:true order still refuses auction_unsupported — existing mill stays', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const result = await engine.submit(MARKET, order({ id: MISS, side: 'buy', qty: '10', price: '100', auction: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(AUCTION_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(engine, MARKET)).toEqual([ASK]);
  });

  it('journal does not grow a fake uncross record that would print fills on replay', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    await engine.uncross(MARKET);

    expect(journal.read().some((record) => record.kind === 'uncross')).toBe(false);
    expect(replay(journal.read()).get(MARKET)?.toState().asks[0]?.orders[0]?.orderId).toBe(ASK);
    expect(replay(journal.read()).get(MARKET)?.toState().lastTradePrice).toBeNull();

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();
    expect(liveIds(recovered, MARKET)).toEqual([ASK]);
    expect(recovered.book(MARKET).toState().lastTradePrice).toBeNull();
  });

  it('submit during marked auction state does not silently uncross', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    engine[AUCTION_STATE] = new Set([MARKET]);
    const beforeJournal = journal.length;
    const beforeBook = engine.book(MARKET).toState();

    const take = await engine.submit(MARKET, order({ id: TAKE, side: 'buy', qty: '2', price: '100' }));

    expect(take.accepted).toBe(false);
    expect(take.rejected?.code).toBe(UNCROSSING_UNSET);
    expect(take.fills).toEqual([]);
    expect(take.sequence).toBeNull();
    expect(engine.book(MARKET).toState()).toEqual(beforeBook);
    expect(liveIds(engine, MARKET)).toEqual([ASK]);
    expect(journal.length).toBe(beforeJournal);
  });
});
