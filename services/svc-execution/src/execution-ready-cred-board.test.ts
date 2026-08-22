import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeExecutionVenueCredentialBoard, unionExecutionVenueIds } from './venue-adapters.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, 'index.ts'), 'utf8');

describe('execution ready venue credential board (D33)', () => {
  it('/ready exposes venueCredentialBoard from describeExecutionVenueCredentialBoard', () => {
    const src = indexSrc();
    expect(src).toContain('describeExecutionVenueCredentialBoard(');
    expect(src).toContain('unionExecutionVenueIds(');
    expect(src).toContain('venueCredentialBoard');
  });

  it('describeExecutionVenueCredentialBoard never invents wired venues', () => {
    const board = describeExecutionVenueCredentialBoard(['binance-spot', 'bybit-spot'], {});
    expect(board.venues).toHaveLength(2);
    expect(board.wiredVenueIds).toEqual([]);
    expect(board.inventsCredentials).toBe(false);
  });

  it('describeExecutionVenueCredentialBoard reports operator fallback wiring', () => {
    const board = describeExecutionVenueCredentialBoard(['okx-spot'], {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    });
    expect(board.wiredVenueIds).toEqual(['okx-spot']);
    expect(board.venues[0]).toMatchObject({
      venueId: 'okx-spot',
      executionEnvWired: false,
      operatorEnvWired: true,
      wired: true,
    });
  });
});

describe('execution credential board supplement union (D36)', () => {
  it('unionExecutionVenueIds dedupes execution list and operator supplements', () => {
    expect(unionExecutionVenueIds(['binance-spot'], ['okx-spot'], ['binance-spot', 'bybit-spot'])).toEqual([
      'binance-spot',
      'okx-spot',
      'bybit-spot',
    ]);
  });

  it('credential board includes operator-only supplement venues', () => {
    const board = describeExecutionVenueCredentialBoard(unionExecutionVenueIds([], ['okx-spot']), {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    });
    expect(board.wiredVenueIds).toEqual(['okx-spot']);
    expect(board.venues[0]).toMatchObject({
      venueId: 'okx-spot',
      operatorEnvWired: true,
      wired: true,
    });
  });
});

describe('execution /ready boot supplement fields (D43)', () => {
  it('index wires account and public MD supplement venue ids on /ready', () => {
    const src = indexSrc();
    expect(src).toContain('buildExecutionVenueAccountMapsWithOperatorSupplement');
    expect(src).toContain('buildExecutionVenueMarketMapsWithPublicMdSupplement');
    expect(src).toContain('operatorAccountSupplementVenueIds: venueAccountMaps.operatorSupplementVenueIds');
    expect(src).toContain('publicMdSupplementVenueIds: venueMarketMaps.publicMdSupplementVenueIds');
  });
});
