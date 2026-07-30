/**
 * DEPLOY THE SMART-ACCOUNT SUITE TO THE LOCAL DEV CHAIN.
 *
 *   docker compose up -d evm
 *   pnpm --filter @intafaced/svc-protocol chain:deploy
 *
 * ── What this is, and what it is emphatically not ───────────────────────────
 *
 * It is the thing that makes `predictAddress`, `buildDeployment`,
 * `sessionStatus` and `claimAccount` able to return a value on a laptop. Until
 * a chain exists and the factory is deployed on it, every one of those paths
 * refuses — correctly — and `PROTOCOL_FACTORY_ADDRESS` sits at `0x0`.
 *
 * It is NOT a deployment tool. It signs with a key printed in Foundry's own
 * documentation, it refuses to run against anything that is not a throwaway
 * anvil/hardhat node, and it has no notion of a deployment record, a verified
 * source, or an upgrade. Deploying this suite for real is a decision about key
 * custody that a human makes once, with a key this repository has never held.
 *
 * ── The check that actually matters ─────────────────────────────────────────
 *
 * `src/accounts/address.ts` derives a smart account address in TypeScript.
 * `AccountFactory.getAddress` derives it in Solidity, in EVM assembly. They are
 * two independent implementations of the same CREATE2 arithmetic, and until
 * tonight the second one had never been executed — so nothing had ever
 * confirmed they agree.
 *
 * If they disagree, the product shows a user an address during onboarding, the
 * user funds it, and the factory deploys their account somewhere else. The
 * money is not lost to an attacker; it is simply at an address with no code and
 * no owner, forever. That is the failure this script and
 * `src/accounts/create2-onchain.test.ts` exist to rule out.
 */
import { getAddress as toChecksum, getContractAddress, isAddress, type Address, type Hex } from 'viem';
import { computeAccountAddress, DEFAULT_USER_SALT } from '../src/accounts/address.js';
import { computeTokenAddress, DEFAULT_TOKEN_SALT } from '../src/launch/address.js';
import { parseTokenParams } from '../src/launch/params.js';
import { loadArtifact } from '../src/chain/artifacts.js';
import {
  accountFactoryAt,
  assertDisposableChain,
  deployAccountSuite,
  deployTokenFactory,
  devChainClients,
  DEV_CHAIN_ID,
  devRpcUrl,
  PUBLIC_ANVIL_DEV_ACCOUNT_0_ADDRESS,
} from './dev-chain.js';

const ENTRYPOINT_V07: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

function envAddress(key: string, fallback: Address): Address {
  const value = process.env[key];
  if (!value) return fallback;
  if (!isAddress(value, { strict: false })) throw new Error(`${key} is not an address: ${value}`);
  return value as Address;
}

const rpcUrl = devRpcUrl();
const chainId = Number(process.env.PROTOCOL_CHAIN_ID ?? DEV_CHAIN_ID);
const entryPoint = envAddress('PROTOCOL_ENTRYPOINT_ADDRESS', ENTRYPOINT_V07);

const clients = devChainClients(rpcUrl, chainId);
const { publicClient } = clients;

const clientVersion = await assertDisposableChain(publicClient, chainId);
console.log(`chain    ${chainId} via ${rpcUrl}  (${clientVersion})`);
console.log(`deployer ${clients.deployer}  — public anvil dev account #0, worthless by design`);

if (clients.deployer.toLowerCase() !== PUBLIC_ANVIL_DEV_ACCOUNT_0_ADDRESS.toLowerCase()) {
  throw new Error('the dev key no longer derives the dev address — dev-chain.ts has been edited');
}

/**
 * Idempotent by address, not by flag.
 *
 * A fresh anvil puts the deployer at nonce 0, so the suite always lands at the
 * same two CREATE addresses. Re-running after a redeploy of the *services*
 * should not mint a second factory at a new address and silently orphan every
 * account anyone predicted against the first one.
 */
const expected = {
  implementation: getContractAddress({ from: clients.deployer, nonce: 0n }),
  factory: getContractAddress({ from: clients.deployer, nonce: 1n }),
  // APPENDED at nonce 2, and it must stay appended. Nonces 0 and 1 are named as
  // defaults in docker-compose.apps.yml and .env.example; inserting a
  // deployment before them would silently move both and point the whole fleet
  // at addresses with no code.
  tokenFactory: getContractAddress({ from: clients.deployer, nonce: 2n }),
};

const factoryArtifact = loadArtifact('AccountFactory');
const existingFactoryCode = await publicClient.getCode({ address: expected.factory });

let deployed: { implementation: Address; factory: Address };

if (existingFactoryCode && existingFactoryCode !== '0x') {
  const linkedImplementation = (await publicClient.readContract({
    address: expected.factory,
    abi: factoryArtifact.abi,
    functionName: 'implementation',
  })) as Address;
  console.log('\nalready deployed at the deterministic addresses — reusing, not redeploying');
  deployed = { implementation: linkedImplementation, factory: expected.factory };
} else {
  const result = await deployAccountSuite(clients, entryPoint);
  console.log(`\nSmartAccount   ${result.implementation}  tx ${result.implementationTx}`);
  console.log(`AccountFactory ${result.factory}  tx ${result.factoryTx}`);
  deployed = { implementation: result.implementation, factory: result.factory };
}

/**
 * The cross-check. Solidity assembly on one side, viem's `getContractAddress`
 * on the other, over owners chosen to exercise the salt rather than one lucky
 * case: the zero-ish edge, a checksummed EOA, and a non-default userSalt.
 */
const factory = accountFactoryAt(clients, deployed.factory);
const cases: Array<{ owner: Address; userSalt: Hex; note: string }> = [
  { owner: PUBLIC_ANVIL_DEV_ACCOUNT_0_ADDRESS, userSalt: DEFAULT_USER_SALT, note: 'dev account, default salt' },
  {
    owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    userSalt: DEFAULT_USER_SALT,
    note: 'second dev account, default salt',
  },
  {
    owner: PUBLIC_ANVIL_DEV_ACCOUNT_0_ADDRESS,
    userSalt: `0x${'11'.repeat(32)}` as Hex,
    note: 'same owner, different userSalt (§23 named spaces)',
  },
  { owner: '0x0000000000000000000000000000000000000001', userSalt: DEFAULT_USER_SALT, note: 'low-byte owner' },
];

console.log('\nCREATE2 cross-check — TypeScript derivation vs the factory itself:');
let mismatches = 0;
for (const { owner, userSalt, note } of cases) {
  const offChain = computeAccountAddress({
    factory: deployed.factory,
    implementation: deployed.implementation,
    owner,
    userSalt,
  });
  const onChain = (await factory.read.getAddress([owner, userSalt])) as Address;
  const agree = offChain.toLowerCase() === onChain.toLowerCase();
  if (!agree) mismatches += 1;
  console.log(`  ${agree ? 'OK  ' : 'FAIL'} ${offChain}  ${agree ? '==' : '!='} ${onChain}   ${note}`);
}

if (mismatches > 0) {
  console.error(
    `\n${mismatches} MISMATCH(ES). Stop. An address shown to a user is not the address the factory would deploy to; ` +
      `anything funded there is unreachable. Do not wire these addresses anywhere.`,
  );
  process.exit(1);
}

/**
 * The launch factory (§8.4 `launch.token-factory`).
 *
 * Idempotent by address, exactly like the suite above: a fresh anvil puts the
 * deployer back at nonce 0, so re-running lands it at the same place rather
 * than minting a second factory that orphans every token address anyone was
 * shown against the first.
 */
const existingTokenFactoryCode = await publicClient.getCode({ address: expected.tokenFactory });
let tokenFactory: Address;

if (existingTokenFactoryCode && existingTokenFactoryCode !== '0x') {
  console.log('\nTokenFactory already deployed at the deterministic address — reusing, not redeploying');
  tokenFactory = expected.tokenFactory;
} else {
  const launch = await deployTokenFactory(clients);
  console.log(`\nTokenFactory   ${launch.factory}  tx ${launch.tx}`);
  tokenFactory = launch.factory;
}

/**
 * The same cross-check the accounts suite gets, for the same reason.
 *
 * `src/launch/address.ts` derives a token address in TypeScript;
 * `TokenFactory.getAddress` derives it in Solidity. A creator publishes the
 * address BEFORE the token exists, so a disagreement means everyone who acts on
 * that announcement sends funds to a contract that will never be deployed.
 *
 * The parameter sets move the encoding around rather than testing one lucky
 * case: boundary decimals, a fractional supply, and a multi-byte name.
 */
const tokenCases = [
  { name: 'Sovereign One', symbol: 'SOV', decimals: 18, totalSupply: '1000000', note: '18dp, whole supply' },
  { name: 'Zero Decimals', symbol: 'ZED', decimals: 0, totalSupply: '21000000', note: '0dp' },
  { name: 'Ünïcödé Tökén', symbol: 'ÜNÏ', decimals: 8, totalSupply: '1234.5678', note: 'multi-byte name, fractional supply' },
].map((c) => ({
  note: c.note,
  params: parseTokenParams({
    name: c.name,
    symbol: c.symbol,
    decimals: c.decimals,
    totalSupply: c.totalSupply,
    recipient: PUBLIC_ANVIL_DEV_ACCOUNT_0_ADDRESS,
  }),
}));

console.log('\nCREATE2 cross-check — TypeScript derivation vs the TokenFactory itself:');
let tokenMismatches = 0;
for (const { params, note } of tokenCases) {
  const offChain = computeTokenAddress({ factory: tokenFactory, creator: clients.deployer, params });
  const onChain = (await publicClient.readContract({
    address: tokenFactory,
    abi: loadArtifact('TokenFactory').abi,
    functionName: 'getAddress',
    args: [clients.deployer, DEFAULT_TOKEN_SALT, params],
  })) as Address;
  const agree = offChain.toLowerCase() === onChain.toLowerCase();
  if (!agree) tokenMismatches += 1;
  console.log(`  ${agree ? 'OK  ' : 'FAIL'} ${offChain}  ${agree ? '==' : '!='} ${onChain}   ${note}`);
}

if (tokenMismatches > 0) {
  console.error(
    `\n${tokenMismatches} MISMATCH(ES) on the token factory. Stop. A token address shown to a creator is not where the ` +
      `factory would deploy; anything sent there by an early buyer is unreachable. Do not wire this address anywhere.`,
  );
  process.exit(1);
}

console.log('\nAdd to .env (dev only — these are the deterministic anvil addresses):');
console.log(`PROTOCOL_CHAIN_ID=${chainId}`);
console.log(`PROTOCOL_RPC_URL=${rpcUrl}`);
// Checksummed: `env.ts` accepts either case, but a mixed-case address is the
// one a human can eyeball against what the terminal printed.
console.log(`PROTOCOL_FACTORY_ADDRESS=${toChecksum(deployed.factory)}`);
console.log(`PROTOCOL_IMPLEMENTATION_ADDRESS=${toChecksum(deployed.implementation)}`);
console.log(`PROTOCOL_TOKEN_FACTORY_ADDRESS=${toChecksum(tokenFactory)}`);
console.log(
  `\nNo EntryPoint and no bundler on this chain, so relayUserOperation still refuses. ` +
    `Reads, address prediction, deployment calldata and session state are live.`,
);
