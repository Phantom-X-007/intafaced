import { describe, expect, it } from 'vitest';
import { createEdgeContext } from '@intafaced/contracts';
import { ChainUnavailableError } from './chain/evm/availability.js';
import type { ChainSource } from './chain/source.js';
import { Indexer } from './indexer.js';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { createIndexerRouter } from './router.js';
import { readinessOf } from './ready.js';

/**
 * D26-P1-I3 Done bar — Chain→Postgres honest halt/refuse; no fake books.
 *
 * Pins public-door behaviour: status/ready diagnose; book/fills refuse when
 * the projection is known wrong (deep halt) or the chain door is known broken.
 */

const CHAIN_ID = 31_337;
const EDGE_SECRET = 'a-indexer-d26-p1-i3-edge-secret-long-enough';

class UnreachableChainSource implements ChainSource {
  constructor(readonly chainId: number) {}
  async head(): Promise<never> {
    throw new ChainUnavailableError('indexer.chain_unreachable', 'D26-P1-I3 hermetic refuse');
  }
  async blockAt(_height: number): Promise<never> {
    throw new ChainUnavailableError('indexer.chain_unreachable', 'D26-P1-I3 hermetic refuse');
  }
}

function anonymous() {
  return createEdgeContext({ secret: EDGE_SECRET, serviceName: 'svc-indexer' })({
    headers: { 'x-intafaced-region': 'DE' },
    id: 'req-i3',
  });
}

describe('D26-P1-I3 indexer readmodels Done bar', () => {
  it('ready is 503 when halted even if the database is up', () => {
    const answer = readinessOf({ reason: 'deep reorg — re-index', at: new Date('2026-08-12T00:00:00.000Z') }, true);
    expect(answer.httpStatus).toBe(503);
    expect(answer.body.ready).toBe(false);
  });

  it('refuses book/fills when chain door is unreachable — status still names lastError', async () => {
    const store = new MemoryProjectionStore(CHAIN_ID);
    const indexer = new Indexer({
      source: new UnreachableChainSource(CHAIN_ID),
      store,
      finalityDepth: 64,
      ingestEnabled: () => true,
    });
    await expect(indexer.sync()).rejects.toMatchObject({ code: 'indexer.chain_unreachable' });

    const caller = createIndexerRouter({
      store,
      indexer,
      chainId: CHAIN_ID,
      finalityDepth: 64,
      ingestEnabled: () => true,
      chainSource: 'evm',
    }).createCaller(anonymous());

    await expect(caller.status()).resolves.toMatchObject({
      lastError: expect.objectContaining({ code: 'indexer.chain_unreachable' }),
      halted: null,
    });
    await expect(caller.health()).resolves.toMatchObject({ ok: true, custodial: false });
    await expect(caller.book({ market: 'IFC-USD' })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(caller.fills({ market: 'IFC-USD' })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(caller.markets()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
