import { parseAmount } from '@intafaced/ledger-client';
import { describe, expect, it } from 'vitest';
import { CaptureLog } from './capture.js';
import {
  captureRecordFromTickFillWire,
  describeTickFillNormalisationPipeline,
  ingestTickFillWireRecord,
  ingestTickFillWireRecords,
} from './tick-fill-normalisation-pipeline.js';

describe('tick/fill normalisation pipeline', () => {
  it('describes honest normalisation without inventing quiet markets', () => {
    expect(describeTickFillNormalisationPipeline()).toEqual({
      normalisesFabricTicks: true,
      normalisesFabricFills: true,
      refusesUnconnected: true,
      usesLedgerAmountFormatting: true,
      neverInventsQuietMarket: true,
    });
  });

  it('normalises a connected tick wire row to measured decimal strings', () => {
    const record = captureRecordFromTickFillWire({
      kind: 'tick',
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      capturedAt: new Date('2026-08-22T10:00:00.000Z'),
      price: parseAmount('65000.5'),
      quantity: parseAmount('0.01'),
      ts: '2026-08-22T09:59:59.000Z',
    });
    expect(record).toMatchObject({
      status: 'measured',
      kind: 'tick',
      price: '65000.5',
      quantity: '0.01',
    });
  });

  it('normalises a connected fill wire row with sequence', () => {
    const record = captureRecordFromTickFillWire({
      kind: 'fill',
      venueId: 'bybit-spot',
      symbol: 'ETH/USDT',
      capturedAt: new Date('2026-08-22T10:00:01.000Z'),
      price: parseAmount('3200'),
      quantity: parseAmount('1.5'),
      ts: '2026-08-22T10:00:00.500Z',
      sequence: 42,
    });
    expect(record).toMatchObject({ status: 'measured', kind: 'fill', sequence: 42 });
  });

  it('maps fabric holes to absent ticks — never synthetic prints', () => {
    const record = captureRecordFromTickFillWire({
      kind: 'hole',
      venueId: 'okx-spot',
      symbol: 'BTC/USDT',
      capturedAt: new Date('2026-08-22T10:00:02.000Z'),
      reason: 'not_connected',
      detail: 'adapter offline',
    });
    expect(record).toMatchObject({ status: 'absent', kind: 'tick', reason: 'venue_not_connected' });
  });

  it('ingests tick and fill batches into CaptureLog', () => {
    const log = new CaptureLog();
    const rows = ingestTickFillWireRecords(log, [
      {
        kind: 'tick',
        venueId: 'binance-spot',
        symbol: 'BTC/USDT',
        capturedAt: new Date('2026-08-22T10:00:00.000Z'),
        price: parseAmount('1'),
        quantity: parseAmount('2'),
        ts: '2026-08-22T09:59:59.000Z',
      },
      {
        kind: 'fill',
        venueId: 'binance-spot',
        symbol: 'BTC/USDT',
        capturedAt: new Date('2026-08-22T10:00:01.000Z'),
        price: parseAmount('1'),
        quantity: parseAmount('2'),
        ts: '2026-08-22T10:00:00.000Z',
        sequence: 1,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(log.records()).toHaveLength(2);
    expect(
      ingestTickFillWireRecord(log, {
        kind: 'hole',
        venueId: 'binance-spot',
        symbol: 'BTC/USDT',
        capturedAt: new Date('2026-08-22T10:00:02.000Z'),
        reason: 'unreachable',
        detail: 'timeout',
      }),
    ).toMatchObject({ status: 'absent', reason: 'observation_missing' });
  });
});
