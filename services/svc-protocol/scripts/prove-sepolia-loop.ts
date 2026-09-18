/**
 * Agent-doable Sepolia proofs after rooms exist. Never logs the key.
 * FairLaunch contribute, vesting register+claim, lending borrow refuse.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadArtifact } from '../src/chain/artifacts.js';
import { assertSepoliaRegistry, type DeploymentRegistry } from '../src/deployments/registry.js';
import { CIRCLE_USDC_BASE_SEPOLIA, namedAddress, parseSepoliaDeployEnv, SEPOLIA_CHAIN_ID } from './sepolia-deploy-env.js';

const TEST = '0x780627a9d781edf08bd81fbf2263fa85dd8c135e' as Address;
const CONTRIBUTE = 1_000_000n; // 1 USDC (6-dec) — raiseCap on the live FairLaunch

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
  const must = (name: string): Address => {
    const a = namedAddress(registry.contracts, name);
    if (!a) throw new Error(`missing ${name}`);
    return a;
  };

  const proofs: { name: string; tx?: Hex; note: string }[] = [];
  const wait = async (hash: Hex) => {
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    if (rc.status !== 'success') throw new Error(`tx reverted ${hash}`);
    return rc;
  };

  const vesting = must('LaunchVesting');
  const reputation = must('DeployerReputation');
  const fair = must('FairLaunch');
  const lending = must('IsolatedLendingMarket');
  const vestArt = loadArtifact('LaunchVesting');
  const repArt = loadArtifact('DeployerReputation');
  const fairArt = loadArtifact('FairLaunch');
  const lendArt = loadArtifact('IsolatedLendingMarket');
  const usdcArt = [
    {
      type: 'function',
      name: 'approve',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ type: 'bool' }],
    },
  ] as const;

  const noted = await publicClient.readContract({
    address: reputation,
    abi: repArt.abi,
    functionName: 'notedVesting',
    args: [vesting],
  });
  if (!noted) {
    const hash = await wallet.writeContract({
      address: reputation,
      abi: repArt.abi,
      functionName: 'registerVesting',
      args: [vesting],
      account,
      chain: wallet.chain,
      gas: 120_000n,
    });
    await wait(hash);
    proofs.push({ name: 'registerVesting', tx: hash, note: 'DeployerReputation noted' });
  } else {
    proofs.push({ name: 'registerVesting', note: 'already noted' });
  }

  const claimed = (await publicClient.readContract({
    address: vesting,
    abi: vestArt.abi,
    functionName: 'claimed',
  })) as bigint;
  if (claimed === 0n) {
    const hash = await wallet.writeContract({
      address: vesting,
      abi: vestArt.abi,
      functionName: 'claim',
      account,
      chain: wallet.chain,
      gas: 120_000n,
    });
    await wait(hash);
    proofs.push({ name: 'vesting.claim', tx: hash, note: 'duration=1s already elapsed' });
  } else {
    proofs.push({ name: 'vesting.claim', note: `already claimed ${claimed}` });
  }

  const funded = (await publicClient.readContract({
    address: fair,
    abi: fairArt.abi,
    functionName: 'funded',
  })) as boolean;
  const raised = (await publicClient.readContract({
    address: fair,
    abi: fairArt.abi,
    functionName: 'totalRaised',
  })) as bigint;
  if (funded && raised === 0n) {
    const ap = await wallet.writeContract({
      address: CIRCLE_USDC_BASE_SEPOLIA,
      abi: usdcArt,
      functionName: 'approve',
      args: [fair, CONTRIBUTE],
      account,
      chain: wallet.chain,
      gas: 80_000n,
    });
    await wait(ap);
    const hash = await wallet.writeContract({
      address: fair,
      abi: fairArt.abi,
      functionName: 'contribute',
      args: [CONTRIBUTE],
      account,
      chain: wallet.chain,
      gas: 200_000n,
    });
    await wait(hash);
    proofs.push({ name: 'FairLaunch.contribute', tx: hash, note: '1 USDC into open window' });
  } else {
    proofs.push({ name: 'FairLaunch.contribute', note: `funded=${funded} raised=${raised}` });
  }

  try {
    await publicClient.simulateContract({
      address: lending,
      abi: lendArt.abi,
      functionName: 'borrow',
      args: [1n],
      account: account.address,
    });
    proofs.push({ name: 'lending.borrow', note: 'UNEXPECTED success' });
  } catch (e) {
    const msg = (e as Error).message;
    proofs.push({
      name: 'lending.borrow',
      note:
        msg.includes('Unhealthy') || msg.includes('InsufficientLiquidity') || msg.includes('Oracle')
          ? `refuse-closed: ${msg.slice(0, 80)}`
          : `reverted: ${msg.slice(0, 80)}`,
    });
  }

  console.log(JSON.stringify(proofs, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith('prove-sepolia-loop.ts');
if (isMain || process.argv[1]?.includes('prove-sepolia-loop')) {
  await main();
}
