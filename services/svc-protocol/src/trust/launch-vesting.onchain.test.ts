/**
 * S-L4 on-chain: cliff holds, linear vest releases, reputation records facts
 * (zeros stay zeros until a lock/vest is noted). Skips without anvil.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { getContractAddress } from 'viem';
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

describeOnChain('LaunchVesting + DeployerReputation on chain (S-L4)', () => {
  if (!devChainMod) return;

  let owner: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let token: Address;
  let tokenAbi: Abi;
  let vestAbi: Abi;
  let lockAbi: Abi;
  let repAbi: Abi;
  let reputation: Address;

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
    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    vestAbi = loadArtifact('LaunchVesting').abi;
    lockAbi = loadArtifact('LaunchLpLock').abi;
    repAbi = loadArtifact('DeployerReputation').abi;
    const tTx = await owner.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: owner.walletClient.account!,
      chain: owner.walletClient.chain,
    });
    token = (await owner.publicClient.waitForTransactionReceipt({ hash: tTx })).contractAddress!;
    await write(() =>
      owner.walletClient.writeContract({
        address: token,
        abi: tokenAbi,
        functionName: 'mint',
        args: [owner.deployer, 1_000n * WAD],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    const rTx = await owner.walletClient.deployContract({
      abi: loadArtifact('DeployerReputation').abi,
      bytecode: loadArtifact('DeployerReputation').bytecode,
      account: owner.walletClient.account!,
      chain: owner.walletClient.chain,
    });
    reputation = (await owner.publicClient.waitForTransactionReceipt({ hash: rTx })).contractAddress!;
  }, 120_000);

  it('empty facts are zeros — no score to render as clean', async () => {
    const row = (await owner.publicClient.readContract({
      address: reputation,
      abi: repAbi,
      functionName: 'facts',
      args: [owner.deployer],
    })) as readonly [number, number];
    expect(row[0]).toBe(0);
    expect(row[1]).toBe(0);
  });

  it('cliff: claim reverts; after duration: full amount to beneficiary', async () => {
    const total = 100n * WAD;
    const nonce = await owner.publicClient.getTransactionCount({ address: owner.deployer });
    const vestingAddr = getContractAddress({ from: owner.deployer, nonce: BigInt(nonce) + 1n });
    await write(() =>
      owner.walletClient.writeContract({
        address: token,
        abi: tokenAbi,
        functionName: 'approve',
        args: [vestingAddr, total],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    const now = Number((await owner.publicClient.getBlock()).timestamp);
    const vTx = await owner.walletClient.deployContract({
      abi: loadArtifact('LaunchVesting').abi,
      bytecode: loadArtifact('LaunchVesting').bytecode,
      args: [token, owner.deployer, BigInt(now), 50n, 100n, total],
      account: owner.walletClient.account!,
      chain: owner.walletClient.chain,
    });
    const vesting = (await owner.publicClient.waitForTransactionReceipt({ hash: vTx })).contractAddress!;
    expect(vesting.toLowerCase()).toBe(vestingAddr.toLowerCase());

    await expect(
      write(() =>
        owner.walletClient.writeContract({
          address: vesting,
          abi: vestAbi,
          functionName: 'claim',
          account: owner.walletClient.account!,
          chain: owner.walletClient.chain,
        }),
      ),
    ).rejects.toThrow();

    await warp(100);
    await write(() =>
      owner.walletClient.writeContract({
        address: vesting,
        abi: vestAbi,
        functionName: 'claim',
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    await write(() =>
      owner.walletClient.writeContract({
        address: reputation,
        abi: repAbi,
        functionName: 'registerVesting',
        args: [vesting],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    const vestFacts = (await owner.publicClient.readContract({
      address: reputation,
      abi: repAbi,
      functionName: 'facts',
      args: [owner.deployer],
    })) as readonly [number, number];
    expect(vestFacts[1]).toBe(1);
    const bal = (await owner.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [owner.deployer],
    })) as bigint;
    // minted 1000, funded 100 into vest, claimed 100 back
    expect(bal).toBe(1_000n * WAD);
  });

  it('registerLock increments facts; second register reverts', async () => {
    const now = Number((await owner.publicClient.getBlock()).timestamp);
    const lTx = await owner.walletClient.deployContract({
      abi: loadArtifact('LaunchLpLock').abi,
      bytecode: loadArtifact('LaunchLpLock').bytecode,
      args: [token, owner.deployer, BigInt(now + 10_000)],
      account: owner.walletClient.account!,
      chain: owner.walletClient.chain,
    });
    const lock = (await owner.publicClient.waitForTransactionReceipt({ hash: lTx })).contractAddress!;
    await write(() =>
      owner.walletClient.writeContract({
        address: reputation,
        abi: repAbi,
        functionName: 'registerLock',
        args: [lock],
        account: owner.walletClient.account!,
        chain: owner.walletClient.chain,
      }),
    );
    const row = (await owner.publicClient.readContract({
      address: reputation,
      abi: repAbi,
      functionName: 'facts',
      args: [owner.deployer],
    })) as readonly [number, number];
    expect(row[0]).toBe(1);
    await expect(
      write(() =>
        owner.walletClient.writeContract({
          address: reputation,
          abi: repAbi,
          functionName: 'registerLock',
          args: [lock],
          account: owner.walletClient.account!,
          chain: owner.walletClient.chain,
        }),
      ),
    ).rejects.toThrow();
    void lockAbi;
  });
});
