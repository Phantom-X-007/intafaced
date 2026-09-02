import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder } from './types.js';
import { AMEND_FIELD_UNSUPPORTED, queuePriority, unsupportedAmendField } from './amend-priority.js';

/**
 * Native amend queue priority (PX-S03 §8.2).
 * Retained: qty-down at the same price, no execution-affecting change.
 * Lost: qty-up, price change, or any execution-affecting attribute.
 * Cancel/replace is never atomic amend. Unsupported fields refuse by field.
 */

const A = parseAmount;

function rest(id: string, qty: string, price: string): EngineOrder {
  return {
    orderId: id,
    accountId: 'desk',
    type: 'limit',
    side: 'buy',
    qty: A(qty),
    price: A(price),
    stopPrice: null,
    tif: 'GTC',
  };
}

describe('queuePriority — PX-S03 §8.2', () => {
  it('retains when remaining qty shrinks at the same price', () => {
    expect(queuePriority({ priceUnchanged: true, qtyReducedOrSame: true, executionAttributesUnchanged: true })).toBe('retained');
  });

  it('loses when qty increases', () => {
    expect(queuePriority({ priceUnchanged: true, qtyReducedOrSame: false, executionAttributesUnchanged: true })).toBe('lost');
  });

  it('loses when price changes', () => {
    expect(queuePriority({ priceUnchanged: false, qtyReducedOrSame: true, executionAttributesUnchanged: true })).toBe('lost');
  });

  it('loses when an execution-affecting attribute changes', () => {
    expect(queuePriority({ priceUnchanged: true, qtyReducedOrSame: true, executionAttributesUnchanged: false })).toBe('lost');
  });
});

describe('unsupportedAmendField', () => {
  it('allows native fields', () => {
    expect(unsupportedAmendField({ orderId: 'x', expectedVersion: 1, qty: A('1') })).toBeNull();
  });

  it('refuses replace — CANCEL_REPLACE is not atomic amend', () => {
    const refused = unsupportedAmendField({ orderId: 'x', expectedVersion: 1, qty: A('1'), replace: true });
    expect(refused?.code).toBe(AMEND_FIELD_UNSUPPORTED);
    expect(refused?.message).toContain('CANCEL_REPLACE');
  });

  it('refuses mark by field name', () => {
    const refused = unsupportedAmendField({ orderId: 'x', expectedVersion: 1, price: A('1'), mark: A('50') });
    expect(refused?.code).toBe(AMEND_FIELD_UNSUPPORTED);
    expect(refused?.message).toContain('mark');
  });
});

describe('OrderBook.amend — stated priority', () => {
  it('qty-down at the same price retains queue sequence', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(rest('first', '2', '100'));
    book.submit(rest('second', '1', '100'));
    const result = book.amend({ orderId: 'first', expectedVersion: 1, qty: A('1') });
    expect(result.accepted).toBe(true);
    expect(result.priority).toBe('retained');
    expect(result.sequence).toBe(1);
    const take = book.submit({
      orderId: 'taker',
      accountId: 'taker',
      type: 'limit',
      side: 'sell',
      qty: A('1'),
      price: A('100'),
      stopPrice: null,
      tif: 'GTC',
    });
    expect(take.fills[0]!.makerOrderId).toBe('first');
  });

  it('qty-up loses priority', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(rest('first', '1', '100'));
    book.submit(rest('second', '1', '100'));
    const result = book.amend({ orderId: 'first', expectedVersion: 1, qty: A('2') });
    expect(result.accepted).toBe(true);
    expect(result.priority).toBe('lost');
    const take = book.submit({
      orderId: 'taker',
      accountId: 'taker',
      type: 'limit',
      side: 'sell',
      qty: A('1'),
      price: A('100'),
      stopPrice: null,
      tif: 'GTC',
    });
    expect(take.fills[0]!.makerOrderId).toBe('second');
  });

  it('refuses replace on a rest — original stays, priority is not claimed', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(rest('keep', '2', '100'));
    const before = book.serialize();
    const result = book.amend({ orderId: 'keep', expectedVersion: 1, qty: A('1'), replace: true } as never);
    expect(result.accepted).toBe(false);
    expect(result.priority).toBeNull();
    expect(result.rejected?.code).toBe(AMEND_FIELD_UNSUPPORTED);
    expect(book.serialize()).toBe(before);
  });
});
