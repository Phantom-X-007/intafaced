/**
 * One-shot LaunchVesting on Base Sepolia. Own L1 stays parked.
 *
 *   PROTOCOL_CHAIN_ID=84532 PROTOCOL_RPC_URL=… PROTOCOL_DEPLOYER_KEY=… \
 *   PROTOCOL_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
 *   PROTOCOL_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
 *   pnpm --filter @intafaced/svc-protocol exec tsx scripts/deploy-sepolia-vesting.ts
 *
 * Never logs the key. Skip-if-named.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, getContractAddress, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadArtifact } from '../src/chain/artifacts.js';
import { assertSepoliaRegistry, type DeploymentRegistry } from '../src/deployments/registry.js';
import { createAddressAfterOneTx, namedAddress, parseSepoliaDeployEnv, SEPOLIA_CHAIN_ID } from './sepolia-deploy-env.js';

const TEST = '0x780627a9d781edf08bd81fbf2263fa85dd8c135e' as Address;
const TOTAL = 10n ** 18n;

const sepolia = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: 'base-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
});

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = join(here, '../deployments/base-sepolia.json');

export async function deploySepoliaVesting(env: NodeJS.ProcessEnv = process.env): Promise<{
  address: Address;
  tx: Hex;
  skipped: boolean;
}> {
  const cfg = parseSepoliaDeployEnv(env);
  const account = privateKeyToAccount(cfg.deployerKey);
  const chain = { ...sepolia, rpcUrls: { default: { http: [cfg.rpcUrl] } } };
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const wallet = createWalletClient({ chain, transport: http(cfg.rpcUrl), account });
  if ((await publicClient.getChainId()) !== SEPOLIA_CHAIN_ID) throw new Error('not 84532');

  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as DeploymentRegistry;
  assertSepoliaRegistry(registry);

  const existing = namedAddress(registry.contracts, 'LaunchVesting');
  if (existing) {
    console.log('skip LaunchVesting', existing);
    return { address: existing, tx: '0x' as Hex, skipped: true };
  }

  const now = BigInt((await publicClient.getBlock()).timestamp);
  const nonce = await publicClient.getTransactionCount({ address: account.address });
  const testArt = loadArtifact('MockERC20');
  const art = loadArtifact('LaunchVesting');
  const createHere = getContractAddress({ from: account.address, nonce: BigInt(nonce) });
  const already = (await publicClient.readContract({
    address: TEST,
    abi: testArt.abi,
    functionName: 'allowance',
    args: [account.address, createHere],
  })) as bigint;

  let vestingAddr: Address;
  let deployNonce: number;
  if (already >= TOTAL) {
    // Prior approve landed; the CREATE tx itself reverted in simulation and never broadcast.
    vestingAddr = createHere;
    deployNonce = nonce;
    console.log('reuse allowance', vestingAddr, 'nonce', deployNonce);
  } else {
    vestingAddr = createAddressAfterOneTx(account.address, nonce);
    deployNonce = nonce + 1;
    const ap = await wallet.writeContract({
      address: TEST,
      abi: testArt.abi,
      functionName: 'approve',
      args: [vestingAddr, TOTAL],
      account,
      chain: wallet.chain,
      nonce,
      gas: 80_000n,
    });
    const apRc = await publicClient.waitForTransactionReceipt({ hash: ap });
    if (apRc.status !== 'success') throw new Error(`approve failed ${ap}`);
  }

  const hash = await wallet.deployContract({
    abi: art.abi,
    bytecode: art.bytecode,
    args: [TEST, account.address, now, 0n, 1n, TOTAL],
    account,
    chain: wallet.chain,
    nonce: deployNonce,
    gas: 2_000_000n,
  });
  const rc = await publicClient.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success' || !rc.contractAddress) throw new Error(`LaunchVesting failed ${hash}`);
  if (rc.contractAddress.toLowerCase() !== vestingAddr.toLowerCase()) {
    throw new Error(`LaunchVesting ${rc.contractAddress} != predicted ${vestingAddr}`);
  }

  registry.contracts.push({
    name: 'LaunchVesting',
    address: rc.contractAddress,
    sourceHash: art.sourceHash,
    suite: art.suite,
    explorerUrl: `https://sepolia.basescan.org/address/${rc.contractAddress}`,
    verified: false,
  });
  registry.deployedAt = new Date().toISOString();
  assertSepoliaRegistry(registry);
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log('LaunchVesting', rc.contractAddress, hash);
  return { address: rc.contractAddress, tx: hash, skipped: false };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith('deploy-sepolia-vesting.ts');
if (isMain || process.argv[1]?.includes('deploy-sepolia-vesting')) {
  await deploySepoliaVesting();
}
