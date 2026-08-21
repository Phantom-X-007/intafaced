import { describe, expect, it } from 'vitest';
import { CaptureLog, bookLevelsFromCapture, classifyBookObservation, isAbsentCapture, type CaptureRecord } from './capture.js';

const VENUE = 'binance-spot';
const MARKET = 'BTC-USDT';

describe('CaptureLog — absent vs measured (D-S-18 / connect.data-lake)', () => {
  it('writes absent with venue_not_connected when the venue is unwired', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:00.000Z') });
    const record = lake.captureBook({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'not_connected',
      snapshot: { sequence: 1, bids: [], asks: [] },
    });

    expect(record).toEqual({
      status: 'absent',
      reason: 'venue_not_connected',
      kind: 'book',
      venueId: VENUE,
      marketId: MARKET,
      capturedAt: '2026-08-16T12:00:00.000Z',
    } satisfies CaptureRecord);
    expect(record).not.toHaveProperty('bids');
    expect(bookLevelsFromCapture(record)).toBeNull();
  });

  it('never treats an unconnected empty payload as a quiet market', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:01.000Z') });
    const record = lake.captureBook({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'not_connected',
      snapshot: { sequence: 0, bids: [], asks: [] },
    });

    expect(isAbsentCapture(record)).toBe(true);
    expect(JSON.stringify(record)).not.toContain('"bids":[]');
  });

  it('records a connected empty book as measured empty, not absent', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:02.000Z') });
    const record = lake.captureBook({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      snapshot: { sequence: 9, bids: [], asks: [] },
    });

    expect(record).toMatchObject({
      status: 'measured',
      kind: 'book',
      occupancy: 'empty',
      bids: [],
      asks: [],
      sequence: 9,
    });
    expect(bookLevelsFromCapture(record)).toEqual({ occupancy: 'empty', bids: [], asks: [] });
  });

  it('records a connected populated book as measured', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:03.000Z') });
    const record = lake.captureBook({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      snapshot: { sequence: 10, bids: [['100', '1']], asks: [['101', '2']] },
    });

    expect(record.status).toBe('measured');
    if (record.status !== 'measured' || record.kind !== 'book') return;
    expect(record.occupancy).toBe('populated');
    expect(record.bids).toEqual([['100', '1']]);
  });

  it('prefers absent when connection is unknown even if an empty snapshot is attached', () => {
    const classified = classifyBookObservation({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'unknown',
      snapshot: { sequence: 0, bids: [], asks: [] },
    });
    expect(classified).toEqual({ mode: 'absent', reason: 'observation_missing' });

    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:04.000Z') });
    const record = lake.captureBook({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'unknown',
      snapshot: { sequence: 0, bids: [], asks: [] },
    });
    expect(record).toMatchObject({ status: 'absent', reason: 'observation_missing' });
  });

  it('writes adapter_no_connection when connected but the adapter returned null', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:05.000Z') });
    const record = lake.captureBook({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      snapshot: null,
    });
    expect(record).toMatchObject({ status: 'absent', reason: 'adapter_no_connection', kind: 'book' });
  });

  it('captures ticks and fills as absent when the venue is not connected', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:06.000Z') });
    const tick = lake.captureTick({ venueId: VENUE, marketId: MARKET, connection: 'not_connected', tick: null });
    const fill = lake.captureFill({ venueId: VENUE, marketId: MARKET, connection: 'not_connected', fill: null });
    expect(tick).toMatchObject({ status: 'absent', reason: 'venue_not_connected', kind: 'tick' });
    expect(fill).toMatchObject({ status: 'absent', reason: 'venue_not_connected', kind: 'fill' });
  });

  it('captures a connected fill without inventing a book', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:07.000Z') });
    const record = lake.captureFill({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      fill: { price: '100.5', quantity: '0.2', ts: '2026-08-16T12:00:07.000Z', sequence: 3 },
    });
    expect(record).toMatchObject({ status: 'measured', kind: 'fill', price: '100.5', quantity: '0.2', sequence: 3 });
    expect(record).not.toHaveProperty('bids');
  });
});
