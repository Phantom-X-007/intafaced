import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { buildExecutionVenueAccountMapsWithOperatorSupplement } from './venue-account-adapters.js';
import { buildExecutionVenueMarketMapsWithPublicMdSupplement } from './venue-market-adapters.js';
import { buildExecutionReadyResponse } from './ready-response.js';
import {
  buildExecutionVenueTradeMapsWithOperatorSupplement,
  describeExecutionVenueCredentialBoard,
  unionExecutionVenueIds,
} from './venue-adapters.js';
import type { MarketDataAdapter } from '@intafaced/venue-contracts';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

describe('execution /ready inject (D34)', () => {
  it('GET /ready returns venueCredentialBoard over the wire', async () => {
    const board = describeExecutionVenueCredentialBoard(['okx-spot'], {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    });
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeConstructedVenueIds: [],
      operatorSupplementVenueIds: [],
      operatorAccountSupplementVenueIds: [],
      publicMdSupplementVenueIds: [],
      venueCredentialBoard: board,
      venueAccountConstructedVenueIds: [],
      venueMarketConstructedVenueIds: [],
      emsAckCount: emsStore.list().length,
    });

    const app = Fastify({ logger: false });
    app.get('/ready', async () => payload);
    await app.ready();
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ready: true,
      stage: 'oms-ems',
      venueCredentialBoard: {
        configuredVenueIds: ['okx-spot'],
        inventsCredentials: false,
      },
    });
    expect(res.json().venueCredentialBoard.venues[0]).toMatchObject({
      venueId: 'okx-spot',
      operatorEnvConfigured: true,
      configured: true,
    });
  });
});

describe('execution /ready supplement inject (D35)', () => {
  it('GET /ready exposes operator account and public MD supplement venue ids', async () => {
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeConstructedVenueIds: [],
      operatorSupplementVenueIds: ['okx-spot'],
      operatorAccountSupplementVenueIds: ['okx-spot'],
      publicMdSupplementVenueIds: ['binance-spot', 'bybit-spot'],
      venueCredentialBoard: describeExecutionVenueCredentialBoard([]),
      venueAccountConstructedVenueIds: ['okx-spot'],
      venueMarketConstructedVenueIds: ['binance-spot', 'bybit-spot'],
      emsAckCount: emsStore.list().length,
    });

    const app = Fastify({ logger: false });
    app.get('/ready', async () => payload);
    await app.ready();
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      operatorSupplementVenueIds: ['okx-spot'],
      operatorAccountSupplementVenueIds: ['okx-spot'],
      publicMdSupplementVenueIds: ['binance-spot', 'bybit-spot'],
      externalVenueAccount: { status: 'constructed', venueIds: ['okx-spot'], probe: 'unprobed' },
      externalVenueMarketData: { status: 'constructed', venueIds: ['binance-spot', 'bybit-spot'], probe: 'unprobed' },
    });
  });
});

describe('execution /ready trade supplement inject (D40)', () => {
  it('GET /ready wires operator trade supplement and credential board union over HTTP', async () => {
    const env = {
      VENUE_AGGREGATION_BINANCE_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_BINANCE_SPOT_API_SECRET: 's',
    };
    const tradeMaps = buildExecutionVenueTradeMapsWithOperatorSupplement([], { env });
    const accountMaps = buildExecutionVenueAccountMapsWithOperatorSupplement([], { env });
    const venueCredentialBoard = describeExecutionVenueCredentialBoard(
      unionExecutionVenueIds([], tradeMaps.operatorSupplementVenueIds, accountMaps.operatorSupplementVenueIds),
      env,
    );
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeConstructedVenueIds: tradeMaps.wiredVenueIds,
      operatorSupplementVenueIds: tradeMaps.operatorSupplementVenueIds,
      operatorAccountSupplementVenueIds: accountMaps.operatorSupplementVenueIds,
      publicMdSupplementVenueIds: [],
      venueCredentialBoard,
      venueAccountConstructedVenueIds: accountMaps.wiredVenueIds,
      venueMarketConstructedVenueIds: [],
      emsAckCount: emsStore.list().length,
    });

    const app = Fastify({ logger: false });
    app.get('/ready', async () => payload);
    await app.ready();
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      operatorSupplementVenueIds: ['binance-spot'],
      operatorAccountSupplementVenueIds: ['binance-spot'],
      externalVenueTrade: { status: 'constructed', venueIds: ['binance-spot'], probe: 'unprobed' },
      externalVenueAccount: { status: 'constructed', venueIds: ['binance-spot'], probe: 'unprobed' },
      venueCredentialBoard: {
        configuredVenueIds: ['binance-spot'],
        inventsCredentials: false,
      },
    });
    expect(tradeMaps.operatorSupplementVenueIds).toEqual(['binance-spot']);
    expect(Object.keys(tradeMaps.submitByVenue)).toContain('binance-spot');
  });
});

function fakeMd(id: string): MarketDataAdapter {
  return {
    venue: { id, displayName: id, kind: 'external-cex', sequencedDepth: true },
    markets: async () => [],
    snapshotBook: async (symbol) => ({
      venueId: id,
      symbol,
      bids: [],
      asks: [],
      sequenced: false,
      sequence: -1,
      observedAt: new Date('2026-08-22T00:00:00.000Z'),
    }),
    streamBook: async () => {
      throw new Error('stream unused');
    },
  };
}

describe('execution /ready public MD supplement inject (D41)', () => {
  it('GET /ready wires public MD supplement venues over HTTP', async () => {
    const marketMaps = buildExecutionVenueMarketMapsWithPublicMdSupplement([], {
      createAdapter: (id) => (id === 'binance-spot' || id === 'bybit-spot' ? fakeMd(id) : null),
    });
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeConstructedVenueIds: [],
      operatorSupplementVenueIds: [],
      operatorAccountSupplementVenueIds: [],
      publicMdSupplementVenueIds: marketMaps.publicMdSupplementVenueIds,
      venueCredentialBoard: describeExecutionVenueCredentialBoard([]),
      venueAccountConstructedVenueIds: [],
      venueMarketConstructedVenueIds: marketMaps.wiredVenueIds,
      emsAckCount: emsStore.list().length,
    });

    const app = Fastify({ logger: false });
    app.get('/ready', async () => payload);
    await app.ready();
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      publicMdSupplementVenueIds: ['binance-spot', 'bybit-spot'],
      externalVenueMarketData: { status: 'constructed', venueIds: ['binance-spot', 'bybit-spot'], probe: 'unprobed' },
    });
    expect(marketMaps.publicMdSupplementVenueIds).toEqual(['binance-spot', 'bybit-spot']);
    expect(marketMaps.snapshotByVenue['binance-spot']).toEqual(expect.any(Function));
  });
});

describe('execution /ready full supplement inject (D42)', () => {
  it('GET /ready wires trade, account, and public MD supplements with credential board union', async () => {
    const env = {
      VENUE_AGGREGATION_OKX_SPOT_API_KEY: 'k',
      VENUE_AGGREGATION_OKX_SPOT_API_SECRET: 's',
      VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE: 'p',
    };
    const tradeMaps = buildExecutionVenueTradeMapsWithOperatorSupplement([], { env });
    const accountMaps = buildExecutionVenueAccountMapsWithOperatorSupplement([], { env });
    const marketMaps = buildExecutionVenueMarketMapsWithPublicMdSupplement([], {
      createAdapter: (id) => (id === 'binance-spot' || id === 'bybit-spot' ? fakeMd(id) : null),
    });
    const venueCredentialBoard = describeExecutionVenueCredentialBoard(
      unionExecutionVenueIds([], tradeMaps.operatorSupplementVenueIds, accountMaps.operatorSupplementVenueIds),
      env,
    );
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeConstructedVenueIds: tradeMaps.wiredVenueIds,
      operatorSupplementVenueIds: tradeMaps.operatorSupplementVenueIds,
      operatorAccountSupplementVenueIds: accountMaps.operatorSupplementVenueIds,
      publicMdSupplementVenueIds: marketMaps.publicMdSupplementVenueIds,
      venueCredentialBoard,
      venueAccountConstructedVenueIds: accountMaps.wiredVenueIds,
      venueMarketConstructedVenueIds: marketMaps.wiredVenueIds,
      emsAckCount: emsStore.list().length,
    });

    const app = Fastify({ logger: false });
    app.get('/ready', async () => payload);
    await app.ready();
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      operatorSupplementVenueIds: ['okx-spot'],
      operatorAccountSupplementVenueIds: ['okx-spot'],
      publicMdSupplementVenueIds: ['binance-spot', 'bybit-spot'],
      externalVenueTrade: { status: 'constructed', venueIds: ['okx-spot'], probe: 'unprobed' },
      externalVenueAccount: { status: 'constructed', venueIds: ['okx-spot'], probe: 'unprobed' },
      externalVenueMarketData: { status: 'constructed', venueIds: ['binance-spot', 'bybit-spot'], probe: 'unprobed' },
      venueCredentialBoard: {
        configuredVenueIds: ['okx-spot'],
        inventsCredentials: false,
      },
    });
  });
});
