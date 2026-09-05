/**
 * GET /ready must not sell constructed adapters / env keys / nonempty TRADE_URL as wired live venues.
 * createAdapter + keys is constructed. Env keys are configured. This process does not ping venues.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_TRADE_BOOK_UNPROBED,
  EXECUTION_VENUE_UNPROBED,
  buildExecutionReadyResponse,
  constructedVenueHonesty,
  tradeBookSnapshotHonesty,
} from './ready-response.js';
import { describeExecutionVenueCredentialBoard } from './venue-adapters.js';

const here = dirname(fileURLToPath(import.meta.url));

function readyPayload(over: Partial<Parameters<typeof buildExecutionReadyResponse>[0]> = {}) {
  return buildExecutionReadyResponse({
    emsStorePath: '',
    tradeUrl: '',
    venueTradeConstructedVenueIds: [],
    operatorSupplementVenueIds: [],
    operatorAccountSupplementVenueIds: [],
    publicMdSupplementVenueIds: [],
    venueCredentialBoard: describeExecutionVenueCredentialBoard([]),
    venueAccountConstructedVenueIds: [],
    venueMarketConstructedVenueIds: [],
    emsAckCount: 0,
    ...over,
  });
}

describe('execution /ready honesty — constructed is not wired', () => {
  it('constructed adapters are constructed + unprobed, never wired/live', () => {
    const body = readyPayload({
      venueTradeConstructedVenueIds: ['binance-spot'],
      venueAccountConstructedVenueIds: ['okx-spot'],
      venueMarketConstructedVenueIds: ['bybit-spot'],
      tradeUrl: 'http://trade.example',
    });
    expect(body.externalVenueTrade).toEqual({
      status: 'constructed',
      venueIds: ['binance-spot'],
      probe: 'unprobed',
      code: EXECUTION_VENUE_UNPROBED,
    });
    expect(body.externalVenueAccount).toEqual({
      status: 'constructed',
      venueIds: ['okx-spot'],
      probe: 'unprobed',
      code: EXECUTION_VENUE_UNPROBED,
    });
    expect(body.externalVenueMarketData).toEqual({
      status: 'constructed',
      venueIds: ['bybit-spot'],
      probe: 'unprobed',
      code: EXECUTION_VENUE_UNPROBED,
    });
    expect(body.tradeBookSnapshotVenue).toEqual({
      status: 'configured',
      venueId: 'intafaced-spot',
      probe: 'unprobed',
      code: EXECUTION_TRADE_BOOK_UNPROBED,
    });
    expect(JSON.stringify(body)).not.toMatch(/wired|live/i);
  });

  it('blank adapters and TRADE_URL are absent, still unprobed', () => {
    const body = readyPayload();
    expect(body.externalVenueTrade).toEqual(constructedVenueHonesty([]));
    expect(body.externalVenueTrade.status).toBe('absent');
    expect(body.tradeBookSnapshotVenue).toEqual(tradeBookSnapshotHonesty(''));
    expect(body.tradeBookSnapshotVenue.status).toBe('absent');
    expect(JSON.stringify(body)).not.toMatch(/wired|live/i);
  });

  it('credential board reports env keys as configured + unprobed, not wired', () => {
    const board = describeExecutionVenueCredentialBoard(['okx-spot'], {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    });
    expect(board.configuredVenueIds).toEqual(['okx-spot']);
    expect(board.venues[0]).toMatchObject({
      venueId: 'okx-spot',
      executionEnvConfigured: false,
      operatorEnvConfigured: true,
      configured: true,
      probe: 'unprobed',
      inventsCredentials: false,
    });
    const body = readyPayload({ venueCredentialBoard: board });
    expect(JSON.stringify(body)).not.toMatch(/wired|live/i);
    expect(JSON.stringify(board)).not.toMatch(/wired/);
  });

  it('ready-response.ts and /ready boot never stamp wired/live', () => {
    const readySrc = readFileSync(join(here, 'ready-response.ts'), 'utf8');
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(readySrc).not.toMatch(/wired|live/i);
    expect(readySrc).toContain('constructedVenueHonesty');
    expect(readySrc).toContain("probe: 'unprobed'");
    expect(indexSrc).toContain('venueTradeConstructedVenueIds: venueTradeMaps.wiredVenueIds');
    expect(indexSrc).toContain('venueAccountConstructedVenueIds: venueAccountMaps.wiredVenueIds');
    expect(indexSrc).toContain('venueMarketConstructedVenueIds: venueMarketMaps.wiredVenueIds');
    expect(indexSrc).not.toMatch(/venueTradeWiredVenueIds|venueAccountWiredVenueIds|venueMarketWiredVenueIds/);
  });
});
