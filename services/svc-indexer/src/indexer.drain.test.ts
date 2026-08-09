import { describe, expect, it } from 'vitest';
import { MemoryChainSource } from './chain/memory-source.js';
import { MemoryProjectionStore } from './projection/memory-store.js';
import { Indexer } from './indexer.js';
import { CHAIN_ID } from './testing/conformance.js';

describe('Indexer · stopAndDrain', () => {
  it('is a no-op when nothing is running', async () => {
    const indexer = new Indexer({
      source: new MemoryChainSource(CHAIN_ID),
      store: new MemoryProjectionStore(CHAIN_ID),
      finalityDepth: 64,
      ingestEnabled: () => true,
    });
    await expect(indexer.stopAndDrain(1_000)).resolves.toBeUndefined();
  });

  it('drains a started poll loop before resolving', async () => {
    const source = new MemoryChainSource(CHAIN_ID);
    source.appendEmpty(20);
    const store = new MemoryProjectionStore(CHAIN_ID);
    const indexer = new Indexer({
      source,
      store,
      finalityDepth: 64,
      batchSize: 50,
      ingestEnabled: () => true,
      startHeight: 0,
    });
    indexer.start(60_000);
    // Drain must clear the timer and wait for the first tick's sync to finish.
    await expect(indexer.stopAndDrain(10_000)).resolves.toBeUndefined();
    // After drain, no more blocks should apply from the stopped timer.
    const headAfter = (await store.head())?.height ?? -1;
    await new Promise((r) => setTimeout(r, 50));
    expect((await store.head())?.height ?? -1).toBe(headAfter);
  });
});
