import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { MemoryChainSource, NullChainSource } from './chain/memory-source.js';
import { Indexer } from './indexer.js';
import { createIndexerRouter } from './router.js';
import { CHAIN_ID } from './testing/conformance.js';

/**
 * THE MOUNT BOUNDARY, for svc-indexer (docs/decisions/mount-boundary.md).
 *
 * The context comes from `createEdgeContext` over real headers, exactly as
 * `index.ts` builds it, rather than from a `Context` literal — a literal would
 * keep passing on a service that trusted an unsigned header, which is the bug
 * that decision exists to prevent.
 *
 * Be precise about what is defended here, because it is unusual: NOTHING in
 * this router is gated on a principal, and that is correct. Every fact served
 * is a copy of public chain state. What these tests assert is therefore the
 * §22 property itself — that an anonymous caller gets a real answer — plus the
 * two things that must hold anyway: a forged principal confers nothing (there
 * is nothing to confer), and a signed one is read without changing the answer.
 *
 * If a future edit adds a `scopedProcedure` to this router, the first test here
 * still passes and the reviewer should ask why the procedure exists. A read
 * model of public data that requires a login is a read model that has quietly
 * stopped being §22 infrastructure.
 */

const SECRET = 'an-indexer-mount-test-edge-secret-length';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-indexer' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: [],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

/** No credentials of any kind — a caller who simply found the port. */
const anonymous = (region = 'DE') => edgeContext({ headers: { 'x-intafaced-region': region }, id: 'req-anon' });

function signed(p: Principal = principal(), region = 'DE') {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET),
      'x-intafaced-region': region,
    },
    id: 'req-signed',
  });
}

function forged(p: Principal = principal()) {
  return edgeContext({
    headers: { 'x-intafaced-principal': encodePrincipal(p), 'x-intafaced-region': 'DE' },
    id: 'req-forged',
  });
}

async function seeded() {
  const store = new MemoryProjectionStore(CHAIN_ID);
  const source = new MemoryChainSource(CHAIN_ID);
  source.append([
    { kind: 'book_level', logIndex: 0, market: 'IFC-USD', side: 'bid', price: '100', quantity: '5' },
    { kind: 'book_level', logIndex: 1, market: 'IFC-USD', side: 'ask', price: '101', quantity: '2' },
    {
      kind: 'fill',
      logIndex: 2,
      market: 'IFC-USD',
      price: '100.5',
      quantity: '1.5',
      takerSide: 'buy',
      maker: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      taker: '0xBBbBbBBbbBbBbbBbbbbbBBbBbbbbBbBbBbbBBbB0',
    },
    {
      kind: 'position',
      logIndex: 3,
      market: 'IFC-USD',
      account: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      size: '-1.5',
      entryPrice: '100.5',
    },
  ]);

  const indexer = new Indexer({ source, store, finalityDepth: 64, ingestEnabled: () => true, startHeight: 0 });
  await indexer.sync();

  return createIndexerRouter({
    store,
    indexer,
    chainId: CHAIN_ID,
    finalityDepth: 64,
    ingestEnabled: () => true,
    chainSource: 'memory',
  });
}

describe('svc-indexer mount — §22 permissionless reads', () => {
  it('serves the book to a caller with no credentials at all', async () => {
    const router = await seeded();
    const view = await router.createCaller(anonymous()).book({ market: 'IFC-USD', depth: 10 });

    expect(view.bids).toEqual([['100', '5']]);
    expect(view.asks).toEqual([['101', '2']]);
    expect(view.asOfHeight).toBe(0);
  });

  it('serves fills and positions anonymously, with money as decimal strings', async () => {
    const caller = (await seeded()).createCaller(anonymous());

    const fills = await caller.fills({ market: 'IFC-USD', limit: 10 });
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ price: '100.5', quantity: '1.5', takerSide: 'buy' });
    // Strings, not numbers — a client that wants arithmetic parses them.
    expect(typeof fills[0]!.price).toBe('string');

    const positions = await caller.positions({ account: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(positions[0]).toMatchObject({ size: '-1.5', entryPrice: '100.5' });
  });

  it('answers identically for every region, because there is nothing to gate', async () => {
    const router = await seeded();
    for (const region of ['DE', 'US', 'GB', 'XX', 'IR']) {
      const view = await router.createCaller(anonymous(region)).book({ market: 'IFC-USD', depth: 10 });
      expect(view.bids).toEqual([['100', '5']]);
    }
  });

  it('a forged principal changes nothing, because it confers nothing', async () => {
    const ctx = forged(principal({ scopes: ['admin:treasury'], tier: 'full', mfa: true }));
    // The edge did not sign it, so it is anonymous — and the answer is the same
    // either way, because no procedure here reads a principal.
    expect(ctx.principal).toBeNull();

    const view = await (await seeded()).createCaller(ctx).book({ market: 'IFC-USD', depth: 10 });
    expect(view.bids).toEqual([['100', '5']]);
  });

  it('a signed principal is accepted and does not change the answer either', async () => {
    const ctx = signed();
    expect(ctx.principal).not.toBeNull();

    const view = await (await seeded()).createCaller(ctx).book({ market: 'IFC-USD', depth: 10 });
    expect(view.bids).toEqual([['100', '5']]);
  });
});

describe('svc-indexer mount — status is honest', () => {
  it('reports the null chain source and no head on a cold service', async () => {
    const store = new MemoryProjectionStore(CHAIN_ID);
    const indexer = new Indexer({
      source: new NullChainSource(CHAIN_ID),
      store,
      finalityDepth: 64,
      ingestEnabled: () => true,
    });
    const router = createIndexerRouter({
      store,
      indexer,
      chainId: CHAIN_ID,
      finalityDepth: 64,
      ingestEnabled: () => true,
      chainSource: 'null',
    });

    await expect(router.createCaller(anonymous()).status()).resolves.toMatchObject({
      chainSource: 'null',
      indexedHeight: null,
      finalizedHeight: null,
      halted: null,
    });
  });

  it('surfaces a halt, so a caller is told before it renders a price', async () => {
    const store = new MemoryProjectionStore(CHAIN_ID);
    const source = new MemoryChainSource(CHAIN_ID);
    for (let i = 0; i < 6; i++) source.append([]);

    const indexer = new Indexer({ source, store, finalityDepth: 1, ingestEnabled: () => true, startHeight: 0 });
    await indexer.sync();
    source.reorg(0, [[], [], []]);
    await expect(indexer.sync()).rejects.toThrow(/deeper than retained history/);

    const router = createIndexerRouter({
      store,
      indexer,
      chainId: CHAIN_ID,
      finalityDepth: 1,
      ingestEnabled: () => true,
      chainSource: 'memory',
    });

    const status = await router.createCaller(anonymous()).status();
    expect(status.halted).not.toBeNull();
    expect(status.halted!.reason).toMatch(/re-index/);
  });
});

describe('svc-indexer mount — health', () => {
  it('says it is non-custodial, to anyone', async () => {
    await expect((await seeded()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-indexer',
      chainId: CHAIN_ID,
      custodial: false,
      ingestEnabled: true,
    });
  });
});
