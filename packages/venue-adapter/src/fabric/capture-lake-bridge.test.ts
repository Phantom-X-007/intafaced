import { describe, expect, it } from 'vitest';
import { CaptureLog } from '@intafaced/connect-data-lake';
import { parseAmount } from '@intafaced/ledger-client';
import { CaptureLake } from './capture-lake.js';
import { drainFabricCaptureLakeToLog, drainFabricCaptureLakeToPersistence, ingestFabricCaptureRecord } from './capture-lake-bridge.js';

describe('capture-lake-bridge — fabric → connect-data-lake', () => {
  it('not_connected hole stays absent — never bids: []', () => {
    const fabric = new CaptureLake({ now: () => new Date('2026-08-21T08:00:00.000Z') });
    fabric.recordHole('binance-spot', 'BTC/USDT', 'not_connected', 'no adapter');

    const log = new CaptureLog({ now: () => new Date('2026-08-21T08:00:01.000Z') });
    const rows = drainFabricCaptureLakeToLog(fabric, log);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('absent');
    expect(rows[0]).toMatchObject({ reason: 'venue_not_connected', kind: 'book' });
    expect(log.absent()).toHaveLength(1);
  });

  it('measured empty book is occupancy empty, not a hole', () => {
    const fabric = new CaptureLake({ now: () => new Date('2026-08-21T08:00:00.000Z') });
    fabric.recordBook({
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      bids: [],
      asks: [],
      sequence: 1,
      sequenced: true,
      observedAt: new Date('2026-08-21T07:59:00.000Z'),
    });

    const log = new CaptureLog({ now: () => new Date('2026-08-21T08:00:01.000Z') });
    const row = ingestFabricCaptureRecord(log, fabric.records()[0]!);

    expect(row).toMatchObject({ status: 'measured', kind: 'book', occupancy: 'empty' });
    if (row.status !== 'measured' || row.kind !== 'book') throw new Error('expected measured book');
    expect(row.bids).toEqual([]);
  });

  it('populated book preserves wire levels', () => {
    const fabric = new CaptureLake({ now: () => new Date('2026-08-21T08:00:00.000Z') });
    fabric.recordBook({
      venueId: 'bybit-spot',
      symbol: 'ETH/USDT',
      bids: [[parseAmount('100'), parseAmount('1')]],
      asks: [[parseAmount('101'), parseAmount('2')]],
      sequence: 42,
      sequenced: true,
      observedAt: new Date('2026-08-21T07:59:00.000Z'),
    });

    const log = new CaptureLog({ now: () => new Date('2026-08-21T08:00:01.000Z') });
    const row = ingestFabricCaptureRecord(log, fabric.records()[0]!);

    expect(row).toMatchObject({ status: 'measured', occupancy: 'populated', sequence: 42 });
    if (row.status !== 'measured' || row.kind !== 'book') throw new Error('expected measured book');
    expect(row.bids[0]).toEqual(['100', '1']);
    expect(row.asks[0]).toEqual(['101', '2']);
  });

  it('drainFabricCaptureLakeToPersistence stays captureLogOnly without owner retention', async () => {
    const fabric = new CaptureLake({ now: () => new Date('2026-08-21T08:00:00.000Z') });
    fabric.recordBook({
      venueId: 'okx-spot',
      symbol: 'BTC/USDT',
      bids: [[parseAmount('100'), parseAmount('1')]],
      asks: [[parseAmount('101'), parseAmount('2')]],
      sequence: 1,
      sequenced: true,
      observedAt: new Date('2026-08-21T07:59:00.000Z'),
    });
    const result = await drainFabricCaptureLakeToPersistence(fabric, {});
    expect(result.persistence).toEqual({ ok: false, reason: 'no_tsdb' });
  });
});
