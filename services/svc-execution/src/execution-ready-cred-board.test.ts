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

describe('execution /ready boot credential board on ready (D48)', () => {
  it('index passes venueCredentialBoard into buildExecutionReadyResponse on /ready', () => {
    const src = indexSrc();
    expect(src).toContain('buildExecutionReadyResponse({');
    expect(src).toContain('venueCredentialBoard,');
  });
});

describe('execution /ready boot wired venue ids (D49)', () => {
  it('index wires trade, account, and market wired venue ids on /ready', () => {
    const src = indexSrc();
    expect(src).toContain('venueTradeWiredVenueIds: venueTradeMaps.wiredVenueIds');
    expect(src).toContain('venueAccountWiredVenueIds: venueAccountMaps.wiredVenueIds');
    expect(src).toContain('venueMarketWiredVenueIds: venueMarketMaps.wiredVenueIds');
  });
});

describe('execution /ready boot ems and trade url (D50)', () => {
  it('index passes emsAckCount and tradeUrl into buildExecutionReadyResponse on /ready', () => {
    const src = indexSrc();
    expect(src).toContain('emsStorePath,');
    expect(src).toContain('tradeUrl: env.TRADE_URL');
    expect(src).toContain('emsAckCount: emsStore.list().length');
  });
});

describe('execution /ready boot venue map builders (D51)', () => {
  it('index wires parseExecutionVenueIds and supplement map builders on boot', () => {
    const src = indexSrc();
    expect(src).toContain('parseExecutionVenueIds(env.EXECUTION_VENUE_IDS)');
    expect(src).toContain('buildExecutionVenueTradeMapsWithOperatorSupplement(executionVenueIds)');
    expect(src).toContain('buildExecutionVenueAccountMapsWithOperatorSupplement(executionVenueIds)');
    expect(src).toContain('buildExecutionVenueMarketMapsWithPublicMdSupplement(executionVenueIds)');
  });
});

describe('execution boot trade book snapshot wiring (D52)', () => {
  it('index wires buildTradeBookSnapshotMap into createExecutionRouter snapshotByVenue', () => {
    const src = indexSrc();
    expect(src).toContain('buildTradeBookSnapshotMap(env.TRADE_URL)');
    expect(src).toContain('snapshotByVenue = { ...venueMarketMaps.snapshotByVenue, ...tradeBookSnapshot }');
    expect(src).toContain('createExecutionRouter(');
    expect(src).toContain('snapshotByVenue,');
  });
});

describe('execution boot ems store wiring (D53)', () => {
  it('index wires FileEmsOrderStore or InMemoryEmsOrderStore into createExecutionRouter', () => {
    const src = indexSrc();
    expect(src).toContain('EXECUTION_EMS_STORE_PATH');
    expect(src).toContain('new FileEmsOrderStore(emsStorePath)');
    expect(src).toContain('new InMemoryEmsOrderStore()');
    expect(src).toContain('emsStore,');
    expect(src).toContain('emsAckCount: emsStore.list().length');
  });
});

describe('execution boot sealed registry wiring (D54)', () => {
  it('index wires SealedHouseTenantRegistry and public MD supplement into boot', () => {
    const src = indexSrc();
    expect(src).toContain('new SealedHouseTenantRegistry()');
    expect(src).toContain('createExecutionRouter(');
    expect(src).toContain('registry,');
    expect(src).toContain('buildExecutionVenueMarketMapsWithPublicMdSupplement(executionVenueIds)');
    expect(src).toContain('publicMdSupplementVenueIds: venueMarketMaps.publicMdSupplementVenueIds');
  });
});

describe('execution boot router venue maps wiring (D55)', () => {
  it('index passes trade, account, and market maps into createExecutionRouter', () => {
    const src = indexSrc();
    expect(src).toContain('venueTradeMaps.submitByVenue');
    expect(src).toContain('venueTradeMaps.cancelByVenue');
    expect(src).toContain('venueTradeMaps.fetchByVenue');
    expect(src).toContain('venueAccountMaps.balancesByVenue');
    expect(src).toContain('venueAccountMaps.positionsByVenue');
    expect(src).toContain('venueMarketMaps.fundingByVenue');
    expect(src).toContain('operatorAccountSupplementVenueIds: venueAccountMaps.operatorSupplementVenueIds');
  });
});

describe('execution boot trpc and edge context wiring (D57)', () => {
  it('index registers fastifyTRPCPlugin with appRouter, market maps, and createEdgeContext', () => {
    const src = indexSrc();
    expect(src).toContain('fastifyTRPCPlugin');
    expect(src).toContain('router: appRouter');
    expect(src).toContain('createEdgeContext(');
    expect(src).toContain('EDGE_PRINCIPAL_SECRET');
    expect(src).toContain('venueMarketMaps.borrowByVenue');
    expect(src).toContain('venueMarketMaps.latencyByVenue');
    expect(src).toContain('venueMarketMaps.marketsByVenue');
  });
});

describe('execution boot health and credential union (D59)', () => {
  it('index exposes /health and /ready and wires unionExecutionVenueIds into credential board', () => {
    const src = indexSrc();
    expect(src).toContain("app.get('/health'");
    expect(src).toContain("app.get('/ready'");
    expect(src).toContain('SERVICE_NAME');
    expect(src).toContain('unionExecutionVenueIds(executionVenueIds');
    expect(src).toContain('describeExecutionVenueCredentialBoard(');
    expect(src).toContain('venueCredentialBoard,');
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
