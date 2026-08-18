/**
 * S-G3 honesty — hermetic. Royalty is paid on the sale path, not signalling-only.
 * No platform fee, no market owner.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, '..', '..', 'contracts');
const nftSrc = readFileSync(join(contractsDir, 'nft/SovereignNft.sol'), 'utf8');
const marketSrc = readFileSync(join(contractsDir, 'nft/RoyaltyMarket.sol'), 'utf8');

function abiFnNames(name: 'SovereignNft' | 'RoyaltyMarket'): string[] {
  const names: string[] = [];
  for (const item of loadArtifact(name).abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

describe('S-G3 honesty · on-chain royalty enforcement', () => {
  it('SovereignNft caps royalty at 1000 bps and exposes ERC-2981 royaltyInfo', () => {
    expect(nftSrc).toMatch(/MAX_ROYALTY_BPS = 1_000/);
    expect(nftSrc).toMatch(/function royaltyInfo\(/);
    expect(nftSrc).toMatch(/function setTokenRoyalty\(/);
    expect(nftSrc).toMatch(/interfaceId == 0x2a55205a/);
    expect(nftSrc).not.toMatch(/\bonlyAdmin\b/);
    expect(nftSrc).not.toMatch(/function pause\b/);
  });

  it('RoyaltyMarket buy and endAuction always split royalty (not skippable honour-system)', () => {
    expect(marketSrc).toMatch(/function buy\(/);
    expect(marketSrc).toMatch(/function endAuction\(/);
    expect(marketSrc).toMatch(/_splitHeld/);
    expect(marketSrc).toMatch(/royaltyInfo/);
    // Both sale exits must go through the split — a buy that skipped royalty is the product lie.
    const buyBody = marketSrc.slice(marketSrc.indexOf('function buy('), marketSrc.indexOf('function startAuction('));
    const endBody = marketSrc.slice(marketSrc.indexOf('function endAuction('), marketSrc.indexOf('function onERC721Received('));
    expect(buyBody).toMatch(/_takePayment|_splitHeld/);
    expect(endBody).toMatch(/_splitHeld/);
    expect(marketSrc).not.toMatch(/platformFee|PROTOCOL_FEE|houseFee/i);
    expect(marketSrc).not.toMatch(/address public owner/);
    expect(marketSrc).not.toMatch(/function owner\s*\(/);
  });

  it('ABI has mint/list/buy/auction + royaltyInfo and no fee/admin knobs', () => {
    const nft = abiFnNames('SovereignNft');
    expect(nft).toContain('mint');
    expect(nft).toContain('setTokenRoyalty');
    expect(nft).toContain('royaltyInfo');
    expect(nft).toContain('ownerOf');
    expect(nft).not.toContain('setAdmin');
    expect(nft).not.toContain('pause');

    const market = abiFnNames('RoyaltyMarket');
    for (const required of ['list', 'buy', 'cancel', 'startAuction', 'bid', 'endAuction']) {
      expect(market).toContain(required);
    }
    for (const forbidden of ['setFee', 'setOwner', 'setAdmin', 'pause', 'owner']) {
      expect(market, `leaked control: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
