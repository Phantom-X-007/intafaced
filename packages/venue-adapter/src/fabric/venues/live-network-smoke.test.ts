/**
 * Live-network smoke — public market data only, no operator credentials.
 *
 * Runs in CI when VENUE_AGGREGATION_LIVE_NETWORK_CI=1 (see
 * .github/workflows/venue-aggregation-live-network.yml). Skipped locally by default.
 */
import { describe, expect, it } from 'vitest';
import { createVenueMarketDataAdapter, PUBLIC_MARKET_DATA_VENUE_IDS } from './factory.js';

const LIVE = process.env.VENUE_AGGREGATION_LIVE_NETWORK_CI === '1';

describe.skipIf(!LIVE)('venue.aggregation live network — public MD smoke', () => {
  for (const venueId of PUBLIC_MARKET_DATA_VENUE_IDS) {
    it(`${venueId}: snapshotBook returns measured depth for BTC/USDT`, async () => {
      const adapter = createVenueMarketDataAdapter(venueId);
      expect(adapter).not.toBeNull();
      const snapshot = await adapter!.snapshotBook('BTC/USDT', 5);
      expect(snapshot.venueId).toBe(venueId);
      expect(snapshot.bids.length + snapshot.asks.length).toBeGreaterThan(0);
    }, 30_000);
  }
});

describe('venue.aggregation live network — CI gate', () => {
  it('documents the env flag CI sets', () => {
    expect(process.env.VENUE_AGGREGATION_LIVE_NETWORK_CI ?? '').toMatch(/^(1|)$/);
  });
});
