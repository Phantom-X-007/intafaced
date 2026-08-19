/**
 * S-C2 — venue event surface under a real tip replace.
 *
 * Indexer `reorg.live.test.ts` proves projection unwind on 8546. This file owns
 * the Solidity side on the shared protocol anvil (8545): BookLevel from place
 * must vanish when the node discards that block. fileParallelism is false, so
 * snapshot/revert here cannot race another protocol file. We never evm_increaseTime.
 *
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { parseEventLogs, stringToHex, type Address, type Abi, type Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;
const MARKET = stringToHex('ETH-USD', { size: 32 });
/** Deeper than a 1-block replace — not indexer finality depth (64). */
const HISTORY_BLOCKS = 5;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('SovereignVenue reorg surface on chain (S-C2)', () => {
  if (!devChainMod) return;

  let trader: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let venue: Address;
  let base: Address;
  let quote: Address;
  let venueAbi: Abi;
  let tokenAbi: Abi;

  async function write(fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    return trader.publicClient.waitForTransactionReceipt({ hash });
  }

  async function snapshot(): Promise<Hex> {
    return trader.publicClient.request({ method: 'evm_snapshot' as never, params: [] as never });
  }

  async function revertTo(id: Hex): Promise<void> {
    const ok = await trader.publicClient.request({ method: 'evm_revert' as never, params: [id] as never });
    if (!ok) throw new Error('evm_revert failed');
  }

  async function mine(): Promise<void> {
    await trader.publicClient.request({ method: 'evm_mine' as never, params: [] as never });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    trader = await devChainMod.devSuiteClients(import.meta.url);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const baseTx = await trader.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: trader.walletClient.account!,
      chain: trader.walletClient.chain,
    });
    base = (await trader.publicClient.waitForTransactionReceipt({ hash: baseTx })).contractAddress!;
    const quoteTx = await trader.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: trader.walletClient.account!,
      chain: trader.walletClient.chain,
    });
    quote = (await trader.publicClient.waitForTransactionReceipt({ hash: quoteTx })).contractAddress!;

    const art = loadArtifact('SovereignVenue');
    venueAbi = art.abi;
    const vTx = await trader.walletClient.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: [MARKET, base, quote, 0, '0x0000000000000000000000000000000000000000'],
      account: trader.walletClient.account!,
      chain: trader.walletClient.chain,
    });
    venue = (await trader.publicClient.waitForTransactionReceipt({ hash: vTx })).contractAddress!;

    await write(() =>
      trader.walletClient.writeContract({
        address: base,
        abi: tokenAbi,
        functionName: 'mint',
        args: [trader.deployer, 1_000n * WAD],
        account: trader.walletClient.account!,
        chain: trader.walletClient.chain,
      }),
    );
    await write(() =>
      trader.walletClient.writeContract({
        address: base,
        abi: tokenAbi,
        functionName: 'approve',
        args: [venue, 1_000n * WAD],
        account: trader.walletClient.account!,
        chain: trader.walletClient.chain,
      }),
    );
  }, 120_000);

  it('tip replace deeper than local history drops the orphaned BookLevel block', async () => {
    const qty = WAD;
    await write(() =>
      trader.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [qty, 0n],
        account: trader.walletClient.account!,
        chain: trader.walletClient.chain,
      }),
    );

    const id = await snapshot();
    let reverted = false;
    try {
      const receipt = await write(() =>
        trader.walletClient.writeContract({
          address: venue,
          abi: venueAbi,
          functionName: 'place',
          args: [1, 2n * WAD, qty],
          account: trader.walletClient.account!,
          chain: trader.walletClient.chain,
        }),
      );
      const levels = parseEventLogs({ abi: venueAbi, logs: receipt.logs, eventName: 'BookLevel' }) as unknown[];
      expect(levels.length).toBeGreaterThan(0);
      const orphaned = receipt.blockHash;
      expect(orphaned).toBeTruthy();

      for (let i = 0; i < HISTORY_BLOCKS; i++) await mine();
      const deep = await trader.publicClient.getBlock({ blockHash: orphaned });
      expect(deep.hash).toBe(orphaned);

      await revertTo(id);
      reverted = true;

      await expect(trader.publicClient.getBlock({ blockHash: orphaned })).rejects.toThrow();

      const again = await write(() =>
        trader.walletClient.writeContract({
          address: venue,
          abi: venueAbi,
          functionName: 'deposit',
          args: [qty, 0n],
          account: trader.walletClient.account!,
          chain: trader.walletClient.chain,
        }),
      );
      expect(again.blockHash).not.toBe(orphaned);
    } finally {
      if (!reverted) await revertTo(id).catch(() => undefined);
    }
  });
});
