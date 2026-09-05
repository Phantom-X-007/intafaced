/**
 * Unit card — tRPC book/fills/stream window unset refuse (no invented 50/100)
 *
 * 1. Promise: omit depth/limit does not publish a 50-level book or 100 prints.
 *    Owner/query may pass 50/100 explicitly.
 * 2. Break: `.default(50)` / `.default(100)` and `input?.depth ?? 50` made
 *    omit look chosen (same class as matching L2 #4058 / trade REST #4060).
 * 3. Done bar: no `.default(50|100)` / `?? 50` in router; omit BAD_REQUEST
 *    typed; explicit 50/100 served; 0 / over-cap refuse; store not called.
 * 4. Class N
 * 5. Paths: router.ts book/fills/accountFills/stream, trpc-windows.ts
 * 6. RED: omit book returns a 50-level view
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEdgeContext } from '@intafaced/contracts';
import { MemoryChainSource } from './chain/memory-source.js';
import { Indexer } from './indexer.js';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { createIndexerRouter } from './router.js';
import { CHAIN_ID } from './testing/conformance.js';
import {
  INDEXER_BOOK_DEPTH_UNSET,
  INDEXER_FILLS_LIMIT_UNSET,
  INDEXER_STREAM_DEPTH_UNSET,
  isPublishedBookDepth,
  isPublishedFillsLimit,
} from './trpc-windows.js';
import { userCopy } from './user-copy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 'an-indexer-window-test-edge-secret-length';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-indexer' });
const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
const WIRED_VENUE = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function spyStore() {
  const store = new MemoryProjectionStore(CHAIN_ID);
  const bookSeen: number[] = [];
  const fillsSeen: number[] = [];
  const accountSeen: number[] = [];
  const origBook = store.book.bind(store);
  const origFills = store.recentFills.bind(store);
  const origAccount = store.fillsForAccount.bind(store);
  store.book = async (market, depth) => {
    bookSeen.push(depth);
    return origBook(market, depth);
  };
  store.recentFills = async (market, limit) => {
    fillsSeen.push(limit);
    return origFills(market, limit);
  };
  store.fillsForAccount = async (account, limit) => {
    accountSeen.push(limit);
    return origAccount(account, limit);
  };
  return { store, bookSeen, fillsSeen, accountSeen };
}

async function wiredCaller(store: MemoryProjectionStore) {
  const source = new MemoryChainSource(CHAIN_ID);
  source.append([
    { kind: 'book_level', logIndex: 0, market: 'IFC-USD', side: 'bid', price: '100', quantity: '5' },
    {
      kind: 'fill',
      logIndex: 1,
      market: 'IFC-USD',
      price: '100.5',
      quantity: '1',
      takerSide: 'buy',
      maker: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      taker: '0xBBbBbBBbbBbBbbBbbbbbBBbBbbbbBbBbBbbBBbB0',
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
    venue: WIRED_VENUE,
    rpcUrl: 'http://127.0.0.1:8545',
  }).createCaller(anonymous());
}

describe('tRPC window parse', () => {
  it('unset / 0 / over-cap / non-integer refuse — never invent 50/100', () => {
    expect(isPublishedBookDepth(undefined)).toBe(false);
    expect(isPublishedBookDepth(null)).toBe(false);
    expect(isPublishedBookDepth(0)).toBe(false);
    expect(isPublishedBookDepth(201)).toBe(false);
    expect(isPublishedBookDepth(50.5)).toBe(false);
    expect(isPublishedFillsLimit(undefined)).toBe(false);
    expect(isPublishedFillsLimit(0)).toBe(false);
    expect(isPublishedFillsLimit(501)).toBe(false);
    expect(isPublishedFillsLimit(100.5)).toBe(false);
  });

  it('owner-explicit 50 / 100 are published windows', () => {
    expect(isPublishedBookDepth(50)).toBe(true);
    expect(isPublishedBookDepth(1)).toBe(true);
    expect(isPublishedBookDepth(200)).toBe(true);
    expect(isPublishedFillsLimit(100)).toBe(true);
    expect(isPublishedFillsLimit(1)).toBe(true);
    expect(isPublishedFillsLimit(500)).toBe(true);
  });
});

describe('tRPC book/fills/stream refuse unpublished windows', () => {
  it('router.ts does not invent 50/100', () => {
    const src = readFileSync(join(HERE, 'router.ts'), 'utf8');
    expect(src).not.toMatch(/\.default\(50\)/);
    expect(src).not.toMatch(/\.default\(100\)/);
    expect(src).not.toMatch(/depth \?\? 50/);
    expect(src).not.toMatch(/limit \?\? 100/);
    expect(src).toMatch(/INDEXER_BOOK_DEPTH_UNSET/);
    expect(src).toMatch(/INDEXER_FILLS_LIMIT_UNSET/);
    expect(src).toMatch(/INDEXER_STREAM_DEPTH_UNSET/);
  });

  it('omit book depth refuses and does not call store.book', async () => {
    const { store, bookSeen } = spyStore();
    const caller = await wiredCaller(store);
    await expect(caller.book({ market: 'IFC-USD' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: userCopy(INDEXER_BOOK_DEPTH_UNSET),
    });
    for (const depth of [0, 201, 50.5]) {
      await expect(caller.book({ market: 'IFC-USD', depth })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: userCopy(INDEXER_BOOK_DEPTH_UNSET),
      });
    }
    expect(bookSeen).toEqual([]);
  });

  it('owner-explicit book depth 50 is published (not invented)', async () => {
    const { store, bookSeen } = spyStore();
    const caller = await wiredCaller(store);
    const view = await caller.book({ market: 'IFC-USD', depth: 50 });
    expect(view.bids).toEqual([['100', '5']]);
    expect(bookSeen).toEqual([50]);
  });

  it('omit fills/accountFills limit refuses and does not call the store', async () => {
    const { store, fillsSeen, accountSeen } = spyStore();
    const caller = await wiredCaller(store);
    await expect(caller.fills({ market: 'IFC-USD' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: userCopy(INDEXER_FILLS_LIMIT_UNSET),
    });
    await expect(caller.accountFills({ account: ACCOUNT })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: userCopy(INDEXER_FILLS_LIMIT_UNSET),
    });
    for (const limit of [0, 501, 100.5]) {
      await expect(caller.fills({ market: 'IFC-USD', limit })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: userCopy(INDEXER_FILLS_LIMIT_UNSET),
      });
    }
    expect(fillsSeen).toEqual([]);
    expect(accountSeen).toEqual([]);
  });

  it('owner-explicit fills limit 100 is published (not invented)', async () => {
    const { store, fillsSeen, accountSeen } = spyStore();
    const caller = await wiredCaller(store);
    const fills = await caller.fills({ market: 'IFC-USD', limit: 100 });
    const account = await caller.accountFills({ account: ACCOUNT, limit: 100 });
    expect(fills).toHaveLength(1);
    expect(account).toHaveLength(1);
    expect(fillsSeen).toEqual([100]);
    expect(accountSeen).toEqual([100]);
  });

  it('omit stream depth refuses before unwired (does not invent 50)', async () => {
    const store = new MemoryProjectionStore(CHAIN_ID);
    const source = new MemoryChainSource(CHAIN_ID);
    const indexer = new Indexer({ source, store, finalityDepth: 64, ingestEnabled: () => true, startHeight: 0 });
    const caller = createIndexerRouter({
      store,
      indexer,
      chainId: CHAIN_ID,
      finalityDepth: 64,
      ingestEnabled: () => true,
      chainSource: 'memory',
    }).createCaller(anonymous());
    await expect(caller.stream()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: userCopy(INDEXER_STREAM_DEPTH_UNSET),
    });
    await expect(caller.stream({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: userCopy(INDEXER_STREAM_DEPTH_UNSET),
    });
    await expect(caller.stream({ market: 'IFC-USD' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: userCopy(INDEXER_STREAM_DEPTH_UNSET),
    });
  });

  it('owner-explicit stream depth 50 is published when wired', async () => {
    const { store, bookSeen } = spyStore();
    const caller = await wiredCaller(store);
    const out = await caller.stream({ depth: 50 });
    expect(out.status).toBe('ok');
    expect(bookSeen).toEqual([50]);
  });
});
