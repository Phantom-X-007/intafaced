import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { CaptureLog, bookLevelsFromCapture, isAbsentCapture, type CaptureRecord } from './capture.js';
import {
  absentReasonFromCaptureLakeHole,
  bookLevelsFromLakeRecord,
  captureRecordFromLakeRecord,
  ingestCaptureLakeRecord,
  ingestCaptureLakeRecords,
  isCaptureLakeHole,
  type CaptureLakeBookRecord,
  type CaptureLakeHoleRecord,
  type CaptureLakeRecord,
} from './capture-lake-consumer.js';

const VENUE = 'binance-spot';
const SYMBOL = 'BTC/USDT';
const MARKET = 'BTC-USDT';

function level(price: string, qty: string): readonly [bigint, bigint] {
  return [parseAmount(price), parseAmount(qty)] as const;
}

function hole(over: Partial<CaptureLakeHoleRecord> = {}): CaptureLakeHoleRecord {
  return {
    kind: 'hole',
    venueId: VENUE,
    symbol: SYMBOL,
    capturedAt: new Date('2026-08-16T12:00:00.000Z'),
    reason: 'not_connected',
    detail: `${VENUE}: no MarketDataAdapter — absent in capture, not an empty book`,
    ...over,
  };
}

function book(over: Partial<CaptureLakeBookRecord> = {}): CaptureLakeBookRecord {
  return {
    kind: 'book',
    venueId: VENUE,
    symbol: SYMBOL,
    capturedAt: new Date('2026-08-16T12:00:01.000Z'),
    snapshot: {
      venueId: VENUE,
      symbol: SYMBOL,
      bids: [level('30000', '1')],
      asks: [level('30002', '1')],
      sequence: 7,
      sequenced: true,
      observedAt: new Date('2026-08-16T11:59:59.000Z'),
    },
    ...over,
  };
}

describe('CaptureLake consumer — hole honesty (D-S-18 / connect.data-lake)', () => {
  it('maps not_connected hole to absent venue_not_connected, never empty book', () => {
    const record = captureRecordFromLakeRecord(hole(), { marketId: MARKET });

    expect(record).toEqual({
      status: 'absent',
      reason: 'venue_not_connected',
      kind: 'book',
      venueId: VENUE,
      marketId: MARKET,
      capturedAt: '2026-08-16T12:00:00.000Z',
    } satisfies CaptureRecord);
    expect(record).not.toHaveProperty('bids');
    expect(bookLevelsFromLakeRecord(hole(), { marketId: MARKET })).toBeNull();
  });

  it('never treats a hole as a quiet market even when detail mentions empty book', () => {
    const record = captureRecordFromLakeRecord(hole({ detail: 'would love to write bids: [] here but must not' }), { marketId: MARKET });

    expect(isAbsentCapture(record)).toBe(true);
    expect(JSON.stringify(record)).not.toContain('"bids":[]');
  });

  it('maps venue-unavailable holes to observation_missing, still not empty book', () => {
    for (const reason of ['unreachable', 'no_depth', 'capture_failed'] as const) {
      const lakeRecord = hole({
        reason,
        detail: reason,
        capturedAt: new Date('2026-08-16T12:00:02.000Z'),
      });
      const record = captureRecordFromLakeRecord(lakeRecord, { marketId: MARKET });
      expect(record).toMatchObject({ status: 'absent', reason: 'observation_missing', kind: 'book' });
      expect(bookLevelsFromLakeRecord(lakeRecord, { marketId: MARKET })).toBeNull();
      expect(absentReasonFromCaptureLakeHole(reason)).toBe('observation_missing');
    }
  });

  it('maps connected empty book to measured empty, not absent', () => {
    const lakeRecord = book({
      capturedAt: new Date('2026-08-16T12:00:03.000Z'),
      snapshot: {
        venueId: VENUE,
        symbol: SYMBOL,
        bids: [],
        asks: [],
        sequence: 9,
        sequenced: true,
        observedAt: new Date('2026-08-16T12:00:03.000Z'),
      },
    });
    const record = captureRecordFromLakeRecord(lakeRecord, { marketId: MARKET });

    expect(record).toMatchObject({
      status: 'measured',
      kind: 'book',
      occupancy: 'empty',
      bids: [],
      asks: [],
      sequence: 9,
    });
    expect(bookLevelsFromLakeRecord(lakeRecord, { marketId: MARKET })).toEqual({
      occupancy: 'empty',
      bids: [],
      asks: [],
    });
  });

  it('maps populated book with wire decimal levels', () => {
    const lakeRecord = book({
      capturedAt: new Date('2026-08-16T12:00:04.000Z'),
      snapshot: {
        venueId: VENUE,
        symbol: SYMBOL,
        bids: [level('100.5', '2')],
        asks: [level('101', '3')],
        sequence: 10,
        sequenced: true,
        observedAt: new Date('2026-08-16T12:00:04.000Z'),
      },
    });
    const record = captureRecordFromLakeRecord(lakeRecord, { marketId: MARKET });

    expect(record.status).toBe('measured');
    if (record.status !== 'measured' || record.kind !== 'book') return;
    expect(record.occupancy).toBe('populated');
    expect(record.bids).toEqual([['100.5', '2']]);
    expect(record.asks).toEqual([['101', '3']]);
  });

  it('ingests hole then quiet-market book into CaptureLog without inventing continuity', () => {
    const log = new CaptureLog({ now: () => new Date('2026-08-16T12:00:05.000Z') });
    const records: CaptureLakeRecord[] = [
      hole({ capturedAt: new Date('2026-08-16T12:00:05.000Z') }),
      book({
        capturedAt: new Date('2026-08-16T12:00:05.001Z'),
        snapshot: {
          venueId: VENUE,
          symbol: 'ETH/USDT',
          bids: [],
          asks: [],
          sequence: 1,
          sequenced: true,
          observedAt: new Date('2026-08-16T12:00:05.001Z'),
        },
        symbol: 'ETH/USDT',
      }),
    ];

    const written = ingestCaptureLakeRecords(log, records, { marketId: MARKET });
    expect(written).toHaveLength(2);
    expect(isAbsentCapture(written[0]!)).toBe(true);
    expect(written[1]).toMatchObject({ status: 'measured', occupancy: 'empty' });
    expect(log.absent()).toHaveLength(1);
    expect(bookLevelsFromCapture(written[0]!)).toBeNull();
  });

  it('ingestCaptureLakeRecord uses log clock for capturedAt on write', () => {
    const log = new CaptureLog({ now: () => new Date('2026-08-16T12:00:06.000Z') });
    const record = ingestCaptureLakeRecord(log, hole(), { marketId: MARKET });

    expect(record).toMatchObject({
      status: 'absent',
      reason: 'venue_not_connected',
      capturedAt: '2026-08-16T12:00:06.000Z',
    });
    expect(isCaptureLakeHole(hole())).toBe(true);
  });
});
