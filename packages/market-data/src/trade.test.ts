import { describe, expect, it } from 'vitest';
import { CaptureLog } from '@intafaced/connect-data-lake';
import {
  TRADE_PRINT_KINDS,
  TRADE_PRINT_KIND_UNKNOWN,
  TRADE_PRINT_PUBLIC_KEYS,
  ingestVenueFill,
  ingestVenueTick,
  isTradePrintKind,
  tradePrintFromFill,
  tradePrintKindFromFill,
  type TradePrint,
  type TradePrintKind,
} from './trade.js';

const FILL = {
  marketId: 'BTC-USDT',
  makerOrderId: '11111111-1111-1111-1111-111111111111',
  takerOrderId: '22222222-2222-2222-2222-222222222222',
  price: '30125.5',
  qty: '0.25',
  sequence: 812,
  ts: '2026-07-29T12:00:00.000Z',
};

describe('tradePrintFromFill', () => {
  it('maps a fill to a public trade print', () => {
    const print = tradePrintFromFill(FILL);

    expect(print).toEqual({
      type: 'trade',
      marketId: 'BTC-USDT',
      sequence: 812,
      price: '30125.5',
      quantity: '0.25',
      ts: '2026-07-29T12:00:00.000Z',
      kind: TRADE_PRINT_KIND_UNKNOWN,
    } satisfies TradePrint);
  });

  it('strips order ids — they must never reach the public wire', () => {
    const print = tradePrintFromFill(FILL);
    const keys = Object.keys(print).sort();

    expect(keys).toEqual([...TRADE_PRINT_PUBLIC_KEYS].sort());
    expect(JSON.stringify(print)).not.toContain(FILL.makerOrderId);
    expect(JSON.stringify(print)).not.toContain(FILL.takerOrderId);
    expect(JSON.stringify(print)).not.toContain('makerOrderId');
    expect(JSON.stringify(print)).not.toContain('takerOrderId');
  });

  it('refuses a JSON number where a price belongs', () => {
    expect(() => tradePrintFromFill({ ...FILL, price: 30125.5 as unknown as string })).toThrow(/decimal string/);
  });

  it('refuses a non-integer sequence', () => {
    expect(() => tradePrintFromFill({ ...FILL, sequence: 1.5 })).toThrow(/sequence/);
  });

  it('refuses an empty market id', () => {
    expect(() => tradePrintFromFill({ ...FILL, marketId: '' })).toThrow(/marketId/);
  });

  it('labels a missing kind as unknown — not a silent normal trade', () => {
    const print = tradePrintFromFill(FILL);
    expect(print.kind).toBe('unknown');
    expect(print.kind).toBe(TRADE_PRINT_KIND_UNKNOWN);
  });

  it('passes through an authoritative disclosure kind', () => {
    const kinds: readonly TradePrintKind[] = ['aggressor', 'liquidation', 'block', 'bust', 'correction', 'unknown'];
    expect(kinds).toEqual([...TRADE_PRINT_KINDS]);
    for (const kind of kinds) {
      expect(tradePrintFromFill({ ...FILL, kind }).kind).toBe(kind);
    }
  });

  it('maps garbage kind to unknown, never a guessed trade class', () => {
    expect(tradePrintFromFill({ ...FILL, kind: 'trade' }).kind).toBe('unknown');
    expect(tradePrintFromFill({ ...FILL, kind: 'buy' }).kind).toBe('unknown');
    expect(tradePrintFromFill({ ...FILL, kind: '' }).kind).toBe('unknown');
    expect(tradePrintFromFill({ ...FILL, kind: 1 }).kind).toBe('unknown');
    expect(tradePrintFromFill({ ...FILL, kind: null }).kind).toBe('unknown');
  });

  it('never infers kind from L2 price vs bid/ask', () => {
    const atAsk = tradePrintFromFill({ ...FILL, price: '30126.0' });
    const atBid = tradePrintFromFill({ ...FILL, price: '30125.0' });
    const mid = tradePrintFromFill({ ...FILL, price: '30125.5' });
    expect(atAsk.kind).toBe('unknown');
    expect(atBid.kind).toBe('unknown');
    expect(mid.kind).toBe('unknown');
    expect(tradePrintKindFromFill({ kind: undefined })).toBe('unknown');
    expect(isTradePrintKind('aggressor')).toBe(true);
    expect(isTradePrintKind('l2')).toBe(false);
    // One fill-shaped argument. No book/L2 overload.
    expect(tradePrintKindFromFill.length).toBe(1);
  });
});

describe('ingestVenueFill / ingestVenueTick — capture holes', () => {
  it('does not mint a print for an unconnected venue', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T13:10:00.000Z') });
    const result = ingestVenueFill(lake, {
      venueId: 'unwired-venue',
      connection: 'not_connected',
      fill: FILL,
    });
    expect(result.print).toBeNull();
    expect(result.record).toMatchObject({ status: 'absent', reason: 'venue_not_connected', kind: 'fill' });
  });

  it('writes a measured fill when connected', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T13:10:01.000Z') });
    const result = ingestVenueFill(lake, { venueId: 'binance-spot', connection: 'connected', fill: FILL });
    expect(result.print?.price).toBe('30125.5');
    expect(result.print?.kind).toBe('unknown');
    expect(result.record).toMatchObject({ status: 'measured', kind: 'fill' });
  });

  it('keeps an authoritative liquidation kind on ingest', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T13:10:01.500Z') });
    const result = ingestVenueFill(lake, {
      venueId: 'binance-spot',
      connection: 'connected',
      fill: { ...FILL, kind: 'liquidation' },
    });
    expect(result.print?.kind).toBe('liquidation');
  });

  it('writes an absent tick when the adapter returned null', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T13:10:02.000Z') });
    const record = ingestVenueTick(lake, {
      venueId: 'binance-spot',
      marketId: 'BTC-USDT',
      connection: 'connected',
      tick: null,
    });
    expect(record).toMatchObject({ status: 'absent', reason: 'adapter_no_connection', kind: 'tick' });
  });

  it('refuses JSON number price/quantity on a connected tick — not a measured print', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T13:10:03.000Z') });
    expect(() =>
      ingestVenueTick(lake, {
        venueId: 'binance-spot',
        marketId: 'BTC-USDT',
        connection: 'connected',
        tick: {
          price: 0.1 as unknown as string,
          quantity: 1 as unknown as string,
          ts: '2026-08-16T13:10:03.000Z',
        },
      }),
    ).toThrow(/decimal string/);
    expect(lake.records()).toEqual([]);
  });

  it('writes a measured tick when connected with decimal-string price and quantity', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T13:10:04.000Z') });
    const record = ingestVenueTick(lake, {
      venueId: 'binance-spot',
      marketId: 'BTC-USDT',
      connection: 'connected',
      tick: { price: '0.1', quantity: '1', ts: '2026-08-16T13:10:04.000Z' },
    });
    expect(record).toMatchObject({
      status: 'measured',
      kind: 'tick',
      price: '0.1',
      quantity: '1',
    });
  });
});
