import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EVENT_CATALOG, engineFillIdSchema } from './catalog.js';
import { EventSchemaDriftError, EventValidationError, validatePayload } from './bus.js';

const FILL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function settled(extra: Record<string, unknown> = {}) {
  return {
    fillId: FILL_ID,
    orderId: ORDER_ID,
    userId: USER_ID,
    marketId: 'btc-usdt',
    side: 'buy' as const,
    liquidity: 'taker' as const,
    price: '64000',
    qty: '0.1',
    quoteAmount: '6400',
    feeAsset: 'USDT',
    feeAmount: '0.64',
    feeBps: 10,
    sequence: 41,
    ts: '2026-08-15T12:00:00.000Z',
    ...extra,
  };
}

describe('D26-P2-15 fillId engine SoT', () => {
  it('catalog fillSettled.fillId is the required engine UUID schema', () => {
    const shape = (EVENT_CATALOG.fillSettled.schema as z.ZodObject<z.ZodRawShape>).shape;
    expect(shape.fillId).toBe(engineFillIdSchema);
    expect(engineFillIdSchema.safeParse(undefined).success).toBe(false);
    expect(engineFillIdSchema.safeParse(FILL_ID).success).toBe(true);
  });

  it('accepts a fillSettled payload whose fillId is the engine UUID', () => {
    const payload = validatePayload('fillSettled', settled());
    expect(payload.fillId).toBe(FILL_ID);
    expect(payload.sequence).toBe(41);
  });

  it('refuses a missing fillId — sequence is not a substitute identity', () => {
    const { fillId: _dropped, ...without } = settled();
    expect(without).not.toHaveProperty('fillId');
    expect(without.sequence).toBe(41);
    expect(() => validatePayload('fillSettled', without)).toThrow(EventValidationError);
  });

  it.each([
    ['numeric sequence as fillId', 41],
    ['numeric string sequence as fillId', '41'],
    ['market:sequence derived id', 'btc-usdt:41'],
    ['opaque non-uuid string', 'fill-1'],
    ['empty string', ''],
  ])('refuses a second fill identity: %s', (_label, fillId) => {
    expect(engineFillIdSchema.safeParse(fillId).success).toBe(false);
    expect(() => validatePayload('fillSettled', settled({ fillId }))).toThrow(EventValidationError);
  });

  it('refuses an extra derived identity key rather than stripping it', () => {
    expect(() => validatePayload('fillSettled', settled({ derivedFillId: 'btc-usdt:41' }), 'svc-trade')).toThrow(EventSchemaDriftError);
  });

  it('orderFilled does not carry fillId — stuffing one is drift, not a second SoT', () => {
    const keys = Object.keys((EVENT_CATALOG.orderFilled.schema as z.ZodObject<z.ZodRawShape>).shape);
    expect(keys).not.toContain('fillId');
    expect(() =>
      validatePayload(
        'orderFilled',
        {
          marketId: 'btc-usdt',
          makerOrderId: ORDER_ID,
          takerOrderId: USER_ID,
          price: '64000',
          qty: '0.1',
          sequence: 41,
          ts: '2026-08-15T12:00:00.000Z',
          fillId: FILL_ID,
        },
        'svc-matching',
      ),
    ).toThrow(EventSchemaDriftError);
  });
});
