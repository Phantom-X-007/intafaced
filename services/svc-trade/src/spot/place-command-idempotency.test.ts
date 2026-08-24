import { describe, expect, it } from 'vitest';
import { assertSamePlaceCommand } from './trade-service.js';
import { TradeError, type OrderRecord, type PlaceOrderInput } from './types.js';

const input: PlaceOrderInput = {
  symbol: 'BTC/USDT',
  side: 'buy',
  type: 'limit',
  qty: 1_000_000_000_000_000_000n,
  price: 100_000_000_000_000_000_000n,
  tif: 'GTC',
  clientOrderId: 'stable-1',
  subAccountId: null,
};

function persisted(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    clientOrderId: 'stable-1',
    subAccountId: null,
    side: 'buy',
    type: 'limit',
    qty: input.qty,
    price: input.price,
    tif: 'GTC',
    seeded: false,
    replacementOf: null,
    replacementRequestHash: null,
    ...overrides,
  } as OrderRecord;
}

describe('place command idempotency fingerprint', () => {
  it('returns the persisted order for an exact retry', () => {
    const row = persisted();
    expect(assertSamePlaceCommand(row, input, 'limit', 'GTC', false)).toBe(row);
  });

  it.each([
    ['side', { side: 'sell' }],
    ['quantity', { qty: input.qty + 1n }],
    ['price', { price: (input.price ?? 0n) + 1n }],
    ['time in force', { tif: 'IOC' }],
    ['subaccount', { subAccountId: '22222222-2222-4222-8222-222222222222' }],
    ['seed origin', { seeded: true }],
    ['replacement origin', { replacementOf: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
  ] as const)('refuses reused identity with different %s', (_label, overrides) => {
    try {
      assertSamePlaceCommand(persisted(overrides), input, 'limit', 'GTC', false);
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(TradeError);
      expect((error as TradeError).code).toBe('trade.client_order_id_conflict');
    }
  });
});
