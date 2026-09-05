import { parseAmount } from '@intafaced/ledger-client/money';
import { VenueUnavailableError, type VenueBookSnapshot } from '@intafaced/venue-contracts';
import { describe, expect, it } from 'vitest';
import { assertTradeBookPayoutGradeBeforePlace } from './trade-payout-gate.js';
import type { HttpPort, HttpResponse } from './transport.js';

const THICK: VenueBookSnapshot = {
  venueId: 'binance-spot',
  symbol: 'BTC/USDT',
  sequence: 1,
  sequenced: true,
  observedAt: new Date('2026-08-24T00:00:00.000Z'),
  bids: [[parseAmount('50000'), parseAmount('10')]],
  asks: [[parseAmount('50001'), parseAmount('10')]],
};

const DUST: VenueBookSnapshot = {
  ...THICK,
  bids: [[parseAmount('50000'), parseAmount('0.000001')]],
  asks: [[parseAmount('50001'), parseAmount('0.000001')]],
};

class SnapshotHttp implements HttpPort {
  constructor(private readonly snapshot: VenueBookSnapshot) {}

  async get(): Promise<HttpResponse> {
    return {
      status: 200,
      body: {
        lastUpdateId: 1,
        bids: [['50000.00000000', '10.00000000']],
        asks: [['50001.00000000', '10.00000000']],
      },
      header: () => null,
    };
  }
}

describe('assertTradeBookPayoutGradeBeforePlace', () => {
  it('passes when snapshotBook returns a payout-grade book', async () => {
    await expect(
      assertTradeBookPayoutGradeBeforePlace('binance-spot', 'BTC/USDT', {
        http: new SnapshotHttp(THICK),
        clock: () => 1,
        limit: 5,
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses no_depth when best levels are below the absolute floor', async () => {
    class DustHttp extends SnapshotHttp {
      override async get(): Promise<HttpResponse> {
        return {
          status: 200,
          body: {
            lastUpdateId: 1,
            bids: [['50000.00000000', '0.00000100']],
            asks: [['50001.00000000', '0.00000100']],
          },
          header: () => null,
        };
      }
    }
    await expect(
      assertTradeBookPayoutGradeBeforePlace('binance-spot', 'BTC/USDT', {
        http: new DustHttp(DUST),
        clock: () => 1,
        limit: 5,
      }),
    ).rejects.toMatchObject({ reason: 'no_depth' });
  });

  it('refuses not_ready for unknown venue ids', async () => {
    await expect(assertTradeBookPayoutGradeBeforePlace('kraken-spot', 'BTC/USDT')).rejects.toMatchObject({
      reason: 'not_ready',
    });
    await expect(assertTradeBookPayoutGradeBeforePlace('kraken-spot', 'BTC/USDT')).rejects.toBeInstanceOf(VenueUnavailableError);
  });
});
