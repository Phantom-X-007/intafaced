import { describe, expect, it } from 'vitest';
import { MemoryProjectionStore } from './memory-store.js';
import type { ChainBlock } from '../chain/source.js';

const CHAIN = 31337;
const H0 = '0x' + '11'.repeat(32);
const H1 = '0x' + '22'.repeat(32);
const H2 = '0x' + '33'.repeat(32);
const BAD = '0x' + '44'.repeat(32);

function blk(height: number, hash: string, parentHash: string): ChainBlock {
  return {
    chainId: CHAIN,
    height,
    hash,
    parentHash,
    timestamp: 1_700_000_000 + height,
    events: [],
  };
}

describe('MemoryProjectionStore · parent link is enforced', () => {
  it('refuses a child whose parentHash is not the canonical head', async () => {
    const store = new MemoryProjectionStore(CHAIN);
    await store.applyBlock(blk(0, H0, '0x' + '00'.repeat(32)));
    await store.applyBlock(blk(1, H1, H0));

    await expect(store.applyBlock(blk(2, H2, BAD))).rejects.toThrow(/parent_mismatch|parent_missing/);
    // Cursor unchanged — no silent partial write of the bad child.
    expect((await store.head())?.hash).toBe(H1);
  });

  it('refuses a height gap (H+2 while head is H)', async () => {
    const store = new MemoryProjectionStore(CHAIN);
    await store.applyBlock(blk(0, H0, '0x' + '00'.repeat(32)));
    await expect(store.applyBlock(blk(2, H2, H0))).rejects.toThrow(/height_gap/);
    expect((await store.head())?.height).toBe(0);
  });

  it('still accepts the honest linked next block', async () => {
    const store = new MemoryProjectionStore(CHAIN);
    await store.applyBlock(blk(0, H0, '0x' + '00'.repeat(32)));
    await store.applyBlock(blk(1, H1, H0));
    expect((await store.head())?.hash).toBe(H1);
  });

  /**
   * Forward gap is sealed; under-tip plant was not. With head at H and empty
   * heights below (startHeight path), a second writer could insert a fill at
   * height 0 while head() still reports the real tip — tape poison.
   */
  it('refuses planting a height below the current tip', async () => {
    const store = new MemoryProjectionStore(CHAIN);
    // Cold start at height 5 (empty under-tip is normal after startHeight).
    await store.applyBlock(blk(5, H0, '0x' + '00'.repeat(32)));
    await store.applyBlock(blk(6, H1, H0));

    await expect(store.applyBlock(blk(0, H2, '0x' + '00'.repeat(32)))).rejects.toThrow(/height_below_tip/);
    await expect(store.applyBlock(blk(2, BAD, H0))).rejects.toThrow(/height_below_tip/);
    expect((await store.head())?.hash).toBe(H1);
    expect(await store.blockAt(0)).toBeNull();
  });
});
