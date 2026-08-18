/**
 * FairLaunch on-chain (S-G2 / launch.launchpad).
 * Proves: contribute → finalize → claim 0 before cliff → partial after cliff;
 * unmet minRaise refunds quote. Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi, PublicClient } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;
const SALE_AMOUNT = 1000n * WAD;
const RAISE_CAP = 100n * WAD;
const MIN_RAISE = 40n * WAD;
const WALLET_CAP = 80n * WAD;
const WINDOW = 50;
const CLIFF = 100;
const LINEAR = 100;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('FairLaunch on chain (S-G2)', () => {
  if (!devChainMod) return;

  let creator: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let buyer: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let launch: Address;
  let sale: Address;
  let quote: Address;
  let launchAbi: Abi;
  let tokenAbi: Abi;

  async function write(client: PublicClient, fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    await client.waitForTransactionReceipt({ hash });
  }

  async function warp(seconds: number) {
    await creator.publicClient.request({ method: 'evm_increaseTime' as never, params: [seconds] as never });
    await creator.publicClient.request({ method: 'evm_mine' as never, params: [] as never });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    creator = await devChainMod.devSuiteClients(import.meta.url);
    buyer = await devChainMod.devSuiteClients(`${import.meta.url}#buyer`);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const deployToken = async () => {
      const tx = await creator.walletClient.deployContract({
        abi: mock.abi,
        bytecode: mock.bytecode,
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      });
      return (await creator.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
    };
    sale = await deployToken();
    quote = await deployToken();

    const now = Number((await creator.publicClient.getBlock()).timestamp);
    const fl = loadArtifact('FairLaunch');
    launchAbi = fl.abi;
    const flTx = await creator.walletClient.deployContract({
      abi: fl.abi,
      bytecode: fl.bytecode,
      args: [sale, quote, SALE_AMOUNT, RAISE_CAP, MIN_RAISE, now, now + WINDOW, WALLET_CAP, CLIFF, LINEAR],
      account: creator.walletClient.account!,
      chain: creator.walletClient.chain,
    });
    launch = (await creator.publicClient.waitForTransactionReceipt({ hash: flTx })).contractAddress!;

    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: sale,
        abi: tokenAbi,
        functionName: 'mint',
        args: [creator.deployer, SALE_AMOUNT],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: sale,
        abi: tokenAbi,
        functionName: 'approve',
        args: [launch, SALE_AMOUNT],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'fund',
        args: [],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );

    const contributeAmount = 50n * WAD;
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: quote,
        abi: tokenAbi,
        functionName: 'mint',
        args: [buyer.deployer, contributeAmount],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await write(buyer.publicClient, () =>
      buyer.walletClient.writeContract({
        address: quote,
        abi: tokenAbi,
        functionName: 'approve',
        args: [launch, contributeAmount],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
    await write(buyer.publicClient, () =>
      buyer.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'contribute',
        args: [contributeAmount],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
  }, 180_000);

  it('records the contribution against the raise', async () => {
    const raised = (await creator.publicClient.readContract({
      address: launch,
      abi: launchAbi,
      functionName: 'totalRaised',
    })) as bigint;
    expect(raised).toBe(50n * WAD);
  });

  it('finalizes after the window; claim is 0 before cliff', async () => {
    await warp(WINDOW + 1);
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'finalize',
        args: [],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );

    const ok = (await creator.publicClient.readContract({
      address: launch,
      abi: launchAbi,
      functionName: 'success',
    })) as boolean;
    expect(ok).toBe(true);

    const claimable = (await creator.publicClient.readContract({
      address: launch,
      abi: launchAbi,
      functionName: 'claimable',
      args: [buyer.deployer],
    })) as bigint;
    expect(claimable).toBe(0n);

    await expect(
      buyer.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'claim',
        args: [],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    ).rejects.toThrow();

    const bal = (await creator.publicClient.readContract({
      address: sale,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [buyer.deployer],
    })) as bigint;
    expect(bal).toBe(0n);
  });

  it('claims a partial vest after cliff + half linear', async () => {
    await warp(CLIFF + LINEAR / 2);
    await write(buyer.publicClient, () =>
      buyer.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'claim',
        args: [],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );

    const bal = (await creator.publicClient.readContract({
      address: sale,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [buyer.deployer],
    })) as bigint;
    const vested = (await creator.publicClient.readContract({
      address: launch,
      abi: launchAbi,
      functionName: 'vestedOf',
      args: [buyer.deployer],
    })) as bigint;
    expect(bal).toBe(vested);
    expect(bal).toBeGreaterThan(0n);
    expect(bal).toBeLessThan(SALE_AMOUNT);
  });
});

describeOnChain('FairLaunch refund when minRaise unmet (S-G2)', () => {
  if (!devChainMod) return;

  let creator: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let buyer: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let launch: Address;
  let sale: Address;
  let quote: Address;
  let launchAbi: Abi;
  let tokenAbi: Abi;
  const dust = 5n * WAD;

  async function write(client: PublicClient, fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    await client.waitForTransactionReceipt({ hash });
  }

  async function warp(seconds: number) {
    await creator.publicClient.request({ method: 'evm_increaseTime' as never, params: [seconds] as never });
    await creator.publicClient.request({ method: 'evm_mine' as never, params: [] as never });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    creator = await devChainMod.devSuiteClients(`${import.meta.url}#fail-creator`);
    buyer = await devChainMod.devSuiteClients(`${import.meta.url}#fail-buyer`);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const deployToken = async () => {
      const tx = await creator.walletClient.deployContract({
        abi: mock.abi,
        bytecode: mock.bytecode,
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      });
      return (await creator.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
    };
    sale = await deployToken();
    quote = await deployToken();

    const now = Number((await creator.publicClient.getBlock()).timestamp);
    const fl = loadArtifact('FairLaunch');
    launchAbi = fl.abi;
    const flTx = await creator.walletClient.deployContract({
      abi: fl.abi,
      bytecode: fl.bytecode,
      args: [sale, quote, SALE_AMOUNT, RAISE_CAP, MIN_RAISE, now, now + WINDOW, WALLET_CAP, CLIFF, LINEAR],
      account: creator.walletClient.account!,
      chain: creator.walletClient.chain,
    });
    launch = (await creator.publicClient.waitForTransactionReceipt({ hash: flTx })).contractAddress!;

    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: sale,
        abi: tokenAbi,
        functionName: 'mint',
        args: [creator.deployer, SALE_AMOUNT],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: sale,
        abi: tokenAbi,
        functionName: 'approve',
        args: [launch, SALE_AMOUNT],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'fund',
        args: [],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );

    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: quote,
        abi: tokenAbi,
        functionName: 'mint',
        args: [buyer.deployer, dust],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await write(buyer.publicClient, () =>
      buyer.walletClient.writeContract({
        address: quote,
        abi: tokenAbi,
        functionName: 'approve',
        args: [launch, dust],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
    await write(buyer.publicClient, () =>
      buyer.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'contribute',
        args: [dust],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
  }, 180_000);

  it('refunds quote when finalize sees minRaise unmet', async () => {
    await warp(WINDOW + 1);
    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'finalize',
        args: [],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );

    const ok = (await creator.publicClient.readContract({
      address: launch,
      abi: launchAbi,
      functionName: 'success',
    })) as boolean;
    expect(ok).toBe(false);

    await expect(
      buyer.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'claim',
        args: [],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    ).rejects.toThrow();

    await write(buyer.publicClient, () =>
      buyer.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'refund',
        args: [],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );

    const quoteBal = (await creator.publicClient.readContract({
      address: quote,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [buyer.deployer],
    })) as bigint;
    expect(quoteBal).toBe(dust);

    await write(creator.publicClient, () =>
      creator.walletClient.writeContract({
        address: launch,
        abi: launchAbi,
        functionName: 'reclaimSale',
        args: [],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    const saleBal = (await creator.publicClient.readContract({
      address: sale,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [creator.deployer],
    })) as bigint;
    expect(saleBal).toBe(SALE_AMOUNT);
  });
});
