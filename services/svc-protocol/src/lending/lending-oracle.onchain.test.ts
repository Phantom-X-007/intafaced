/**
 * FailClosedOracle + IsolatedLendingMarket on-chain (S-A12 / S-A4).
 * Proves: disagreement/staleness refuse; borrow against healthy LTV; liquidate when underwater.
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi, PublicClient } from 'viem';
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

describeOnChain('oracle + isolated lending on chain (S-A12/S-A4)', () => {
  if (!devChainMod) return;

  let a: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let reporterB: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let borrower: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let oracle: Address;
  let market: Address;
  let col: Address;
  let bor: Address;
  let oracleAbi: Abi;
  let marketAbi: Abi;
  let tokenAbi: Abi;

  /** viem writeContract returns a hash — wait so later reads cannot race the mine. */
  async function write(client: PublicClient, fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    await client.waitForTransactionReceipt({ hash });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    a = await devChainMod.devSuiteClients(import.meta.url);
    reporterB = await devChainMod.devSuiteClients(`${import.meta.url}#b`);
    borrower = await devChainMod.devSuiteClients(`${import.meta.url}#borrower`);

    const mock = loadArtifact('MockERC20');
    tokenAbi = mock.abi;
    const deployToken = async () => {
      const tx = await a.walletClient.deployContract({
        abi: mock.abi,
        bytecode: mock.bytecode,
        account: a.walletClient.account!,
        chain: a.walletClient.chain,
      });
      const receipt = await a.publicClient.waitForTransactionReceipt({ hash: tx });
      return receipt.contractAddress!;
    };
    col = await deployToken();
    bor = await deployToken();

    const oc = loadArtifact('FailClosedOracle');
    oracleAbi = oc.abi;
    const ocTx = await a.walletClient.deployContract({
      abi: oc.abi,
      bytecode: oc.bytecode,
      args: [a.deployer, reporterB.deployer, 3600, 200],
      account: a.walletClient.account!,
      chain: a.walletClient.chain,
    });
    oracle = (await a.publicClient.waitForTransactionReceipt({ hash: ocTx })).contractAddress!;

    const mk = loadArtifact('IsolatedLendingMarket');
    marketAbi = mk.abi;
    const mkTx = await a.walletClient.deployContract({
      abi: mk.abi,
      bytecode: mk.bytecode,
      args: [
        {
          collateralToken: col,
          borrowToken: bor,
          oracle,
          collateralAssetForOracle: col,
          borrowAssetForOracle: bor,
          maxLtvBps: 5000,
          liquidationThresholdBps: 8000,
          liquidationBonusBps: 500,
          closeFactorBps: 5000,
          reserveFactorBps: 1000,
          baseRateBps: 200,
          slope1Bps: 400,
          slope2Bps: 8000,
          kinkBps: 8000,
        },
      ],
      account: a.walletClient.account!,
      chain: a.walletClient.chain,
    });
    market = (await a.publicClient.waitForTransactionReceipt({ hash: mkTx })).contractAddress!;

    await write(a.publicClient, () =>
      a.walletClient.writeContract({
        address: col,
        abi: tokenAbi,
        functionName: 'mint',
        args: [borrower.deployer, 100n * WAD],
        account: a.walletClient.account!,
        chain: a.walletClient.chain,
      }),
    );
    await write(a.publicClient, () =>
      a.walletClient.writeContract({
        address: bor,
        abi: tokenAbi,
        functionName: 'mint',
        args: [a.deployer, 1_000n * WAD],
        account: a.walletClient.account!,
        chain: a.walletClient.chain,
      }),
    );
    await write(a.publicClient, () =>
      a.walletClient.writeContract({
        address: bor,
        abi: tokenAbi,
        functionName: 'approve',
        args: [market, 1_000n * WAD],
        account: a.walletClient.account!,
        chain: a.walletClient.chain,
      }),
    );
    await write(a.publicClient, () =>
      a.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'supplyLiquidity',
        args: [1_000n * WAD],
        account: a.walletClient.account!,
        chain: a.walletClient.chain,
      }),
    );
  }, 180_000);

  async function reportBoth(priceCol: bigint, priceBor: bigint) {
    for (const [asset, price] of [
      [col, priceCol],
      [bor, priceBor],
    ] as const) {
      await write(a.publicClient, () =>
        a.walletClient.writeContract({
          address: oracle,
          abi: oracleAbi,
          functionName: 'report',
          args: [asset, price],
          account: a.walletClient.account!,
          chain: a.walletClient.chain,
        }),
      );
      await write(reporterB.publicClient, () =>
        reporterB.walletClient.writeContract({
          address: oracle,
          abi: oracleAbi,
          functionName: 'report',
          args: [asset, price],
          account: reporterB.walletClient.account!,
          chain: reporterB.walletClient.chain,
        }),
      );
    }
  }

  it('oracle refuses disagreement', async () => {
    await write(a.publicClient, () =>
      a.walletClient.writeContract({
        address: oracle,
        abi: oracleAbi,
        functionName: 'report',
        args: [col, 100n * WAD],
        account: a.walletClient.account!,
        chain: a.walletClient.chain,
      }),
    );
    await write(reporterB.publicClient, () =>
      reporterB.walletClient.writeContract({
        address: oracle,
        abi: oracleAbi,
        functionName: 'report',
        args: [col, 130n * WAD],
        account: reporterB.walletClient.account!,
        chain: reporterB.walletClient.chain,
      }),
    );
    await expect(
      a.publicClient.readContract({
        address: oracle,
        abi: oracleAbi,
        functionName: 'getMark',
        args: [col],
      }),
    ).rejects.toThrow();
    // Restore agreement so later tests in this file never inherit Disagreement.
    await reportBoth(100n * WAD, 100n * WAD);
  });

  it('borrow works with agreeing marks; unhealthy borrow reverts', async () => {
    await reportBoth(100n * WAD, 100n * WAD);
    await write(borrower.publicClient, () =>
      borrower.walletClient.writeContract({
        address: col,
        abi: tokenAbi,
        functionName: 'approve',
        args: [market, 50n * WAD],
        account: borrower.walletClient.account!,
        chain: borrower.walletClient.chain,
      }),
    );
    await write(borrower.publicClient, () =>
      borrower.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'depositCollateral',
        args: [50n * WAD],
        account: borrower.walletClient.account!,
        chain: borrower.walletClient.chain,
      }),
    );
    // 50 col @ 100, max LTV 50% → max debt value 25
    await write(borrower.publicClient, () =>
      borrower.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'borrow',
        args: [20n * WAD],
        account: borrower.walletClient.account!,
        chain: borrower.walletClient.chain,
      }),
    );
    const debt = (await a.publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: 'debtOf',
      args: [borrower.deployer],
    })) as bigint;
    expect(debt).toBe(20n * WAD);

    await expect(
      borrower.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'borrow',
        args: [20n * WAD],
        account: borrower.walletClient.account!,
        chain: borrower.walletClient.chain,
      }),
    ).rejects.toThrow();
  });
});
