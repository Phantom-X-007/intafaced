import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import { cancelIdsIndependently } from './mass-cancel.js';
import { installCodFence } from './cod-fence.js';
import { MISSING_OPERATOR } from './halt.js';
import { SESSION_GONE } from './session.js';
import { SPLIT_BRAIN } from './split-brain.js';
import type { EngineOrder, OrderSide, SplitBrainResult } from './types.js';

installCodFence();

/**
 * CARD D-cod hitch. Per-id mass-cancel / session-dead survive a throw.
 * Split-brain refuses submit. Dual-control haltAll. Cancels stay.
 */

const MARKET = 'BTC/USDT';
const OTHER = 'ETH/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const ASK2 = '22222222-2222-4222-8222-222222222222';
const OTHER_REST = '33333333-3333-4333-8333-333333333333';
const AFTER = '44444444-4444-4444-8444-444444444444';

type FenceEngine = MatchingEngine & {
  declareSplitBrain(cmd: { operatorId?: string | null; confirmOperatorId?: string | null }): Promise<SplitBrainResult>;
};

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string; sessionId?: string }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
    ...(spec.sessionId ? { sessionId: spec.sessionId } : {}),
  };
}

function liveIds(engine: MatchingEngine, marketId: string): string[] {
  const book = engine.existingBook(marketId);
  if (!book) return [];
  const state = book.toState();
  return [
    ...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.stops.map((s) => s.orderId),
  ].sort();
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as FenceEngine;
  return { journal, bus, engine };
}

describe('cancelIdsIndependently', () => {
  it('names the throw and still cancels the other id', () => {
    const cancelled: string[] = [];
    const result = cancelIdsIndependently(
      (orderId) => {
        if (orderId === ASK) throw new Error('boom');
        cancelled.push(orderId);
        return {
          cancellation: {
            orderId,
            accountId: 'desk',
            remainingQty: parseAmount('1'),
            sequence: 1,
            reason: 'requested',
          },
        };
      },
      [ASK, ASK2],
    );
    expect(cancelled).toEqual([ASK2]);
    expect(result.cancellations.map((c) => c.orderId)).toEqual([ASK2]);
    expect(result.failed).toEqual([{ orderId: ASK, reason: 'boom' }]);
  });
});

describe('mass-cancel partial failure', () => {
  it('cancels both lives when neither throw', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, side: 'sell', qty: '1', price: '100' }));
    await engine.submit(MARKET, order({ id: ASK2, side: 'sell', qty: '1', price: '101' }));
    const result = await engine.massCancel(MARKET, { accountId: 'desk' });
    expect(result.accepted).toBe(true);
    expect(result.cancellations.map((c) => c.orderId).sort()).toEqual([ASK, ASK2].sort());
    expect(result.failed ?? []).toEqual([]);
    expect(liveIds(engine, MARKET)).toEqual([]);
  });

  it('one cancel throw still cancels the other and names the failed id', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, side: 'sell', qty: '1', price: '100' }));
    await engine.submit(MARKET, order({ id: ASK2, side: 'sell', qty: '1', price: '101' }));
    const orig = engine.cancel.bind(engine);
    engine.cancel = (async (marketId, orderId) => {
      if (orderId === ASK) throw new Error('cancel boom');
      return orig(marketId, orderId);
    }) as typeof engine.cancel;

    const result = await engine.massCancel(MARKET, { accountId: 'desk' });
    expect(result.accepted).toBe(true);
    expect(result.cancellations.map((c) => c.orderId)).toEqual([ASK2]);
    expect(result.failed).toEqual([{ orderId: ASK, reason: 'cancel boom' }]);
    expect(liveIds(engine, MARKET)).toEqual([ASK]);
  });
});

describe('session-dead partial failure', () => {
  it('one book cancel throw still cancels the other market; session stays dead', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, side: 'sell', qty: '1', price: '100', sessionId: 'sess-1' }));
    await engine.submit(OTHER, order({ id: OTHER_REST, side: 'sell', qty: '2', price: '200', sessionId: 'sess-1' }));
    const book = engine.book(OTHER);
    const orig = book.cancel.bind(book);
    book.cancel = ((orderId: string, reason?: 'expired') => {
      if (orderId === OTHER_REST) throw new Error('book boom');
      return orig(orderId, reason);
    }) as typeof book.cancel;

    const dead = await engine.sessionDead({ sessionId: 'sess-1' });
    expect(dead.accepted).toBe(true);
    expect(dead.cancellations.map((c) => c.orderId)).toEqual([ASK]);
    expect(dead.failed?.some((row) => row.orderId === OTHER_REST)).toBe(true);
    expect(liveIds(engine, MARKET)).toEqual([]);
    expect(engine.isSessionDead('sess-1')).toBe(true);

    const blocked = await engine.submit(MARKET, order({ id: AFTER, side: 'buy', qty: '1', price: '99', sessionId: 'sess-1' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(SESSION_GONE);
  });
});

describe('split-brain', () => {
  it('two distinct operators declare; submit refused; cancel still works; missing confirm refuses', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, side: 'sell', qty: '1', price: '100' }));

    const missing = await engine.declareSplitBrain({ operatorId: 'ops-1' });
    expect(missing.accepted).toBe(false);
    expect(missing.rejected?.code).toBe(MISSING_OPERATOR);

    const declared = await engine.declareSplitBrain({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    expect(declared.accepted).toBe(true);
    expect(declared.splitBrain).toBe(true);

    const blocked = await engine.submit(MARKET, order({ id: AFTER, side: 'buy', qty: '1', price: '99' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(SPLIT_BRAIN);

    const cancelled = await engine.cancel(MARKET, ASK);
    expect(cancelled.cancelled).toBe(true);
    expect(liveIds(engine, MARKET)).toEqual([]);
  });
});

describe('haltAll dual-control', () => {
  it('without confirmOperatorId refuses; two distinct operators accepts', async () => {
    const { engine } = build();
    const missing = await engine.haltAll({ operatorId: 'ops-1' });
    expect(missing.accepted).toBe(false);
    expect(missing.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isVenueHalted).toBe(false);

    const halt = await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    expect(halt.accepted).toBe(true);
    expect(halt.halted).toBe(true);
    expect(engine.isVenueHalted).toBe(true);
  });
});

describe('one-market halt dual-control', () => {
  it('without confirmOperatorId refuses; two distinct operators accepts', async () => {
    const { engine } = build();
    const missing = await engine.halt(MARKET, { operatorId: 'ops-1' });
    expect(missing.accepted).toBe(false);
    expect(missing.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isHalted(MARKET)).toBe(false);

    const halt = await engine.halt(MARKET, { operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    expect(halt.accepted).toBe(true);
    expect(halt.halted).toBe(true);
    expect(halt.confirmOperatorId).toBe('ops-2');
    expect(engine.isHalted(MARKET)).toBe(true);
  });
});
