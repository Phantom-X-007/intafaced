/**
 * S-L2 LegacyVault on-chain: heartbeat abort, staged heir claim, owner withdraw before succession.
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('LegacyVault on chain (S-L2)', () => {
  if (!devChainMod) return;

  let owner: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let heirA: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let heirB: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let vault: Address;
  let token: Address;
  let vaultAbi: Abi;
  let tokenAbi: Abi;

  async function write(fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    await owner.publicClient.waitForTransactionReceipt({ hash });
  }

  async function warp(seconds: number) {
    await owner.publicClient.request({ method: 'evm_increaseTime' as never, params: [seconds] as never });
    await owner.publicClient.request({ method: 'evm_mine' as never, params: [] as never });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    owner = await devChainMod.devSuiteClients(import.meta.url);
    heirA = await devChainMod.devSuiteClients(`${import.meta.url}#heirA`);
    heirB = await devChainMod.devSuiteClients(`${import.meta.url}#heirB`);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const tokenTx = await owner.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: owner.walletClient.account!,
      chain: owner.walletClient.chain,
    });
    token = (await owner.publicClient.waitForTransactionReceipt({ hash: tokenTx })).contractAddress!;

    const lv = loadArtifact('LegacyVault');
    vaultAbi = lv.abi;
    const vTx = await owner.walletClient.deployContract({
      abi: lv.abi,
      bytecode: lv.bytecode,
      args: [token, 100, 50, 80, 5000, [heirA.deployer, heirB.deployer], [6000, 4000]],
      account: owner.walletClient.account!,
      chain: owner.walletClient.chain,
    });
    vault = (await owner.publicClient.waitForTransactionReceipt({ hash: vTx })).contractAddress!;

    await write(() =>
      owner.walletClient.writeContract({
        address: token,
        abi: tokenAbi,
        functionName: 'mint',
        args: [owner.deployer, 100n * WAD],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    await write(() =>
      owner.walletClient.writeContract({
        address: token,
        abi: tokenAbi,
        functionName: 'approve',
        args: [vault, 100n * WAD],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    await write(() =>
      owner.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'deposit',
        args: [100n * WAD],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
  }, 180_000);

  it('owner withdraws before succession; heirs cannot claim yet', async () => {
    await expect(
      heirA.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'claim',
        args: [0n],
        account: heirA.walletClient.account!,
        chain: heirA.walletClient.chain,
      }),
    ).rejects.toThrow();

    await write(() =>
      owner.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'withdraw',
        args: [10n * WAD],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
  });

  it('startSuccession refuses until inactivityDelay; owner heartbeat aborts a challenge', async () => {
    await expect(
      owner.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'startSuccession',
        args: [],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    ).rejects.toThrow();

    await warp(101);
    await write(() =>
      heirA.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'startSuccession',
        args: [],
        account: heirA.walletClient.account!,
        chain: heirA.walletClient.chain,
      }),
    );
    await write(() =>
      owner.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'heartbeat',
        args: [],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    const started = (await owner.publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'successionStartedAt',
    })) as bigint;
    expect(started).toBe(0n);
  });

  it('after unlock, heirs claim first tranche then remainder after stageDelay', async () => {
    await warp(101);
    await write(() =>
      heirB.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'startSuccession',
        args: [],
        account: heirB.walletClient.account!,
        chain: heirB.walletClient.chain,
      }),
    );
    await expect(
      heirA.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'claim',
        args: [0n],
        account: heirA.walletClient.account!,
        chain: heirA.walletClient.chain,
      }),
    ).rejects.toThrow();

    await warp(51);
    const beforeA = (await owner.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [heirA.deployer],
    })) as bigint;
    await write(() =>
      heirA.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'claim',
        args: [0n],
        account: heirA.walletClient.account!,
        chain: heirA.walletClient.chain,
      }),
    );
    const afterA = (await owner.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [heirA.deployer],
    })) as bigint;
    expect(afterA - beforeA).toBe(27n * WAD);

    await warp(81);
    const beforeA2 = afterA;
    await write(() =>
      heirA.walletClient.writeContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'claim',
        args: [0n],
        account: heirA.walletClient.account!,
        chain: heirA.walletClient.chain,
      }),
    );
    const afterA2 = (await owner.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [heirA.deployer],
    })) as bigint;
    expect(afterA2 - beforeA2).toBe(27n * WAD);
  });
});
