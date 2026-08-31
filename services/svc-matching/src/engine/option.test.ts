import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { FileJournal, MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  EXPIRY_MISSING,
  STRIKE_MISSING,
  expiryRefuse,
  readExpiry,
  readStrike,
  strikeRefuse,
  wantsOption,
} from './option.js';

/**
 * Rest an option as a limit on the public book.
 * Refuse if strike or expiry is missing. No invented mark.
 */

const A = parseAmount;

const OPT = '11111111-1111-4111-8111-111111111111';
const MISS = '44444444-4444-4444-8444-444444444444';
const PLAIN = '55555555-5555-4555-8555-555555555555';
const EXPIRY = '2026-12-31T00:00:00.000Z';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  stopPx?: string | null;
  trail?: string | null;
  mark?: string | null;
  strike?: string | null;
  expiry?: string | null;
  tif?: TimeInForce;
}): EngineOrder {
  const type = spec.type ?? (spec.price !== undefined ? 'limit' : 'market');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: spec.stopPx === undefined || spec.stopPx == null ? null : A(spec.stopPx),
    tif: spec.tif ?? 'GTC',
    ...(spec.trail !== undefined ? { trail: spec.trail == null ? null : A(spec.trail) } : {}),
    ...(spec.mark !== undefined ? { mark: spec.mark == null ? null : A(spec.mark) } : {}),
    ...(spec.strike !== undefined ? { strike: spec.strike == null ? null : A(spec.strike) } : {}),
    ...(spec.expiry !== undefined ? { expiry: spec.expiry } : {}),
  };
}

describe('option — rest as a limit', () => {
  it('rests with strike+expiry+price on the public book', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );

    expect(result.accepted).toBe(true);
    expect(result.resting).toMatchObject({ kind: 'book', orderId: OPT });
    expect(result.fills).toHaveLength(0);
    expect(book.depth().bids).toEqual([['99', '2']]);
    expect(book.toState().stops).toHaveLength(0);
  });

  it('refuses a missing strike — no invented strike', () => {
    const book = new OrderBook('BTC/USDT');
    for (const strike of [null, '0'] as const) {
      const result = book.submit(
        order({ id: MISS, type: 'limit', side: 'buy', qty: '2', price: '99', strike, expiry: EXPIRY }),
      );
      expect(result.accepted).toBe(false);
      expect(result.rejected?.code).toBe(STRIKE_MISSING);
      expect(result.resting).toBeNull();
    }
    expect(book.depth().bids).toEqual([]);
  });

  it('refuses a missing expiry — no invented expiry', () => {
    const book = new OrderBook('BTC/USDT');
    for (const expiry of [null, '', '   '] as const) {
      const result = book.submit(
        order({ id: MISS, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry }),
      );
      expect(result.accepted).toBe(false);
      expect(result.rejected?.code).toBe(EXPIRY_MISSING);
      expect(result.resting).toBeNull();
    }
    expect(book.depth().bids).toEqual([]);
  });

  it('omitted mark is fine — do not require a mark', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    expect(result.accepted).toBe(true);
    expect(result.resting).toMatchObject({ kind: 'book', orderId: OPT });
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('missing price refuses invalid_price — do not substitute a mark', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(
      order({ id: MISS, type: 'limit', side: 'buy', qty: '2', strike: '100', expiry: EXPIRY }),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('invalid_price');
    expect(result.resting).toBeNull();
    expect(book.depth().bids).toEqual([]);
  });

  it('a plain limit without strike/expiry still rests', () => {
    const book = new OrderBook('BTC/USDT');
    const limit = book.submit(order({ id: PLAIN, type: 'limit', side: 'buy', qty: '2', price: '99' }));
    expect(limit.accepted).toBe(true);
    expect(limit.resting).toMatchObject({ kind: 'book', orderId: PLAIN });
    expect(book.depth().bids).toEqual([['99', '2']]);
    expect(wantsOption({ type: 'limit' })).toBe(false);
  });

  it('journal replay keeps strike/expiry and rests at the same price', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const opt = order({
      id: OPT,
      type: 'limit',
      side: 'buy',
      qty: '2',
      price: '99',
      strike: '100',
      expiry: EXPIRY,
    });
    const wire = toWire(opt);
    expect(wire.strike).toBe('100');
    expect(wire.expiry).toBe(EXPIRY);
    journal.append({ kind: 'submit', marketId, at: '2026-08-31T12:00:00.000Z', order: wire });
    live.submit(opt);
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(restored.depth().bids).toEqual([['99', '2']]);
  });

  it('journal replay still refuses a missing strike — crash cannot rest a refused option', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const bad = order({
      id: MISS,
      type: 'limit',
      side: 'buy',
      qty: '2',
      price: '99',
      strike: null,
      expiry: EXPIRY,
    });
    expect(toWire(bad).strike).toBeNull();
    expect(toWire(bad).expiry).toBe(EXPIRY);
    journal.append({ kind: 'submit', marketId, at: '2026-08-31T12:00:00.000Z', order: toWire(bad) });
    const result = live.submit(bad);
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(STRIKE_MISSING);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('FileJournal encode keeps a missing strike so a crash still refuses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-option-'));
    const path = join(dir, 'engine.ndjson');
    const journal = new FileJournal(path);
    const bad = order({
      id: MISS,
      type: 'limit',
      side: 'buy',
      qty: '2',
      price: '99',
      strike: null,
      expiry: EXPIRY,
    });
    journal.append({ kind: 'submit', marketId: 'BTC/USDT', at: '2026-08-31T12:00:00.000Z', order: toWire(bad) });
    journal.close();
    const raw = readFileSync(path, 'utf8');
    expect(raw).toContain('"strike":null');
    expect(raw).toContain(`"expiry":"${EXPIRY}"`);
    const restored = replay(new FileJournal(path).read()).get('BTC/USDT');
    expect(restored).toBeUndefined();
  });

  it('helpers refuse a missing strike or expiry and do not invent a mark', () => {
    expect(strikeRefuse(null)?.code).toBe(STRIKE_MISSING);
    expect(strikeRefuse(A('0'))?.code).toBe(STRIKE_MISSING);
    expect(strikeRefuse(A('100'))).toBeNull();
    expect(expiryRefuse(null)?.code).toBe(EXPIRY_MISSING);
    expect(expiryRefuse(readExpiry({ expiry: '' }))?.code).toBe(EXPIRY_MISSING);
    expect(expiryRefuse(EXPIRY)).toBeNull();
    expect(wantsOption({ type: 'option' })).toBe(true);
    expect(wantsOption({ strike: A('100') })).toBe(true);
    expect(wantsOption({ expiry: EXPIRY })).toBe(true);
    expect(wantsOption({ type: 'limit' })).toBe(false);
    expect(wantsOption({ type: 'stop' })).toBe(false);
    expect(formatAmount(readStrike({ strike: A('100') })!)).toBe('100');
    expect(readStrike({ strike: null })).toBeNull();
    expect(readExpiry({ expiry: EXPIRY })).toBe(EXPIRY);
    expect(readExpiry({ expiry: null })).toBeNull();
    expect(readExpiry({ expiry: '  ' })).toBeNull();
  });
});
