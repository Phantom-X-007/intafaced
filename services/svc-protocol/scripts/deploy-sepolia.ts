/**
 * Deploy the Protocol suite to Base Sepolia (84532).
 *
 *   PROTOCOL_CHAIN_ID=84532 \
 *   PROTOCOL_RPC_URL=https://sepolia.base.org \
 *   PROTOCOL_DEPLOYER_KEY=0x… \
 *   PROTOCOL_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
 *   PROTOCOL_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
 *   pnpm --filter @intafaced/svc-protocol exec tsx scripts/deploy-sepolia.ts
 *
 * Never uses the anvil key. Never writes the key. deploy-dev.ts stays throwaway.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, keccak256, stringToHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadArtifact, type ArtifactName } from '../src/chain/artifacts.js';
import { assertSepoliaRegistry, type DeploymentRegistry } from '../src/deployments/registry.js';
import { parseSepoliaDeployEnv, SEPOLIA_CHAIN_ID } from './sepolia-deploy-env.js';

const MARKET_ID = keccak256(stringToHex('TEST/USDC'));

const sepolia = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: 'base-sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
});

async function deployNamed(
  wallet: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  name: ArtifactName,
  args: readonly unknown[] = [],
): Promise<{ address: Address; tx: Hex; sourceHash: Hex; suite: string }> {
  const art = loadArtifact(name);
  const account = wallet.account;
  if (!account) throw new Error('wallet has no account');
  const hash = await wallet.deployContract({
    abi: art.abi,
    bytecode: art.bytecode,
    args: args as never,
    account,
    chain: wallet.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`${name} deploy failed ${hash}`);
  }
  return { address: receipt.contractAddress, tx: hash, sourceHash: art.sourceHash, suite: art.suite };
}

export async function deploySepoliaSuite(env: NodeJS.ProcessEnv = process.env): Promise<DeploymentRegistry> {
  const cfg = parseSepoliaDeployEnv(env);
  const account = privateKeyToAccount(cfg.deployerKey);
  const chain = { ...sepolia, rpcUrls: { default: { http: [cfg.rpcUrl] } } };
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const wallet = createWalletClient({ chain, transport: http(cfg.rpcUrl), account });

  const reported = await publicClient.getChainId();
  if (reported !== SEPOLIA_CHAIN_ID) {
    throw new Error(`RPC chainId ${reported} is not ${SEPOLIA_CHAIN_ID}`);
  }

  const usdcCode = await publicClient.getCode({ address: cfg.usdc });
  if (!usdcCode || usdcCode === '0x') throw new Error('USDC has no code on this RPC');
  const usdcDec = (await publicClient.readContract({
    address: cfg.usdc,
    abi: [{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
    functionName: 'decimals',
  })) as number;
  if (usdcDec !== 6) throw new Error(`USDC decimals() is ${usdcDec}, want 6`);

  const bal = await publicClient.getBalance({ address: account.address });
  if (bal === 0n) throw new Error('deployer ETH balance is 0 — faucet Sepolia ETH');

  const contracts: DeploymentRegistry['contracts'] = [];
  const push = (name: string, row: { address: Address; sourceHash: Hex; suite: string }) => {
    contracts.push({
      name,
      address: row.address,
      sourceHash: row.sourceHash,
      suite: row.suite,
      explorerUrl: `https://sepolia.basescan.org/address/${row.address}`,
      verified: false,
    });
  };

  const testToken = await deployNamed(wallet, publicClient, 'MockERC20');
  push('TEST', testToken);

  const smartAccount = loadArtifact('SmartAccount');
  const implTx = await wallet.deployContract({
    abi: smartAccount.abi,
    bytecode: smartAccount.bytecode,
    args: [cfg.entryPoint],
    account,
    chain: wallet.chain,
  });
  const implRc = await publicClient.waitForTransactionReceipt({ hash: implTx });
  if (!implRc.contractAddress) throw new Error('SmartAccount deploy failed');
  push('SmartAccount', {
    address: implRc.contractAddress,
    sourceHash: smartAccount.sourceHash,
    suite: smartAccount.suite,
  });

  const factoryArt = loadArtifact('AccountFactory');
  const facTx = await wallet.deployContract({
    abi: factoryArt.abi,
    bytecode: factoryArt.bytecode,
    args: [implRc.contractAddress],
    account,
    chain: wallet.chain,
  });
  const facRc = await publicClient.waitForTransactionReceipt({ hash: facTx });
  if (!facRc.contractAddress) throw new Error('AccountFactory deploy failed');
  push('AccountFactory', {
    address: facRc.contractAddress,
    sourceHash: factoryArt.sourceHash,
    suite: factoryArt.suite,
  });

  const tokenFactory = await deployNamed(wallet, publicClient, 'TokenFactory');
  push('TokenFactory', tokenFactory);
  const poolFactory = await deployNamed(wallet, publicClient, 'PoolFactory');
  push('PoolFactory', poolFactory);

  const venue = await deployNamed(wallet, publicClient, 'SovereignVenue', [
    MARKET_ID,
    testToken.address,
    cfg.usdc,
    0,
    '0x0000000000000000000000000000000000000000',
  ]);
  push('SovereignVenue', venue);

  const paymaster = await deployNamed(wallet, publicClient, 'ScopedPaymaster', [cfg.entryPoint, account.address]);
  push('ScopedPaymaster', paymaster);

  const escrow = await deployNamed(wallet, publicClient, 'SovereignEscrow');
  push('SovereignEscrow', escrow);

  const registry: DeploymentRegistry = {
    chainId: SEPOLIA_CHAIN_ID,
    chainName: 'base-sepolia',
    rpcNote: 'Base Sepolia testnet. Not INTACHAIN. audited:false.',
    deployedAt: new Date().toISOString(),
    contracts,
  };
  assertSepoliaRegistry(registry);
  return registry;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const registry = await deploySepoliaSuite();
  const out = join(dirname(fileURLToPath(import.meta.url)), '../deployments/base-sepolia.json');
  writeFileSync(out, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`wrote ${out}`);
  for (const c of registry.contracts) {
    console.log(`${c.name} ${c.address}`);
  }
}
