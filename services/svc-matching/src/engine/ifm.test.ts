import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { FileJournal, MemoryJournal, replay, type EngineJournal, type JournalCommand, type JournalRecord } from './journal.js';
import type { EngineOrder, OrderSide } from './types.js';
import { IN_FLIGHT, IN_FLIGHT_UNKNOWN, parseIfmQty, persistIfmQty, persistInFlight, readIfmQty, replayInFlight } from './ifm.js';

/**
 * In-flight mitigation: unconfirmed amend/cancel cannot rest a second live
 * order or emit a duplicate fill. Unknown outcome refuses mutation.
 * Replay does not invent a reconstructed book from the flag.
 */

const MARKET = 'BTC/USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';
const ASK = '33333333-3333-4333-8333-333333333333';

const A = parseAmount;

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: A(spec.qty),
    price: A(spec.price),
    stopPrice: null,
    tif: 'GTC',
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

function build(journal: EngineJournal = new MemoryJournal()) {
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
  return { journal, bus, engine };
}

/** Durable in_flight, then crash before the amend/cancel record. */
class BoomOnMutation implements EngineJournal {
  private readonly inner = new MemoryJournal();
  constructor(private readonly boomOn: 'amend' | 'cancel') {}
  append(command: JournalCommand): JournalRecord {
    if (command.kind === this.boomOn) throw new Error('crash before mutation');
    return this.inner.append(command);
  }
  read(): readonly JournalRecord[] {
    return this.inner.read();
  }
  get length(): number {
    return this.inner.length;
  }
  close(): void {}
}

describe('in-flight mitigation — no second live, no duplicate fill', () => {
  it('refuses a second live submit of the same orderId while cancel is in-flight', async () => {
    const journal = new BoomOnMutation('cancel');
    const { engine } = build(journal);
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    await expect(engine.cancel(MARKET, REST)).rejects.toThrow('crash before mutation');

    const second = await engine.submit(MARKET, order({ id: REST, account: 'other', side: 'sell', qty: '4', price: '99' }));
    expect(second.accepted).toBe(false);
    expect(second.rejected?.code).toBe(IN_FLIGHT);
    expect(second.fills).toEqual([]);
    expect(second.resting).toBeNull();
    expect(liveIds(engine, MARKET)).toEqual([REST]);
    expect(engine.book(MARKET).toState().asks[0]!.orders).toHaveLength(1);
  });

  it('refuses a second amend so a duplicate fill is not emitted', async () => {
    const journal = new BoomOnMutation('amend');
    const { engine, bus } = build(journal);
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    await engine.submit(MARKET, order({ id: REST, side: 'buy', qty: '1', price: '90' }));
    await expect(engine.amend(MARKET, { orderId: REST, expectedVersion: 1, price: A('100') })).rejects.toThrow('crash before mutation');

    const second = await engine.amend(MARKET, { orderId: REST, expectedVersion: 1, price: A('100') });
    expect(second.accepted).toBe(false);
    expect(second.rejected?.code).toBe(IN_FLIGHT);
    expect(second.fills).toEqual([]);
    expect(bus.emitted('orderFilled')).toHaveLength(0);
    expect(liveIds(engine, MARKET).sort()).toEqual([ASK, REST].sort());
  });

  it('refuses a second cancel while the first is unconfirmed', async () => {
    const journal = new BoomOnMutation('cancel');
    const { engine } = build(journal);
    await engine.submit(MARKET, order({ id: REST, side: 'buy', qty: '1', price: '100' }));
    await expect(engine.cancel(MARKET, REST)).rejects.toThrow('crash before mutation');

    const second = await engine.cancel(MARKET, REST);
    expect(second.cancelled).toBe(false);
    expect(second.rejected?.code).toBe(IN_FLIGHT);
    expect(second.cancellation).toBeNull();
    expect(liveIds(engine, MARKET)).toEqual([REST]);
  });

  it('unknown in-flight refuses further mutation and does not invent a reconstructed book', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-ifm-'));
    const path = join(dir, 'engine.ndjson');
    const j1 = new FileJournal(path);
    const { engine } = build(j1);
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '2', price: '100' }));
    j1.append({
      kind: 'in_flight',
      marketId: MARKET,
      at: '2026-09-01T00:00:00.000Z',
      orderId: REST,
      mutation: 'cancel',
      inFlight: true,
      qty: '2',
    });
    j1.close();

    const j2 = new FileJournal(path);
    const recovered = new MatchingEngine({ journal: j2, bus: new MemoryEventBus('svc-matching'), snapshotEvery: 0 });
    recovered.recover();

    expect(liveIds(recovered, MARKET)).toEqual([REST]);
    expect(replay(j2.read()).get(MARKET)?.toState().asks[0]!.orders).toHaveLength(1);

    const cancel = await recovered.cancel(MARKET, REST);
    expect(cancel.cancelled).toBe(false);
    expect(cancel.rejected?.code).toBe(IN_FLIGHT_UNKNOWN);

    const amend = await recovered.amend(MARKET, { orderId: REST, expectedVersion: 1, qty: A('1') });
    expect(amend.accepted).toBe(false);
    expect(amend.rejected?.code).toBe(IN_FLIGHT_UNKNOWN);
    expect(amend.fills).toEqual([]);

    const second = await recovered.submit(MARKET, order({ id: REST, account: 'other', side: 'sell', qty: '9', price: '50' }));
    expect(second.accepted).toBe(false);
    expect(second.rejected?.code).toBe(IN_FLIGHT_UNKNOWN);
    expect(second.fills).toEqual([]);
    expect(liveIds(recovered, MARKET)).toEqual([REST]);
    j2.close();
  });

  it('persists inFlight and decimal qty so a crash cannot rest a second live order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-ifm-'));
    const path = join(dir, 'engine.ndjson');
    const marketId = MARKET;
    const qty = formatAmount(A('1.5'));

    const j1 = new FileJournal(path);
    j1.append({
      kind: 'submit',
      marketId,
      at: '2026-09-01T00:00:00.000Z',
      order: {
        orderId: REST,
        accountId: 'desk',
        type: 'limit',
        side: 'sell',
        qty,
        price: '100',
        stopPrice: null,
        tif: 'GTC',
      },
    });
    j1.append({
      kind: 'in_flight',
      marketId,
      at: '2026-09-01T00:00:01.000Z',
      orderId: REST,
      mutation: 'amend',
      inFlight: true,
      qty,
    });
    j1.close();

    const onDisk = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { kind: string; inFlight?: boolean; qty?: string | null; orderId?: string });
    expect(onDisk[1]!.kind).toBe('in_flight');
    expect(onDisk[1]!.inFlight).toBe(true);
    expect(onDisk[1]!.qty).toBe('1.5');

    const j2 = new FileJournal(path);
    const books = replay(j2.read());
    expect(
      books
        .get(marketId)
        ?.toState()
        .asks[0]!.orders.map((o) => o.orderId),
    ).toEqual([REST]);
    expect(books.get(marketId)?.toState().asks[0]!.orders).toHaveLength(1);

    const marks = replayInFlight(j2.read());
    expect(marks.get(REST)?.status).toBe('unknown');
    expect(marks.get(REST)?.qty).toBe(A('1.5'));
    j2.close();
  });

  it('clears in-flight after a confirmed cancel so a later submit of that id can rest once', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));
    const cancelled = await engine.cancel(MARKET, REST);
    expect(cancelled.cancelled).toBe(true);

    const again = await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '101' }));
    expect(again.accepted).toBe(true);
    expect(again.rejected).toBeUndefined();
    expect(liveIds(engine, MARKET)).toEqual([REST]);
  });

  it('confirmed amend then take emits one fill, not a duplicate', async () => {
    const { engine, bus } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    await engine.submit(MARKET, order({ id: REST, side: 'buy', qty: '1', price: '90' }));
    const amended = await engine.amend(MARKET, { orderId: REST, expectedVersion: 1, price: A('100') });
    expect(amended.accepted).toBe(true);
    expect(amended.fills).toHaveLength(1);
    expect(formatAmount(amended.fills[0]!.qty)).toBe('1');
    expect(bus.emitted('orderFilled')).toHaveLength(1);

    const extra = await engine.submit(MARKET, order({ id: TAKE, side: 'buy', qty: '1', price: '100' }));
    expect(extra.fills).toEqual([]);
  });

  it('read helpers treat missing as not set; qty is ledger-client decimal', () => {
    expect(persistInFlight({})).toBe(false);
    expect(persistInFlight({ inFlight: false })).toBe(false);
    expect(persistInFlight({ inFlight: true })).toBe(true);
    expect(persistIfmQty({})).toBe(false);
    expect(persistIfmQty({ qty: null })).toBe(true);
    expect(readIfmQty(undefined)).toBeNull();
    expect(readIfmQty(null)).toBeNull();
    expect(readIfmQty(A('0'))).toBeNull();
    expect(readIfmQty(A('1.5'))).toBe(A('1.5'));
    expect(parseIfmQty(undefined)).toBeNull();
    expect(parseIfmQty(null)).toBeNull();
    expect(parseIfmQty('0')).toBeNull();
    expect(parseIfmQty('not-amount')).toBeNull();
    expect(parseIfmQty('1.5')).toBe(A('1.5'));
    expect(replayInFlight([]).size).toBe(0);
  });
});
