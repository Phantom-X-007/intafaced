import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { BulkCommandResult, EngineOrder, OrderSide } from './types.js';
import {
  BULK_ATOMIC_PARTIAL,
  installBulkItems,
  type BulkAmendCommand,
  type BulkCancelCommand,
  type BulkPlaceCommand,
} from './bulk-items.js';

installBulkItems();

/**
 * CARD D-bulk hitch. Bulk place/amend/cancel is per-item.
 * Atomic vs non-atomic is stamped. Partial bulk cannot hide rejects.
 */

const MARKET = 'BTC/USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const GOOD = '22222222-2222-4222-8222-222222222222';
const MID = '33333333-3333-4333-8333-333333333333';
const TAIL = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const UNKNOWN = '77777777-7777-4777-8777-777777777777';

type BulkEngine = MatchingEngine & {
  bulkPlace(cmd: BulkPlaceCommand): Promise<BulkCommandResult>;
  bulkAmend(cmd: BulkAmendCommand): Promise<BulkCommandResult>;
  bulkCancel(cmd: BulkCancelCommand): Promise<BulkCommandResult>;
};

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string | null }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: spec.price === null ? null : parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
  };
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as BulkEngine;
  return { journal, bus, engine };
}

function liveIds(engine: MatchingEngine): string[] {
  return engine.restingOrders(MARKET).map((row) => row.orderId);
}

function statuses(result: BulkCommandResult): string[] {
  return result.results.map((row) => row.status);
}

describe('bulk items — per-item results, explicit atomic, commandId idempotency', () => {
  it('non-atomic mixed place: one rest + one refuse; results length 2; refuse visible; good rest still live', async () => {
    const { engine } = build();
    const result = await engine.bulkPlace({
      commandId: 'place-mixed',
      items: [
        { marketId: MARKET, order: order({ id: REST, side: 'sell', qty: '1', price: '100' }) },
        { marketId: MARKET, order: order({ id: GOOD, side: 'sell', qty: '1', price: null }) },
      ],
    });

    expect(result.atomic).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(statuses(result)).toEqual(['APPLIED', 'REFUSED']);
    expect(result.results[1]!.rejected?.code).toBe('missing_price');
    expect(liveIds(engine)).toEqual([REST]);
  });

  it('atomic true: one good + one refuse ⇒ neither rests; result.atomic === true', async () => {
    const { engine } = build();
    const result = await engine.bulkPlace({
      commandId: 'place-atomic',
      atomic: true,
      items: [
        { marketId: MARKET, order: order({ id: REST, side: 'sell', qty: '1', price: '100' }) },
        { marketId: MARKET, order: order({ id: GOOD, side: 'sell', qty: '1', price: null }) },
      ],
    });

    expect(result.atomic).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.some((row) => row.status === 'REFUSED')).toBe(true);
    expect(result.results[0]!.status).not.toBe('APPLIED');
    expect(result.results[0]!.rejected?.code).toBe(BULK_ATOMIC_PARTIAL);
    expect(result.results[1]!.rejected?.code).toBe('missing_price');
    expect(liveIds(engine)).toEqual([]);
  });

  it('atomic missing/false ⇒ result.atomic === false explicitly', async () => {
    const { engine } = build();
    const missing = await engine.bulkPlace({
      commandId: 'place-atomic-missing',
      items: [{ marketId: MARKET, order: order({ id: REST, side: 'sell', qty: '1', price: '100' }) }],
    });
    const explicitFalse = await engine.bulkPlace({
      commandId: 'place-atomic-false',
      atomic: false,
      items: [{ marketId: MARKET, order: order({ id: GOOD, side: 'sell', qty: '1', price: '101' }) }],
    });

    expect(missing.atomic).toBe(false);
    expect(explicitFalse.atomic).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(missing, 'atomic')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(explicitFalse, 'atomic')).toBe(true);
  });

  it('bulk amend: per-item APPLIED/REFUSED; refuse not hidden', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '2', price: '100' }));
    await engine.submit(MARKET, order({ id: OTHER, side: 'sell', qty: '2', price: '101' }));
    const version = engine.restingOrders(MARKET).find((row) => row.orderId === REST)!.version;

    const result = await engine.bulkAmend({
      commandId: 'amend-mixed',
      items: [
        { marketId: MARKET, amend: { orderId: REST, expectedVersion: version, qty: parseAmount('1') } },
        { marketId: MARKET, amend: { orderId: UNKNOWN, expectedVersion: 1, qty: parseAmount('1') } },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(statuses(result)).toEqual(['APPLIED', 'REFUSED']);
    expect(result.results[1]!.status).toBe('REFUSED');
    expect(result.results[1]!.rejected?.code).toBe('order_not_found');
    expect(liveIds(engine)).toContain(REST);
    expect(parseAmount(engine.restingOrders(MARKET).find((row) => row.orderId === REST)!.remaining)).toEqual(parseAmount('1'));
  });

  it('bulk cancel: per-item; unknown id is REFUSED not swallowed', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: REST, side: 'sell', qty: '1', price: '100' }));

    const result = await engine.bulkCancel({
      commandId: 'cancel-mixed',
      items: [
        { marketId: MARKET, orderId: REST },
        { marketId: MARKET, orderId: UNKNOWN },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(statuses(result)).toEqual(['APPLIED', 'REFUSED']);
    expect(result.results[1]!.rejected?.code).toBe('order_not_found');
    expect(liveIds(engine)).not.toContain(REST);
  });

  it('idempotent commandId: second identical bulkPlace returns same statuses without a second rest', async () => {
    const { journal, engine } = build();
    const cmd: BulkPlaceCommand = {
      commandId: 'place-once',
      items: [{ marketId: MARKET, order: order({ id: REST, side: 'sell', qty: '1', price: '100' }) }],
    };
    const first = await engine.bulkPlace(cmd);
    const submitsAfterFirst = journal.read().filter((record) => record.kind === 'submit').length;
    const second = await engine.bulkPlace(cmd);

    expect(statuses(first)).toEqual(['APPLIED']);
    expect(statuses(second)).toEqual(['APPLIED']);
    expect(second.results[0]!.status).toBe(first.results[0]!.status);
    expect(liveIds(engine).filter((id) => id === REST)).toHaveLength(1);
    expect(journal.read().filter((record) => record.kind === 'submit')).toHaveLength(submitsAfterFirst);
  });

  it('partial cannot hide: 3 items, middle refuses, statuses [APPLIED, REFUSED, APPLIED]', async () => {
    const { engine } = build();
    const result = await engine.bulkPlace({
      commandId: 'place-partial',
      items: [
        { marketId: MARKET, order: order({ id: REST, side: 'sell', qty: '1', price: '100' }) },
        { marketId: MARKET, order: order({ id: MID, side: 'sell', qty: '1', price: null }) },
        { marketId: MARKET, order: order({ id: TAIL, side: 'sell', qty: '1', price: '102' }) },
      ],
    });

    expect(result.results).toHaveLength(3);
    expect(statuses(result)).toEqual(['APPLIED', 'REFUSED', 'APPLIED']);
    expect(result.results[1]!.rejected?.code).toBe('missing_price');
    expect(liveIds(engine)).toEqual([REST, TAIL]);
  });
});
