/**
 * S-G1 MemeLaunch on-chain: two MockERC20 + factories → launch → LP at lock,
 * claim reverts before unlock. Skips without anvil; CI with REQUIRE_EVM_CHAIN=1
 * must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeEventLog, type Address, type Abi, type Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;
const FEE_BPS = 30;
const ZERO: Address = '0x0000000000000000000000000000000000000000';
const SALT: Hex = `0x${'11'.repeat(32)}`;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('MemeLaunch on chain (S-G1)', () => {
  if (!devChainMod) return;

  let clients: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let tokenA: Address;
  let tokenB: Address;
  let meme: Address;
  let tokenFactory: Address;
  let poolFactory: Address;
  let tokenAbi: Abi;
  let memeAbi: Abi;
  let poolAbi: Abi;
  let lockAbi: Abi;
  let factoryAbi: Abi;

  async function write(fn: () => Promise<Hex>) {
    const hash = await fn();
    return clients.publicClient.waitForTransactionReceipt({ hash });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    clients = await devChainMod.devSuiteClients(import.meta.url);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const deployMock = async () => {
      const tx = await clients.walletClient.deployContract({
        abi: mock.abi,
        bytecode: mock.bytecode,
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      });
      return (await clients.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
    };
    tokenA = await deployMock();
    tokenB = await deployMock();

    ({ factory: tokenFactory } = await devChainMod.deployTokenFactory(clients));
    ({ factory: poolFactory } = await devChainMod.deployPoolFactory(clients));

    const ml = loadArtifact('MemeLaunch');
    memeAbi = ml.abi;
    const mTx = await clients.walletClient.deployContract({
      abi: ml.abi,
      bytecode: ml.bytecode,
      args: [tokenFactory, poolFactory],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    meme = (await clients.publicClient.waitForTransactionReceipt({ hash: mTx })).contractAddress!;

    poolAbi = loadArtifact('ConstantProductPool').abi;
    lockAbi = loadArtifact('LaunchLpLock').abi;
    factoryAbi = loadArtifact('PoolFactory').abi;

    const seed = 100_000n * WAD;
    for (const token of [tokenA, tokenB]) {
      await write(() =>
        clients.walletClient.writeContract({
          address: token,
          abi: tokenAbi,
          functionName: 'mint',
          args: [clients.deployer, seed],
          account: clients.walletClient.account!,
          chain: clients.walletClient.chain,
        }),
      );
      await write(() =>
        clients.walletClient.writeContract({
          address: token,
          abi: tokenAbi,
          functionName: 'approve',
          args: [meme, seed],
          account: clients.walletClient.account!,
          chain: clients.walletClient.chain,
        }),
      );
    }
  }, 120_000);

  function launchArgs(overrides: Record<string, unknown> = {}) {
    return {
      existingToken: tokenA,
      name: '',
      symbol: '',
      decimals: 0,
      totalSupply: 0n,
      quoteToken: tokenB,
      feeBps: FEE_BPS,
      tokenAmount: 10_000n * WAD,
      quoteAmount: 10_000n * WAD,
      unlockTime: 2_000_000_000n,
      userSalt: SALT,
      ...overrides,
    };
  }

  it('launches: pool + LP locked at LaunchLpLock; claim reverts before unlock', async () => {
    const params = launchArgs();
    const receipt = await write(() =>
      clients.walletClient.writeContract({
        address: meme,
        abi: memeAbi,
        functionName: 'launch',
        args: [params],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    expect(receipt.status).toBe('success');

    let pool: Address = ZERO;
    let lpLock: Address = ZERO;
    let liquidity = 0n;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: memeAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === 'Launched') {
          pool = decoded.args.pool as Address;
          lpLock = decoded.args.lpLock as Address;
          liquidity = decoded.args.liquidity as bigint;
        }
      } catch {
        // logs from the pool / lock / tokens
      }
    }
    expect(pool).not.toBe(ZERO);
    expect(lpLock).not.toBe(ZERO);
    expect(liquidity > 0n).toBe(true);

    const recordedPool = (await clients.publicClient.readContract({
      address: poolFactory,
      abi: factoryAbi,
      functionName: 'getPool',
      args: [tokenA, tokenB, FEE_BPS],
    })) as Address;
    expect(recordedPool.toLowerCase()).toBe(pool.toLowerCase());

    const lpAtLock = (await clients.publicClient.readContract({
      address: pool,
      abi: poolAbi,
      functionName: 'balanceOf',
      args: [lpLock],
    })) as bigint;
    expect(lpAtLock).toBe(liquidity);

    const lpAtLauncher = (await clients.publicClient.readContract({
      address: pool,
      abi: poolAbi,
      functionName: 'balanceOf',
      args: [meme],
    })) as bigint;
    expect(lpAtLauncher).toBe(0n);

    const memeTokenBal = (await clients.publicClient.readContract({
      address: tokenA,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [meme],
    })) as bigint;
    const memeQuoteBal = (await clients.publicClient.readContract({
      address: tokenB,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [meme],
    })) as bigint;
    expect(memeTokenBal).toBe(0n);
    expect(memeQuoteBal).toBe(0n);

    await expect(
      clients.walletClient.writeContract({
        address: lpLock,
        abi: lockAbi,
        functionName: 'claim',
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    ).rejects.toThrow();
  }, 120_000);

  it('reverts on zero amounts, identical tokens, and unlockTime <= now', async () => {
    await expect(
      clients.walletClient.writeContract({
        address: meme,
        abi: memeAbi,
        functionName: 'launch',
        args: [launchArgs({ tokenAmount: 0n })],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    ).rejects.toThrow();

    await expect(
      clients.walletClient.writeContract({
        address: meme,
        abi: memeAbi,
        functionName: 'launch',
        args: [launchArgs({ quoteToken: tokenA })],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    ).rejects.toThrow();

    const latest = await clients.publicClient.getBlock();
    await expect(
      clients.walletClient.writeContract({
        address: meme,
        abi: memeAbi,
        functionName: 'launch',
        args: [launchArgs({ unlockTime: latest.timestamp })],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    ).rejects.toThrow();
  }, 60_000);
});
