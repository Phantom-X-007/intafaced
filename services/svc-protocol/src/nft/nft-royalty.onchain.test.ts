/**
 * S-G3 NFT mint / list / English auction with on-chain royalty (not ERC-2981 signalling only).
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const WAD = 10n ** 18n;
const PRICE = 10n * WAD;
const ROYALTY_BPS = 500n; // 5%
const ROYALTY = (PRICE * ROYALTY_BPS) / 10_000n;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('SovereignNft + RoyaltyMarket on chain (S-G3)', () => {
  if (!devChainMod) return;

  let creator: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let seller: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let buyer: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let royaltyTo: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let bidder: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let nft: Address;
  let market: Address;
  let quote: Address;
  let nftAbi: Abi;
  let marketAbi: Abi;
  let quoteAbi: Abi;
  let listedTokenId: bigint;
  let auctionTokenId: bigint;

  async function wait(fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    await creator.publicClient.waitForTransactionReceipt({ hash });
  }

  async function warp(seconds: number) {
    await creator.publicClient.request({ method: 'evm_increaseTime' as never, params: [seconds] as never });
    await creator.publicClient.request({ method: 'evm_mine' as never, params: [] as never });
  }

  async function bal(who: Address): Promise<bigint> {
    return (await creator.publicClient.readContract({
      address: quote,
      abi: quoteAbi,
      functionName: 'balanceOf',
      args: [who],
    })) as bigint;
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    creator = await devChainMod.devSuiteClients(import.meta.url);
    seller = await devChainMod.devSuiteClients(`${import.meta.url}#seller`);
    buyer = await devChainMod.devSuiteClients(`${import.meta.url}#buyer`);
    royaltyTo = await devChainMod.devSuiteClients(`${import.meta.url}#royalty`);
    bidder = await devChainMod.devSuiteClients(`${import.meta.url}#bidder`);

    const nftArt = loadArtifact('SovereignNft');
    nftAbi = nftArt.abi;
    const nftTx = await creator.walletClient.deployContract({
      abi: nftArt.abi,
      bytecode: nftArt.bytecode,
      args: ['Sovereign', 'SOV'],
      account: creator.walletClient.account!,
      chain: creator.walletClient.chain,
    });
    nft = (await creator.publicClient.waitForTransactionReceipt({ hash: nftTx })).contractAddress!;

    const mArt = loadArtifact('RoyaltyMarket');
    marketAbi = mArt.abi;
    const mTx = await creator.walletClient.deployContract({
      abi: mArt.abi,
      bytecode: mArt.bytecode,
      account: creator.walletClient.account!,
      chain: creator.walletClient.chain,
    });
    market = (await creator.publicClient.waitForTransactionReceipt({ hash: mTx })).contractAddress!;

    const mock = loadArtifact('MockERC20');
    quoteAbi = mock.abi;
    const qTx = await creator.walletClient.deployContract({
      abi: mock.abi,
      bytecode: mock.bytecode,
      account: creator.walletClient.account!,
      chain: creator.walletClient.chain,
    });
    quote = (await creator.publicClient.waitForTransactionReceipt({ hash: qTx })).contractAddress!;

    await wait(() =>
      creator.walletClient.writeContract({
        address: quote,
        abi: quoteAbi,
        functionName: 'mint',
        args: [buyer.deployer, 100n * WAD],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );
    await wait(() =>
      creator.walletClient.writeContract({
        address: quote,
        abi: quoteAbi,
        functionName: 'mint',
        args: [bidder.deployer, 100n * WAD],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );

    await wait(() =>
      seller.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'mint',
        args: [seller.deployer],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );
    listedTokenId = 1n;
    await wait(() =>
      seller.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'mint',
        args: [seller.deployer],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );
    auctionTokenId = 2n;

    await wait(() =>
      seller.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'setTokenRoyalty',
        args: [listedTokenId, royaltyTo.deployer, Number(ROYALTY_BPS)],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );
    await wait(() =>
      seller.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'setTokenRoyalty',
        args: [auctionTokenId, royaltyTo.deployer, Number(ROYALTY_BPS)],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );
  }, 120_000);

  it('mint credits the recipient and royaltyInfo matches the set bps', async () => {
    const owner = (await creator.publicClient.readContract({
      address: nft,
      abi: nftAbi,
      functionName: 'ownerOf',
      args: [listedTokenId],
    })) as Address;
    expect(owner.toLowerCase()).toBe(seller.deployer.toLowerCase());

    const info = (await creator.publicClient.readContract({
      address: nft,
      abi: nftAbi,
      functionName: 'royaltyInfo',
      args: [listedTokenId, PRICE],
    })) as [Address, bigint];
    expect(info[0].toLowerCase()).toBe(royaltyTo.deployer.toLowerCase());
    expect(info[1]).toBe(ROYALTY);
  });

  it('buy pays royalty on-chain (not skippable) and remainder to seller', async () => {
    await wait(() =>
      seller.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'approve',
        args: [market, listedTokenId],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );
    await wait(() =>
      seller.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'list',
        args: [nft, listedTokenId, quote, PRICE],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );

    const sellerBefore = await bal(seller.deployer);
    const royaltyBefore = await bal(royaltyTo.deployer);

    await wait(() =>
      buyer.walletClient.writeContract({
        address: quote,
        abi: quoteAbi,
        functionName: 'approve',
        args: [market, PRICE],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
    await wait(() =>
      buyer.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'buy',
        args: [1n],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );

    const newOwner = (await creator.publicClient.readContract({
      address: nft,
      abi: nftAbi,
      functionName: 'ownerOf',
      args: [listedTokenId],
    })) as Address;
    expect(newOwner.toLowerCase()).toBe(buyer.deployer.toLowerCase());

    expect(await bal(royaltyTo.deployer)).toBe(royaltyBefore + ROYALTY);
    expect(await bal(seller.deployer)).toBe(sellerBefore + (PRICE - ROYALTY));
    expect(ROYALTY).toBeGreaterThan(0n);
  });

  it('reverts when the buyer has not approved enough quote', async () => {
    await wait(() =>
      buyer.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'approve',
        args: [market, listedTokenId],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
    await wait(() =>
      buyer.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'list',
        args: [nft, listedTokenId, quote, PRICE],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    );
    await expect(
      buyer.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'buy',
        args: [2n],
        account: buyer.walletClient.account!,
        chain: buyer.walletClient.chain,
      }),
    ).rejects.toThrow();
  });

  it('endAuction pays the highest bid with the same royalty split', async () => {
    await wait(() =>
      seller.walletClient.writeContract({
        address: nft,
        abi: nftAbi,
        functionName: 'approve',
        args: [market, auctionTokenId],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );
    await wait(() =>
      seller.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'startAuction',
        args: [nft, auctionTokenId, quote, PRICE, 60],
        account: seller.walletClient.account!,
        chain: seller.walletClient.chain,
      }),
    );

    const royaltyBefore = await bal(royaltyTo.deployer);
    const sellerBefore = await bal(seller.deployer);

    await wait(() =>
      bidder.walletClient.writeContract({
        address: quote,
        abi: quoteAbi,
        functionName: 'approve',
        args: [market, PRICE],
        account: bidder.walletClient.account!,
        chain: bidder.walletClient.chain,
      }),
    );
    await wait(() =>
      bidder.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'bid',
        args: [1n, PRICE],
        account: bidder.walletClient.account!,
        chain: bidder.walletClient.chain,
      }),
    );

    await warp(61);
    await wait(() =>
      creator.walletClient.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'endAuction',
        args: [1n],
        account: creator.walletClient.account!,
        chain: creator.walletClient.chain,
      }),
    );

    const newOwner = (await creator.publicClient.readContract({
      address: nft,
      abi: nftAbi,
      functionName: 'ownerOf',
      args: [auctionTokenId],
    })) as Address;
    expect(newOwner.toLowerCase()).toBe(bidder.deployer.toLowerCase());
    expect(await bal(royaltyTo.deployer)).toBe(royaltyBefore + ROYALTY);
    expect(await bal(seller.deployer)).toBe(sellerBefore + (PRICE - ROYALTY));
  });
});
