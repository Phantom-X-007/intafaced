import { describe, expect, it } from 'vitest';
import type { CaptureRecord } from './capture.js';
import { lakeTickRowsFromCaptureRecords, persistCaptureRecordsToPostgres } from './postgres-persistence-sink.js';

const measuredBook: CaptureRecord = {
  status: 'measured',
  kind: 'book',
  occupancy: 'populated',
  venueId: 'binance-spot',
  marketId: 'BTC-USDT',
  capturedAt: '2026-08-16T12:00:00.000Z',
  sequence: 42,
  bids: [['100', '1']],
  asks: [['101', '1']],
};

const absentBook: CaptureRecord = {
  status: 'absent',
  reason: 'venue_not_connected',
  kind: 'book',
  venueId: 'binance-spot',
  marketId: 'BTC-USDT',
  capturedAt: '2026-08-16T12:00:01.000Z',
};

describe('lakeTickRowsFromCaptureRecords', () => {
  it('maps measured rows and skips absent holes', () => {
    expect(lakeTickRowsFromCaptureRecords([measuredBook, absentBook])).toEqual([
      {
        venueId: 'binance-spot',
        symbol: 'BTC-USDT',
        capturedAt: '2026-08-16T12:00:00.000Z',
        payload: measuredBook,
        seq: 42,
      },
    ]);
  });
});

const measuredFill: CaptureRecord = {
  status: 'measured',
  kind: 'fill',
  venueId: 'binance-spot',
  marketId: 'BTC-USDT',
  capturedAt: '2026-08-16T12:00:02.000Z',
  price: '100.5',
  quantity: '0.2',
  ts: '2026-08-16T12:00:02.000Z',
  sequence: 3,
};

const measuredBust: CaptureRecord = {
  status: 'measured',
  kind: 'bust',
  venueId: 'binance-spot',
  marketId: 'BTC-USDT',
  capturedAt: '2026-08-16T12:00:03.000Z',
  originalSequence: 3,
  sequence: 4,
  ts: '2026-08-16T12:00:03.000Z',
};

describe('persistCaptureRecordsToPostgres', () => {
  it('issues one INSERT per measured row through injectable client', async () => {
    const queries: Array<{ query: string; params?: readonly unknown[] }> = [];
    const written = await persistCaptureRecordsToPostgres([measuredBook, absentBook], {
      async unsafe(query, params) {
        queries.push({ query, params });
      },
    });
    expect(written).toBe(1);
    expect(queries[0]?.query).toContain('connect_lake.lake_ticks');
    expect(JSON.parse(String(queries[0]?.params?.[3]))).toMatchObject({ status: 'measured', kind: 'book' });
  });

  it('persists a later bust as a second INSERT and never rewrites the fill', async () => {
    const queries: Array<{ query: string; params?: readonly unknown[] }> = [];
    const written = await persistCaptureRecordsToPostgres([measuredFill, measuredBust], {
      async unsafe(query, params) {
        queries.push({ query, params });
      },
    });
    expect(written).toBe(2);
    expect(queries.every((q) => /INSERT/i.test(q.query))).toBe(true);
    expect(queries.some((q) => /UPDATE/i.test(q.query))).toBe(false);
    expect(JSON.parse(String(queries[0]?.params?.[3]))).toMatchObject({ kind: 'fill', sequence: 3, price: '100.5' });
    expect(JSON.parse(String(queries[1]?.params?.[3]))).toMatchObject({ kind: 'bust', originalSequence: 3, sequence: 4 });
    expect(queries[1]?.params?.[4]).toBe(4);
  });
});
