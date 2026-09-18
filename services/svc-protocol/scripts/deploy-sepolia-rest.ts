/**
 * Remaining P0 rooms on Base Sepolia. Own L1 stays parked.
 * Reuses PROTOCOL_* env from deploy-sepolia.ts. Appends to base-sepolia.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadArtifact, type ArtifactName } from '../src/chain/artifacts.js';
import { assertSepoliaRegistry, type DeploymentRegistry } from '../src/deployments/registry.js';
import { createAddressAfterOneTx, namedAddress, parseSepoliaDeployEnv, SEPOLIA_CHAIN_ID } from './sepolia-deploy-env.js';

const TEST = '0x780627a9d781edf08bd81fbf2263fa85dd8c135e' as Address;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const POOL = '0x19F9639830DC27093Ff34f7E01Da8a26f1aE3D28' as Address;
const SA = '0xfb4f4D2385C3291E2601bf36d8c1Dc1c930f08E0' as Address;
const TOKEN_FACTORY = '0x2df184ca3191285b772b6f65bb310ff8117bf5fd' as Address;
const POOL_FACTORY = '0x0ddaf1c1d7b3cabb38b083052e73d4285dce8611' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const BURN_A = '0x0000000000000000000000000000000000000001' as Address;
const BURN_B = '0x0000000000000000000000000000000000000002' as Address;
/** NIST P-256 generator — valid point so PasskeyOwner constructs. Not a user key. */
const P256_GX = '0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' as Hex;
const P256_GY = '0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5' as Hex;

const sepolia = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: 'base-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
});

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = join(here, '../deployments/base-sepolia.json');

async function main() {
  const cfg = parseSepoliaDeployEnv();
  const account = privateKeyToAccount(cfg.deployerKey);
  const chain = { ...sepolia, rpcUrls: { default: { http: [cfg.rpcUrl] } } };
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const wallet = createWalletClient({ chain, transport: http(cfg.rpcUrl), account });
  if ((await publicClient.getChainId()) !== SEPOLIA_CHAIN_ID) throw new Error('not 84532');

  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as DeploymentRegistry;
  assertSepoliaRegistry(registry);

  const push = (name: string, address: Address, sourceHash: Hex, suite: string) => {
    if (registry.contracts.some((c) => c.name === name)) return;
    registry.contracts.push({
      name,
      address,
      sourceHash,
      suite,
      explorerUrl: `https://sepolia.basescan.org/address/${address}`,
      verified: false,
    });
  };

  const deploy = async (name: ArtifactName, args: readonly unknown[] = []) => {
    const existing = namedAddress(registry.contracts, name);
    if (existing) {
      console.log('skip', name, existing);
      return existing;
    }
    const art = loadArtifact(name);
    const hash = await wallet.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: args as never,
      account,
      chain: wallet.chain,
    });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success' || !rc.contractAddress) throw new Error(`${name} failed ${hash}`);
    console.log(name, rc.contractAddress, hash);
    push(name, rc.contractAddress, art.sourceHash, art.suite);
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    return rc.contractAddress;
  };

  const now = BigInt((await publicClient.getBlock()).timestamp);

  await deploy('SovereignRouter');
  await deploy('StealthAnnouncer');
  await deploy('RankAttestation');
  await deploy('DeployerReputation');
  await deploy('RoyaltyMarket');
  await deploy('PasskeyOwner', [P256_GX, P256_GY]);
  await deploy('UserElectedRecovery', [account.address, 1n]);
  await deploy('SovereignNft', ['P0 NFT', 'P0N']);
  await deploy('RwaRegistry', ['0x' + '00'.repeat(32)]);
  await deploy('TreasuryYieldVault', [TEST, '0x' + '00'.repeat(32)]);
  await deploy('MerchantAccept', [account.address, ZERO, 0]);
  await deploy('MemeLaunch', [TOKEN_FACTORY, POOL_FACTORY]);
  await deploy('CrewVault', [TEST, [account.address, SA], [5000, 5000], 1]);
  await deploy('LegacyVault', [TEST, 1n, 1n, 1n, 10_000, [SA], [10_000]]);

  const oracle = await deploy('FailClosedOracle', [BURN_A, BURN_B, 1, 1]);
  await deploy('IsolatedLendingMarket', [
    {
      collateralToken: TEST,
      borrowToken: USDC,
      oracle,
      collateralAssetForOracle: TEST,
      borrowAssetForOracle: USDC,
      maxLtvBps: 1,
      liquidationThresholdBps: 2,
      liquidationBonusBps: 0,
      closeFactorBps: 1,
      reserveFactorBps: 0,
      baseRateBps: 0,
      slope1Bps: 0,
      slope2Bps: 0,
      kinkBps: 1,
    },
  ]);

  const unlock = Number(now) + 86400;
  await deploy('LaunchLpLock', [TEST, account.address, unlock]);

  const testArt = loadArtifact('MockERC20');
  // Constructor transferFroms total_ from msg.sender. Approve the CREATE
  // address of the *next* tx (approve consumes current nonce).
  if (!namedAddress(registry.contracts, 'LaunchVesting')) {
    const nonce = await publicClient.getTransactionCount({ address: account.address });
    const vestingAddr = createAddressAfterOneTx(account.address, nonce);
    const ap2 = await wallet.writeContract({
      address: TEST,
      abi: testArt.abi,
      functionName: 'approve',
      args: [vestingAddr, 10n ** 18n],
      account,
      chain: wallet.chain,
      gas: 80_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: ap2 });
    const art = loadArtifact('LaunchVesting');
    const hash = await wallet.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: [TEST, account.address, now, 0n, 1n, 10n ** 18n],
      account,
      chain: wallet.chain,
      gas: 2_000_000n,
    });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success' || !rc.contractAddress) throw new Error(`LaunchVesting failed ${hash}`);
    if (rc.contractAddress.toLowerCase() !== vestingAddr.toLowerCase()) {
      throw new Error(`LaunchVesting ${rc.contractAddress} != predicted ${vestingAddr}`);
    }
    console.log('LaunchVesting', rc.contractAddress, hash);
    push('LaunchVesting', rc.contractAddress, art.sourceHash, art.suite);
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  } else {
    console.log('skip LaunchVesting', namedAddress(registry.contracts, 'LaunchVesting'));
  }

  await deploy('FairLaunch', [TEST, USDC, 10n ** 18n, 1_000_000n, 1n, now + 60n, now + 7n * 24n * 3600n, 0n, 0n, 1n]);

  registry.deployedAt = new Date().toISOString();
  assertSepoliaRegistry(registry);
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log('wrote', registryPath, 'contracts', registry.contracts.length);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith('deploy-sepolia-rest.ts');
if (isMain || process.argv[1]?.includes('deploy-sepolia-rest')) {
  await main();
}
