/**
 * SovereignVenue on-chain (S-C1). Crossing orders emit Fill from matching only.
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { parseEventLogs, stringToHex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;
const MARKET = stringToHex('ETH-USD', { size: 32 });

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('SovereignVenue on chain (S-C1)', () => {
  if (!devChainMod) return;

  let maker: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let taker: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let venue: Address;
  let base: Address;
  let quote: Address;
  let venueAbi: Abi;
  let tokenAbi: Abi;

  async function write(client: typeof maker, fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    return client.publicClient.waitForTransactionReceipt({ hash });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    maker = await devChainMod.devSuiteClients(import.meta.url);
    taker = await devChainMod.devSuiteClients(`${import.meta.url}#taker`);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const baseTx = await maker.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: maker.walletClient.account!,
      chain: maker.walletClient.chain,
    });
    base = (await maker.publicClient.waitForTransactionReceipt({ hash: baseTx })).contractAddress!;
    const quoteTx = await maker.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: maker.walletClient.account!,
      chain: maker.walletClient.chain,
    });
    quote = (await maker.publicClient.waitForTransactionReceipt({ hash: quoteTx })).contractAddress!;

    const art = loadArtifact('SovereignVenue');
    venueAbi = art.abi;
    const vTx = await maker.walletClient.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: [MARKET, base, quote, 0, '0x0000000000000000000000000000000000000000'],
      account: maker.walletClient.account!,
      chain: maker.walletClient.chain,
    });
    venue = (await maker.publicClient.waitForTransactionReceipt({ hash: vTx })).contractAddress!;

    for (const [client, who] of [
      [maker, maker.deployer],
      [taker, taker.deployer],
    ] as const) {
      await write(maker, () =>
        maker.walletClient.writeContract({
          address: base,
          abi: tokenAbi,
          functionName: 'mint',
          args: [who, 1_000n * WAD],
          account: maker.walletClient.account!,
          chain: maker.walletClient.chain,
        }),
      );
      await write(maker, () =>
        maker.walletClient.writeContract({
          address: quote,
          abi: tokenAbi,
          functionName: 'mint',
          args: [who, 1_000n * WAD],
          account: maker.walletClient.account!,
          chain: maker.walletClient.chain,
        }),
      );
      await write(client, () =>
        client.walletClient.writeContract({
          address: base,
          abi: tokenAbi,
          functionName: 'approve',
          args: [venue, 1_000n * WAD],
          account: client.walletClient.account!,
          chain: client.walletClient.chain,
        }),
      );
      await write(client, () =>
        client.walletClient.writeContract({
          address: quote,
          abi: tokenAbi,
          functionName: 'approve',
          args: [venue, 1_000n * WAD],
          account: client.walletClient.account!,
          chain: client.walletClient.chain,
        }),
      );
    }
  }, 120_000);

  it('ask then crossing bid: Fill from matching; BookLevel absolute qty goes to 0', async () => {
    const qty = 2n * WAD;
    const price = WAD; // 1 quote per base
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [qty, 0n],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    await write(taker, () =>
      taker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [0n, qty],
        account: taker.walletClient.account!,
        chain: taker.walletClient.chain,
      }),
    );
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'place',
        args: [1, price, qty],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    const receipt = await write(taker, () =>
      taker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'place',
        args: [0, price, qty],
        account: taker.walletClient.account!,
        chain: taker.walletClient.chain,
      }),
    );
    const fills = parseEventLogs({ abi: venueAbi, logs: receipt.logs, eventName: 'Fill' });
    expect(fills).toHaveLength(1);
    const fill = fills[0]!.args as {
      maker: Address;
      taker: Address;
      quantity: bigint;
      takerSide: number;
    };
    expect(fill.maker).toBe(maker.deployer);
    expect(fill.taker).toBe(taker.deployer);
    expect(fill.quantity).toBe(qty);
    expect(fill.takerSide).toBe(0);

    const levels = parseEventLogs({ abi: venueAbi, logs: receipt.logs, eventName: 'BookLevel' });
    const last = levels.at(-1)?.args as { quantity: bigint } | undefined;
    expect(last?.quantity).toBe(0n);

    const makerQuote = (await maker.publicClient.readContract({
      address: venue,
      abi: venueAbi,
      functionName: 'quoteBal',
      args: [maker.deployer],
    })) as bigint;
    const takerBase = (await maker.publicClient.readContract({
      address: venue,
      abi: venueAbi,
      functionName: 'baseBal',
      args: [taker.deployer],
    })) as bigint;
    expect(makerQuote).toBe(qty);
    expect(takerBase).toBe(qty);
  });

  it('cancel restores reserved base so withdraw succeeds', async () => {
    const qty = WAD;
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [qty, 0n],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    const placeReceipt = await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'place',
        args: [1, 2n * WAD, qty],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    const placed = parseEventLogs({ abi: venueAbi, logs: placeReceipt.logs, eventName: 'BookLevel' });
    expect((placed[0]!.args as { quantity: bigint }).quantity).toBe(qty);

    const nextId = (await maker.publicClient.readContract({
      address: venue,
      abi: venueAbi,
      functionName: 'nextOrderId',
    })) as bigint;
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'cancel',
        args: [nextId - 1n],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'withdraw',
        args: [qty, 0n],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
  });

  it('self-trade against own resting ask reverts', async () => {
    const qty = WAD;
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [qty, qty],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    await write(maker, () =>
      maker.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'place',
        args: [1, WAD, qty],
        account: maker.walletClient.account!,
        chain: maker.walletClient.chain,
      }),
    );
    await expect(
      write(maker, () =>
        maker.walletClient.writeContract({
          address: venue,
          abi: venueAbi,
          functionName: 'place',
          args: [0, WAD, qty],
          account: maker.walletClient.account!,
          chain: maker.walletClient.chain,
        }),
      ),
    ).rejects.toThrow();
  });
});
