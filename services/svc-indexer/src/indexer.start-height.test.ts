import { describe, expect, it } from 'vitest';
import { MemoryChainSource } from './chain/memory-source.js';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { Indexer } from './indexer.js';
import { CHAIN_ID } from './testing/conformance.js';

/**
 * Cold start must honour INDEXER_START_HEIGHT / deps.startHeight.
 * On L2s the first relevant block is not 0; starting at 0 against a chain that
 * only has history above N is a permanent empty projection that looks healthy.
 */
describe('Indexer · startHeight cold start', () => {
  it('begins projection at startHeight, not at genesis zero', async () => {
    const source = new MemoryChainSource(CHAIN_ID, 0);
    source.appendEmpty(10); // heights 0..9
    const store = new MemoryProjectionStore(CHAIN_ID);
    const indexer = new Indexer({
      source,
      store,
      finalityDepth: 64,
      batchSize: 1,
      ingestEnabled: () => true,
      startHeight: 5,
    });

    // First pass applies exactly the start block.
    const first = await indexer.sync();
    expect(first.blocksApplied).toBe(1);
    expect((await store.head())?.height).toBe(5);
    // Heights below the start were never projected (no head at 0..4).
    expect(await store.blockAt(0)).toBeNull();
    expect(await store.blockAt(4)).toBeNull();
    expect(await store.blockAt(5)).not.toBeNull();
  });

  it('catches up from a non-zero chain startHeight on MemoryChainSource', async () => {
    const START = 100;
    const source = new MemoryChainSource(CHAIN_ID, START);
    source.appendEmpty(4); // 100..103
    const store = new MemoryProjectionStore(CHAIN_ID);
    const indexer = new Indexer({
      source,
      store,
      finalityDepth: 64,
      batchSize: 50,
      ingestEnabled: () => true,
      startHeight: START,
    });

    const result = await indexer.sync();
    expect(result.blocksApplied).toBe(4);
    expect((await store.head())?.height).toBe(103);
  });
});

it('batchSize 1 applies one block per pass and reports not caught up until tip', async () => {
  const source = new MemoryChainSource(CHAIN_ID, 0);
  source.appendEmpty(3); // 0..2
  const store = new MemoryProjectionStore(CHAIN_ID);
  const indexer = new Indexer({
    source,
    store,
    finalityDepth: 64,
    batchSize: 1,
    ingestEnabled: () => true,
    startHeight: 0,
  });

  const a = await indexer.sync();
  expect(a.blocksApplied).toBe(1);
  expect(a.caughtUp).toBe(false);
  expect((await store.head())?.height).toBe(0);

  const b = await indexer.sync();
  expect(b.blocksApplied).toBe(1);
  expect((await store.head())?.height).toBe(1);

  await indexer.sync(); // height 2
  const done = await indexer.sync();
  expect(done.blocksApplied).toBe(0);
  expect(done.caughtUp).toBe(true);
  expect((await store.head())?.height).toBe(2);
});
