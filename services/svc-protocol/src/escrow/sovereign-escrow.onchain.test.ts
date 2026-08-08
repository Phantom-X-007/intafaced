/**
 * Sovereign escrow on-chain suite (S-A3 / protocol.escrow).
 *
 * Proves lock → release / refund / dispute → timeout (keeper) and that a locked
 * deal cannot strand funds: every terminal path zeroes the deal's amount.
 *
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const TimeoutDisposition = { RefundSeller: 0, ReleaseBuyer: 1 } as const;

const Status = {
  None: 0,
  Open: 1,
  Locked: 2,
  Disputed: 3,
  Released: 4,
  Refunded: 5,
} as const;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('SovereignEscrow on chain (S-A3)', () => {
  if (!devChainMod) return;

  let seller: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let buyer: Address;
  let escrow: Address;
  let token: Address;
  let escrowAbi: Abi;
  let tokenAbi: Abi;
  const amount = 1_000_000_000_000_000_000n;

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    seller = await devChainMod.devSuiteClients(import.meta.url);
    const buyerClients = await devChainMod.devSuiteClients(`${import.meta.url}#buyer`);
    buyer = buyerClients.deployer;

    const mock = loadArtifact('MockERC20');
    const tokenTx = await seller.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });
    const tokenReceipt = await seller.publicClient.waitForTransactionReceipt({ hash: tokenTx });
    token = tokenReceipt.contractAddress!;
    tokenAbi = mock.abi;

    const esc = loadArtifact('SovereignEscrow');
    const escTx = await seller.walletClient.deployContract({
      abi: esc.abi,
      bytecode: esc.bytecode,
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });
    const escReceipt = await seller.publicClient.waitForTransactionReceipt({ hash: escTx });
    escrow = escReceipt.contractAddress!;
    escrowAbi = esc.abi;

    await seller.walletClient.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: 'mint',
      args: [seller.deployer, amount * 10n],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });
  }, 120_000);

  async function openAndLock(opts?: { disposition?: number; window?: number; arbiter?: Address }) {
    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'open',
      args: [
        buyer,
        token,
        amount,
        opts?.arbiter ?? ('0x0000000000000000000000000000000000000000' as Address),
        '0x0000000000000000000000000000000000000000' as Address,
        0,
        opts?.window ?? 3600,
        opts?.disposition ?? TimeoutDisposition.RefundSeller,
      ],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });
    const nextId = (await seller.publicClient.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'nextDealId',
    })) as bigint;
    const id = nextId - 1n;

    await seller.walletClient.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: 'approve',
      args: [escrow, amount],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });
    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'lock',
      args: [id],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });
    return id;
  }

  it('lock → release: buyer receives full amount; deal amount zeroes', async () => {
    const id = await openAndLock();
    const before = (await seller.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [buyer],
    })) as bigint;

    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'release',
      args: [id],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });

    const after = (await seller.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [buyer],
    })) as bigint;
    expect(after - before).toBe(amount);

    const deal = (await seller.publicClient.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'deals',
      args: [id],
    })) as readonly unknown[];
    expect(Number(deal[9])).toBe(Status.Released);
    expect(deal[3]).toBe(0n);
  });

  it('lock → refund: seller recovers; deal amount zeroes', async () => {
    const id = await openAndLock();
    const before = (await seller.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [seller.deployer],
    })) as bigint;

    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'refund',
      args: [id],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });

    const after = (await seller.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [seller.deployer],
    })) as bigint;
    expect(after - before).toBe(amount);

    const deal = (await seller.publicClient.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'deals',
      args: [id],
    })) as readonly unknown[];
    expect(Number(deal[9])).toBe(Status.Refunded);
    expect(deal[3]).toBe(0n);
  });

  it('dispute → settleTimeout (keeper): pre-agreed refund; no stranded amount', async () => {
    const id = await openAndLock({ window: 1, disposition: TimeoutDisposition.RefundSeller });
    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'dispute',
      args: [id],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });

    await seller.publicClient.request({ method: 'evm_increaseTime' as never, params: [2] as never });
    await seller.publicClient.request({ method: 'evm_mine' as never, params: [] as never });

    const before = (await seller.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [seller.deployer],
    })) as bigint;

    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'settleTimeout',
      args: [id],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });

    const after = (await seller.publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [seller.deployer],
    })) as bigint;
    expect(after - before).toBe(amount);

    const deal = (await seller.publicClient.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'deals',
      args: [id],
    })) as readonly unknown[];
    expect(Number(deal[9])).toBe(Status.Refunded);
    expect(deal[3]).toBe(0n);
  });

  it('refuses settleTimeout before deadline', async () => {
    const id = await openAndLock({ window: 86_400 });
    await seller.walletClient.writeContract({
      address: escrow,
      abi: escrowAbi,
      functionName: 'dispute',
      args: [id],
      account: seller.walletClient.account!,
      chain: seller.walletClient.chain,
    });

    await expect(
      seller.walletClient.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: 'settleTimeout',
        args: [id],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    ).rejects.toThrow();
  });
});
