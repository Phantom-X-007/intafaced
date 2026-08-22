import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { buildExecutionReadyResponse } from './ready-response.js';
import { describeExecutionVenueCredentialBoard } from './venue-adapters.js';

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
      venueTradeWiredVenueIds: [],
      operatorSupplementVenueIds: [],
      operatorAccountSupplementVenueIds: [],
      publicMdSupplementVenueIds: [],
      venueCredentialBoard: board,
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
      ready: true,
      stage: 'oms-ems',
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

describe('execution /ready supplement inject (D35)', () => {
  it('GET /ready exposes operator account and public MD supplement venue ids', async () => {
    const emsStore = new InMemoryEmsOrderStore();
    const payload = buildExecutionReadyResponse({
      emsStorePath: '',
      tradeUrl: '',
      venueTradeWiredVenueIds: [],
      operatorSupplementVenueIds: ['okx-spot'],
      operatorAccountSupplementVenueIds: ['okx-spot'],
      publicMdSupplementVenueIds: ['binance-spot', 'bybit-spot'],
      venueCredentialBoard: describeExecutionVenueCredentialBoard([]),
      venueAccountWiredVenueIds: ['okx-spot'],
      venueMarketWiredVenueIds: ['binance-spot', 'bybit-spot'],
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
      externalVenueAccount: ['okx-spot'],
      externalVenueMarketData: ['binance-spot', 'bybit-spot'],
    });
  });
});
