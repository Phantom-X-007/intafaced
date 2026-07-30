import { createPublicClient, createWalletClient, defineChain, getContract, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { Address, Hex, HDAccount, PublicClient, WalletClient } from 'viem';
import { loadArtifact } from '../src/chain/artifacts.js';

/**
 * THE LOCAL DEV CHAIN — everything that must never reach production.
 *
 * This file lives in `scripts/`, not `src/`, and that is load-bearing.
 * `tsconfig.json` includes only `src/**`, so nothing here is compiled into
 * `dist/` and nothing here can be imported by the running service. `env.ts`
 * states that svc-protocol holds no signing key of any kind; that statement
 * stays true of the shipped service because the only key in this repository
 * sits in a file the service cannot reach.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MNEMONIC BELOW IS PUBLIC. IT IS SUPPOSED TO BE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `test test test test test test test test test test test junk` is the phrase
 * Foundry, Hardhat and Ganache all print to the terminal on every start. It is
 * in their documentation, in thousands of repositories, and in every tutorial
 * ever written about local EVM development. Anyone can spend anything its
 * accounts hold on any chain, which is exactly why it must only ever touch a
 * chain whose entire state is disposable.
 *
 * `assertDisposableChain` below is what enforces that. It refuses to sign
 * anything unless the endpoint identifies itself as anvil/hardhat AND reports
 * the dev chain id. A fat-fingered `PROTOCOL_RPC_URL` pointing at a real
 * network gets a refusal, not a transaction.
 *
 * If you are reading this because you want to deploy for real: you do not want
 * this file. A production deployment is a key-management decision, made by a
 * human, with a key this repository has never seen.
 */

/** Anvil/Hardhat's default local chain id. */
export const DEV_CHAIN_ID = 31337;

/**
 * PUBLIC, WELL-KNOWN, WORTHLESS. See the banner above. Named so that no reader
 * and no scanner can mistake it for a credential.
 */
export const PUBLIC_ANVIL_DEV_MNEMONIC = 'test test test test test test test test test test test junk';

/** Anvil account #0's address — the deployer `chain:deploy` uses. */
export const PUBLIC_ANVIL_DEV_ACCOUNT_0_ADDRESS: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/**
 * One of anvil's ten pre-funded accounts.
 *
 * Test files take DIFFERENT indices on purpose. Vitest runs files in parallel
 * workers, they all deploy their own suite, and a shared deployer means two
 * workers racing the same nonce — which surfaces as `nonce too low` in whichever
 * one loses, intermittently, on a chain that is behaving perfectly. Index 0 is
 * reserved for `deploy-dev.ts`, because the addresses it produces are the ones
 * named in docker-compose.apps.yml and they depend on that account's nonce.
 */
export function devAccount(index = 0): HDAccount {
  return mnemonicToAccount(PUBLIC_ANVIL_DEV_MNEMONIC, { addressIndex: index });
}

export const devChain = (rpcUrl: string, chainId: number = DEV_CHAIN_ID) =>
  defineChain({
    id: chainId,
    name: `intafaced-dev-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

/** Where the dev chain is, honouring the same env the service reads. */
export function devRpcUrl(): string {
  return process.env.PROTOCOL_RPC_URL ?? 'http://127.0.0.1:8545';
}

/**
 * Refuse to sign against anything that is not a disposable local node.
 *
 * Two independent checks, because either alone is bypassable by accident:
 *   · `web3_clientVersion` must name anvil or hardhat. A real node does not.
 *   · the chain id must be the dev id. Somebody could run anvil forked from
 *     mainnet with `--chain-id 1`; that node's state is not disposable in the
 *     sense that matters, because a broadcast could reach the real network.
 */
export async function assertDisposableChain(client: PublicClient, expectedChainId = DEV_CHAIN_ID): Promise<string> {
  const version = (await client.request({ method: 'web3_clientVersion' } as never)) as string;
  if (!/anvil|hardhat/i.test(version)) {
    throw new Error(
      `REFUSING to use the public dev key against "${version}". This script only ever signs on a throwaway ` +
        `anvil/hardhat node. Point PROTOCOL_RPC_URL at the compose \`evm\` service (docker compose up -d evm).`,
    );
  }
  const observed = await client.getChainId();
  if (observed !== expectedChainId) {
    throw new Error(
      `REFUSING: the node at this endpoint reports chain ${observed}, not the dev chain ${expectedChainId}. ` +
        `A dev key must never sign on a chain whose state somebody depends on.`,
    );
  }
  return version;
}

export interface DevChainClients {
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly deployer: Address;
  readonly rpcUrl: string;
}

export function devChainClients(rpcUrl = devRpcUrl(), chainId = DEV_CHAIN_ID, accountIndex = 0): DevChainClients {
  const chain = devChain(rpcUrl, chainId);
  const account = devAccount(accountIndex);
  return {
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient,
    walletClient: createWalletClient({ account, chain, transport: http(rpcUrl) }),
    deployer: account.address,
    rpcUrl,
  };
}

/** True when a JSON-RPC endpoint answers at all. Never throws. */
export async function devChainReachable(rpcUrl = devRpcUrl()): Promise<boolean> {
  try {
    const client = createPublicClient({ chain: devChain(rpcUrl), transport: http(rpcUrl, { timeout: 2_000, retryCount: 0 }) });
    await client.getChainId();
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirrors `postgresRequired()` in `packages/db`: a suite may skip on a laptop
 * with no chain running, but on CI a missing chain is a hard failure. Silent
 * green is how "we proved CREATE2 agrees" quietly stops being true.
 */
export function devChainRequired(): boolean {
  return process.env.REQUIRE_EVM_CHAIN === '1';
}

export interface DeployedSuite {
  readonly implementation: Address;
  readonly factory: Address;
  readonly entryPoint: Address;
  readonly implementationTx: Hex;
  readonly factoryTx: Hex;
}

/**
 * Deploy the smart-account suite: the SmartAccount implementation, then the
 * AccountFactory that clones it.
 *
 * The EntryPoint is passed through, not deployed. It is the public ERC-4337
 * v0.7 singleton and we do not own it — see `deploy-dev.ts` for what that means
 * for the dev chain.
 */
export async function deployAccountSuite(clients: DevChainClients, entryPoint: Address): Promise<DeployedSuite> {
  const { publicClient, walletClient } = clients;
  const account = walletClient.account;
  if (!account) throw new Error('deployAccountSuite needs a wallet client with an account');

  const smartAccount = loadArtifact('SmartAccount');
  const factory = loadArtifact('AccountFactory');

  const implementationTx = await walletClient.deployContract({
    abi: smartAccount.abi,
    bytecode: smartAccount.bytecode,
    args: [entryPoint],
    account,
    chain: walletClient.chain,
  });
  const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implementationTx });
  if (implReceipt.status !== 'success' || !implReceipt.contractAddress) {
    throw new Error(`SmartAccount deployment failed: ${implementationTx}`);
  }

  const factoryTx = await walletClient.deployContract({
    abi: factory.abi,
    bytecode: factory.bytecode,
    args: [implReceipt.contractAddress],
    account,
    chain: walletClient.chain,
  });
  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryTx });
  if (factoryReceipt.status !== 'success' || !factoryReceipt.contractAddress) {
    throw new Error(`AccountFactory deployment failed: ${factoryTx}`);
  }

  // The factory hard-codes the implementation into every clone it makes. If it
  // did not get the one we just deployed, every address derived below is wrong.
  const onChainImplementation = await publicClient.readContract({
    address: factoryReceipt.contractAddress,
    abi: factory.abi,
    functionName: 'implementation',
  });
  if ((onChainImplementation as string).toLowerCase() !== implReceipt.contractAddress.toLowerCase()) {
    throw new Error(`AccountFactory.implementation is ${String(onChainImplementation)}, expected ${implReceipt.contractAddress}`);
  }

  return {
    implementation: implReceipt.contractAddress,
    factory: factoryReceipt.contractAddress,
    entryPoint,
    implementationTx,
    factoryTx,
  };
}

/** The deployed factory, ready to read. */
export function accountFactoryAt(clients: DevChainClients, address: Address) {
  return getContract({ address, abi: loadArtifact('AccountFactory').abi, client: clients.publicClient });
}
