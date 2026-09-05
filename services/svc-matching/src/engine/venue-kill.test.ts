import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { installCodFence } from './cod-fence.js';
import { MatchingEngine } from './engine.js';
import { MemoryJournal, replay } from './journal.js';
import { MARKET_HALTED, MISSING_OPERATOR } from './halt.js';
import { VENUE_HALTED, replayVenueHalted } from './venue-kill.js';
import type { EngineOrder, OrderSide } from './types.js';

installCodFence();

/**
 * Operator halt of ALL markets. New submits refuse. One-market halt stays a different door.
 * Cancels stay. Resume-all is explicit. Dual-control confirm. No duration. Missing operator refuses.
 */

const MARKET = 'BTC/USDT';
const OTHER = 'ETH/USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const TAKER = '22222222-2222-4222-8222-222222222222';
const OTHER_REST = '33333333-3333-4333-8333-333333333333';
const AFTER = '44444444-4444-4444-8444-444444444444';

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
  };
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
  return { journal, bus, engine };
}

describe('operator halt of all markets', () => {
  it('refuses a new submit on every market and journals nothing for that submit', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    const halt = await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    expect(halt.accepted).toBe(true);
    expect(halt.halted).toBe(true);
    expect(halt.operatorId).toBe('ops-1');
    expect(engine.isVenueHalted).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(false);

    const before = journal.length;
    const result = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    const other = await engine.submit(OTHER, order({ id: OTHER_REST, side: 'sell', qty: '1', price: '200' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(VENUE_HALTED);
    expect(result.sequence).toBeNull();
    expect(result.fills).toEqual([]);
    expect(other.accepted).toBe(false);
    expect(other.rejected?.code).toBe(VENUE_HALTED);
    expect(journal.length).toBe(before);
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.orderId).toBe(REST);
  });

  it('is not one-market halt — resume of one market does not reopen submits', async () => {
    const { engine } = build();
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    const resumeOne = await engine.resume(MARKET, { operatorId: 'ops-2' });
    expect(resumeOne.accepted).toBe(true);
    expect(engine.isVenueHalted).toBe(true);

    const result = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(VENUE_HALTED);
  });

  it('still cancels while halted', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    const cancelled = await engine.cancel(MARKET, REST);

    expect(cancelled.cancelled).toBe(true);
    expect(engine.book(MARKET).toState().asks).toEqual([]);
  });

  it('resumes only after an explicit resume-all — halt-all never expires', async () => {
    const { engine } = build();
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);

    const resume = await engine.resumeAll({ operatorId: 'ops-2', confirmOperatorId: 'ops-3' });
    expect(resume.accepted).toBe(true);
    expect(resume.halted).toBe(false);
    expect(engine.isVenueHalted).toBe(false);

    const result = await engine.submit(MARKET, order({ id: AFTER, side: 'sell', qty: '1', price: '100' }));
    expect(result.accepted).toBe(true);
  });

  it('resume-all does not clear a one-market halt', async () => {
    const { engine } = build();
    await engine.halt(MARKET, { operatorId: 'ops-1' });
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    await engine.resumeAll({ operatorId: 'ops-2', confirmOperatorId: 'ops-3' });

    expect(engine.isVenueHalted).toBe(false);
    expect(engine.isHalted(MARKET)).toBe(true);

    const blocked = await engine.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(blocked.accepted).toBe(false);
    expect(blocked.rejected?.code).toBe(MARKET_HALTED);

    const other = await engine.submit(OTHER, order({ id: OTHER_REST, side: 'sell', qty: '1', price: '200' }));
    expect(other.accepted).toBe(true);
  });

  it('refuses halt-all and resume-all without an operator — does not invent a caller', async () => {
    const { journal, engine } = build();
    const halt = await engine.haltAll({});
    expect(halt.accepted).toBe(false);
    expect(halt.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isVenueHalted).toBe(false);
    expect(journal.length).toBe(0);

    const blank = await engine.haltAll({ operatorId: '   ' });
    expect(blank.accepted).toBe(false);
    expect(blank.rejected?.code).toBe(MISSING_OPERATOR);

    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    const resume = await engine.resumeAll({ operatorId: null });
    expect(resume.accepted).toBe(false);
    expect(resume.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isVenueHalted).toBe(true);
  });

  it('does not disable the engine — the process kill-switch is a different door', async () => {
    const { engine } = build();
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    expect(engine.isEnabled).toBe(true);
  });

  it('replays halt-all so a recovered engine still refuses submits', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();

    expect(recovered.isVenueHalted).toBe(true);
    expect(recovered.isHalted(MARKET)).toBe(false);
    expect(replayVenueHalted(journal.read())).toBe(true);
    expect(replay(journal.read()).has(MARKET)).toBe(true);

    const result = await recovered.submit(MARKET, order({ id: TAKER, side: 'buy', qty: '1', price: '100' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(VENUE_HALTED);
  });

  it('refuses amend on a venue-halted engine without journaling', async () => {
    const { journal, engine } = build();
    const rest = await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    expect(rest.accepted).toBe(true);
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    const before = journal.length;

    const amended = await engine.amend(MARKET, { orderId: REST, expectedVersion: 1, qty: parseAmount('2') });

    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(VENUE_HALTED);
    expect(journal.length).toBe(before);
  });

  it('replay of halt-all then resume-all leaves markets open', async () => {
    const { journal, engine } = build();
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    await engine.resumeAll({ operatorId: 'ops-2', confirmOperatorId: 'ops-3' });

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();
    expect(recovered.isVenueHalted).toBe(false);

    const result = await recovered.submit(MARKET, order({ id: AFTER, side: 'sell', qty: '1', price: '100' }));
    expect(result.accepted).toBe(true);
  });
});

describe('kill switch dual-control (M09-R09)', () => {
  it('refuses halt-all when confirmOperatorId is missing — no journal', async () => {
    const { journal, engine } = build();
    const halt = await engine.haltAll({ operatorId: 'ops-1' });
    expect(halt.accepted).toBe(false);
    expect(halt.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isVenueHalted).toBe(false);
    expect(journal.length).toBe(0);
  });

  it('refuses halt-all when confirmOperatorId is the same caller — no journal', async () => {
    const { journal, engine } = build();
    const halt = await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-1' });
    expect(halt.accepted).toBe(false);
    expect(halt.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isVenueHalted).toBe(false);
    expect(journal.length).toBe(0);
  });

  it('refuses resume-all when confirm is missing or the same — leaves the halt', async () => {
    const { journal, engine } = build();
    await engine.haltAll({ operatorId: 'ops-1', confirmOperatorId: 'ops-2' });
    const before = journal.length;

    const missing = await engine.resumeAll({ operatorId: 'ops-2' });
    expect(missing.accepted).toBe(false);
    expect(missing.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isVenueHalted).toBe(true);

    const same = await engine.resumeAll({ operatorId: 'ops-2', confirmOperatorId: 'ops-2' });
    expect(same.accepted).toBe(false);
    expect(engine.isVenueHalted).toBe(true);
    expect(journal.length).toBe(before);
  });
});
