/**
 * T1 — venue deposit/withdraw scale: internal WAD vs 6-dec USDC wallet units.
 * Anvil only. Skips without chain; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi, Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;
const USDC_SCALE = 10n ** 12n;
const MARKET = ('0x' + '11'.repeat(32)) as Hex;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('SovereignVenue decimals scale (T1)', () => {
  if (!devChainMod) return;

  let clients: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let venueAbi: Abi;
  let decAbi: Abi;
  let mock18Base: Address;
  let mock18Quote: Address;
  let mock6: Address;
  let mock8: Address;

  async function write(fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    return clients.publicClient.waitForTransactionReceipt({ hash });
  }

  async function deployDec(decimals: number): Promise<Address> {
    const art = loadArtifact('MockERC20Dec');
    const tx = await clients.walletClient.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: [decimals],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    return (await clients.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
  }

  async function deployVenue(base: Address, quote: Address): Promise<Address> {
    const art = loadArtifact('SovereignVenue');
    const tx = await clients.walletClient.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: [MARKET, base, quote, 0, '0x0000000000000000000000000000000000000000'],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    return (await clients.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    clients = await devChainMod.devSuiteClients(import.meta.url);
    venueAbi = loadArtifact('SovereignVenue').abi;
    decAbi = loadArtifact('MockERC20Dec').abi;
    mock18Base = await deployDec(18);
    mock18Quote = await deployDec(18);
    mock6 = await deployDec(6);
    mock8 = await deployDec(8);
  }, 120_000);

  it('18-dec: deposit 1e18 credits quoteBal 1e18 and pulls 1e18 from wallet', async () => {
    const venue = await deployVenue(mock18Base, mock18Quote);
    const who = clients.deployer;
    await write(() =>
      clients.walletClient.writeContract({
        address: mock18Quote,
        abi: decAbi,
        functionName: 'mint',
        args: [who, 10n * WAD],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    await write(() =>
      clients.walletClient.writeContract({
        address: mock18Quote,
        abi: decAbi,
        functionName: 'approve',
        args: [venue, 10n * WAD],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    const before = (await clients.publicClient.readContract({
      address: mock18Quote,
      abi: decAbi,
      functionName: 'balanceOf',
      args: [who],
    })) as bigint;
    await write(() =>
      clients.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [0n, WAD],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    const after = (await clients.publicClient.readContract({
      address: mock18Quote,
      abi: decAbi,
      functionName: 'balanceOf',
      args: [who],
    })) as bigint;
    const bal = (await clients.publicClient.readContract({
      address: venue,
      abi: venueAbi,
      functionName: 'quoteBal',
      args: [who],
    })) as bigint;
    expect(bal).toBe(WAD);
    expect(before - after).toBe(WAD);
  });

  it('6-dec: deposit 1e18 internal pulls 1e6 wallet; withdraw restores', async () => {
    const venue = await deployVenue(mock18Base, mock6);
    const who = clients.deployer;
    await write(() =>
      clients.walletClient.writeContract({
        address: mock6,
        abi: decAbi,
        functionName: 'mint',
        args: [who, 10n * 10n ** 6n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    await write(() =>
      clients.walletClient.writeContract({
        address: mock6,
        abi: decAbi,
        functionName: 'approve',
        args: [venue, 10n * 10n ** 6n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    const walletBefore = (await clients.publicClient.readContract({
      address: mock6,
      abi: decAbi,
      functionName: 'balanceOf',
      args: [who],
    })) as bigint;
    await write(() =>
      clients.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'deposit',
        args: [0n, WAD],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    const walletAfterDeposit = (await clients.publicClient.readContract({
      address: mock6,
      abi: decAbi,
      functionName: 'balanceOf',
      args: [who],
    })) as bigint;
    const bal = (await clients.publicClient.readContract({
      address: venue,
      abi: venueAbi,
      functionName: 'quoteBal',
      args: [who],
    })) as bigint;
    expect(bal).toBe(WAD);
    expect(walletBefore - walletAfterDeposit).toBe(10n ** 6n);
    expect(walletBefore - walletAfterDeposit).toBe(WAD / USDC_SCALE);

    await write(() =>
      clients.walletClient.writeContract({
        address: venue,
        abi: venueAbi,
        functionName: 'withdraw',
        args: [0n, WAD],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    const walletRestored = (await clients.publicClient.readContract({
      address: mock6,
      abi: decAbi,
      functionName: 'balanceOf',
      args: [who],
    })) as bigint;
    const balAfter = (await clients.publicClient.readContract({
      address: venue,
      abi: venueAbi,
      functionName: 'quoteBal',
      args: [who],
    })) as bigint;
    expect(balAfter).toBe(0n);
    expect(walletRestored).toBe(walletBefore);
  });

  it('8-dec quote reverts BadDecimals', async () => {
    const venue = await deployVenue(mock18Base, mock8);
    const who = clients.deployer;
    await write(() =>
      clients.walletClient.writeContract({
        address: mock8,
        abi: decAbi,
        functionName: 'mint',
        args: [who, 10n * 10n ** 8n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    await write(() =>
      clients.walletClient.writeContract({
        address: mock8,
        abi: decAbi,
        functionName: 'approve',
        args: [venue, 10n * 10n ** 8n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    await expect(
      write(() =>
        clients.walletClient.writeContract({
          address: venue,
          abi: venueAbi,
          functionName: 'deposit',
          args: [0n, WAD],
          account: clients.walletClient.account!,
          chain: clients.walletClient.chain,
        }),
      ),
    ).rejects.toThrow();
  });

  it('6-dec unaligned internal amount reverts', async () => {
    const venue = await deployVenue(mock18Base, mock6);
    const who = clients.deployer;
    await write(() =>
      clients.walletClient.writeContract({
        address: mock6,
        abi: decAbi,
        functionName: 'mint',
        args: [who, 10n * 10n ** 6n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    await write(() =>
      clients.walletClient.writeContract({
        address: mock6,
        abi: decAbi,
        functionName: 'approve',
        args: [venue, 10n * 10n ** 6n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    );
    await expect(
      write(() =>
        clients.walletClient.writeContract({
          address: venue,
          abi: venueAbi,
          functionName: 'deposit',
          args: [0n, WAD + 1n],
          account: clients.walletClient.account!,
          chain: clients.walletClient.chain,
        }),
      ),
    ).rejects.toThrow();
  });
});
