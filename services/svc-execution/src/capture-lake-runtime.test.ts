import { parseAmount } from '@intafaced/ledger-client';
import { VenueUnavailableError, type VenueBookSnapshot } from '@intafaced/venue-contracts';
import { describe, expect, it } from 'vitest';
import { createCaptureLakeRuntime } from './capture-lake-runtime.js';
import type { OmsSnapshotFn } from './oms-market-snapshot.js';

const BOOK: VenueBookSnapshot = {
  venueId: 'binance-spot',
  symbol: 'BTC/USDT',
  sequence: 1,
  sequenced: true,
  observedAt: new Date('2026-08-24T00:00:00.000Z'),
  bids: [[parseAmount('50000'), parseAmount('10')]],
  asks: [[parseAmount('50001'), parseAmount('10')]],
};

describe('createCaptureLakeRuntime', () => {
  it('records books on snapshot and drains with no_tsdb when owner env unset', async () => {
    const runtime = createCaptureLakeRuntime({});
    const snapshot: OmsSnapshotFn = async () => BOOK;
    const wrapped = runtime.wrapSnapshotMap({ 'binance-spot': snapshot });
    await expect(wrapped['binance-spot']!('BTC/USDT')).resolves.toEqual(BOOK);
    const result = await runtime.drain();
    expect(result.persistence).toEqual({ ok: false, reason: 'no_tsdb' });
  });

  it('records holes when snapshot throws VenueUnavailableError', async () => {
    const runtime = createCaptureLakeRuntime({});
    const snapshot: OmsSnapshotFn = async () => {
      throw new VenueUnavailableError('binance-spot', 'no_depth', 'dust book');
    };
    const wrapped = runtime.wrapSnapshotMap({ 'binance-spot': snapshot });
    await expect(wrapped['binance-spot']!('BTC/USDT')).rejects.toMatchObject({ reason: 'no_depth' });
    const result = await runtime.drain();
    expect(result.persistence).toEqual({ ok: false, reason: 'no_tsdb' });
  });
});
