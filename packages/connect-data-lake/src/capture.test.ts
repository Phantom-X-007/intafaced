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

  it('appends a correction as a new row and leaves the original fill unchanged', () => {
    let n = 0;
    const lake = new CaptureLog({
      now: () => new Date(Date.UTC(2026, 7, 16, 12, 0, 8 + n++)),
    });
    const original = lake.captureFill({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      fill: { price: '100.5', quantity: '0.2', ts: '2026-08-16T12:00:08.000Z', sequence: 3 },
    });
    const snapshot = structuredClone(original);
    const correction = lake.captureFillAmendment({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      amendment: 'correction',
      originalSequence: 3,
      sequence: 4,
      ts: '2026-08-16T12:00:09.000Z',
      price: '101.25',
      quantity: '0.15',
    });

    expect(lake.records()).toHaveLength(2);
    expect(lake.records()[0]).toBe(original);
    expect(original).toEqual(snapshot);
    expect(correction).toMatchObject({
      status: 'measured',
      kind: 'correction',
      originalSequence: 3,
      sequence: 4,
      price: '101.25',
      quantity: '0.15',
    });
  });

  it('appends a bust as a new row without inventing replacement amounts', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:10.000Z') });
    lake.captureFill({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      fill: { price: '100.5', quantity: '0.2', ts: '2026-08-16T12:00:10.000Z', sequence: 3 },
    });
    const bust = lake.captureFillAmendment({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      amendment: 'bust',
      originalSequence: 3,
      sequence: 5,
      ts: '2026-08-16T12:00:11.000Z',
      price: '0',
      quantity: '0',
    });
    expect(bust).toMatchObject({ status: 'measured', kind: 'bust', originalSequence: 3, sequence: 5 });
    expect(bust).not.toHaveProperty('price');
    expect(bust).not.toHaveProperty('quantity');
    expect(lake.records()[0]).toMatchObject({ kind: 'fill', price: '100.5', quantity: '0.2' });
  });

  it('writes absent for an unknown correction — never a synthetic fill', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:12.000Z') });
    const record = lake.captureFillAmendment({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'unknown',
      amendment: 'correction',
      originalSequence: 3,
      sequence: 6,
      ts: '2026-08-16T12:00:12.000Z',
      price: '99',
      quantity: '1',
    });
    expect(record).toMatchObject({ status: 'absent', reason: 'observation_missing', kind: 'correction' });
    expect(record).not.toHaveProperty('price');
  });

  it('refuses a connected correction with missing amounts instead of inventing a zero fill', () => {
    const lake = new CaptureLog({ now: () => new Date('2026-08-16T12:00:13.000Z') });
    const record = lake.captureFillAmendment({
      venueId: VENUE,
      marketId: MARKET,
      connection: 'connected',
      amendment: 'correction',
      originalSequence: 3,
      sequence: 7,
      ts: '2026-08-16T12:00:13.000Z',
    });
    expect(record).toMatchObject({ status: 'absent', reason: 'observation_missing', kind: 'correction' });
    expect(JSON.stringify(record)).not.toContain('"price":"0"');
  });
});
