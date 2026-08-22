import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { buildExecutionReadyResponse } from './ready-response.js';
import { describeExecutionVenueCredentialBoard, unionExecutionVenueIds } from './venue-adapters.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, 'index.ts'), 'utf8');

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

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

describe('execution /ready boot trade supplement fields (D45)', () => {
  it('index wires trade supplement venue ids on /ready', () => {
    const src = indexSrc();
    expect(src).toContain('buildExecutionVenueTradeMapsWithOperatorSupplement');
    expect(src).toContain('operatorSupplementVenueIds: venueTradeMaps.operatorSupplementVenueIds');
  });
});

describe('execution /ready boot credential board union (D47)', () => {
  it('index wires supplement union into describeExecutionVenueCredentialBoard', () => {
    const src = indexSrc();
    expect(src).toContain(
      'unionExecutionVenueIds(executionVenueIds, venueTradeMaps.operatorSupplementVenueIds, venueAccountMaps.operatorSupplementVenueIds)',
    );
    expect(src).toContain('venueCredentialBoard');
  });
});

describe('execution /ready credential board inject (D44)', () => {
  it('GET /ready exposes supplement-union credential board over HTTP', async () => {
    const env = {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    };
    const venueCredentialBoard = describeExecutionVenueCredentialBoard(unionExecutionVenueIds([], ['okx-spot']), env);
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeWiredVenueIds: [],
      operatorSupplementVenueIds: ['okx-spot'],
      operatorAccountSupplementVenueIds: ['okx-spot'],
      publicMdSupplementVenueIds: [],
      venueCredentialBoard,
      venueAccountWiredVenueIds: [],
      venueMarketWiredVenueIds: [],
      emsAckCount: emsStore.list().length,
    });

    const app = Fastify({ logger: false });
    app.get('/ready', async () => payload);
    await app.ready();
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      venueCredentialBoard: {
        wiredVenueIds: ['okx-spot'],
        inventsCredentials: false,
      },
    });
    expect(res.json().venueCredentialBoard.venues[0]).toMatchObject({
      venueId: 'okx-spot',
      operatorEnvWired: true,
      wired: true,
    });
  });
});
