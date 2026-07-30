import { beforeAll, describe, expect, it } from 'vitest';
import { keccak256, toHex, type Address, type Hex } from 'viem';
import { computeAccountAddress, DEFAULT_USER_SALT, minimalProxyInitCode } from './address.js';
import { loadArtifact } from '../chain/artifacts.js';
// .ts helper under scripts/, deliberately outside the service build — it is the
// only file in this repository holding a private key, and it is a public one.
import {
  assertDisposableChain,
  deployAccountSuite,
  devChainClients,
  devChainReachable,
  devChainRequired,
  devRpcUrl,
  DEV_CHAIN_ID,
} from '../../scripts/dev-chain.js';

/**
 * Vitest runs test files in parallel workers. Each live-chain file deploys its
 * own suite, so each takes a DIFFERENT one of anvil's ten funded accounts —
 * otherwise two workers race the same nonce and one fails with `nonce too low`
 * on a chain that is behaving perfectly. Index 0 belongs to `deploy-dev.ts`.
 */
const DEPLOYER_INDEX = 1;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHECK THIS REPOSITORY HAS NEVER BEEN ABLE TO RUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `address.ts` derives a smart account address in TypeScript.
 * `AccountFactory.getAddress` derives it in Solidity, in hand-written EVM
 * assembly. Two independent implementations of the same CREATE2 arithmetic —
 * and until a local chain existed, the Solidity one had never been executed by
 * anybody, so nothing had ever confirmed the two agree.
 *
 * `address.test.ts` pins the EIP-1167 byte layout against constants in this
 * repository. That is a test of TypeScript against TypeScript. It cannot catch
 * the case where BOTH sides of that comparison are wrong about what the
 * factory does, which is precisely the case that costs money:
 *
 *   the product shows a user their address during onboarding
 *   → the user funds it before anything is deployed (the whole point of §17.4)
 *   → the factory deploys their account to a DIFFERENT address
 *   → the funds sit at an address with no code and no owner, permanently
 *
 * Nothing is stolen. It is simply gone. This file is what rules that out, by
 * asking the deployed factory itself.
 *
 * ── When this runs ─────────────────────────────────────────────────────────
 *
 * It needs a chain. Locally: `docker compose up -d evm`. Without one it skips,
 * loudly — the same bargain `packages/db` strikes for Postgres. On CI,
 * `REQUIRE_EVM_CHAIN=1` turns a missing chain into a hard failure, because a
 * suite that silently skips is how "we proved CREATE2 agrees" quietly stops
 * being true.
 *
 * It deploys its own factory rather than reading addresses out of the
 * environment. A test that depends on somebody having run the deploy script
 * first is a test that fails for reasons unrelated to the code under test.
 */

const rpcUrl = devRpcUrl();
const reachable = await devChainReachable(rpcUrl);

if (!reachable && devChainRequired()) {
  throw new Error(
    `REQUIRE_EVM_CHAIN=1 but no EVM RPC answered at ${rpcUrl}. The CREATE2 cross-check is the one test that ` +
      `proves an address shown to a user is the address the factory will deploy to; it must not be skipped on CI. ` +
      `Start it with: docker compose up -d evm`,
  );
}

/** The public ERC-4337 v0.7 singleton. Not deployed on a fresh dev chain; the
 *  implementation only requires the address to be non-zero at construction. */
const ENTRYPOINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

/** Deterministic owners, chosen to move bytes around rather than to look real. */
const OWNERS: Address[] = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x0000000000000000000000000000000000000001',
  '0xffffffffffffffffffffffffffffffffffffffff',
  '0x00000000000000000000000000000000000000ff',
];

const SALTS: Hex[] = [
  DEFAULT_USER_SALT,
  `0x${'11'.repeat(32)}`,
  `0x${'ff'.repeat(32)}`,
  `0x${'00'.repeat(31)}01`,
  keccak256(toHex('intafaced:named-space:trading')),
];

describe.skipIf(!reachable)('CREATE2 — the TypeScript derivation against the deployed factory', () => {
  let factory: Address;
  let implementation: Address;
  let read: (owner: Address, salt: Hex) => Promise<Address>;

  beforeAll(async () => {
    const clients = devChainClients(rpcUrl, DEV_CHAIN_ID, DEPLOYER_INDEX);
    await assertDisposableChain(clients.publicClient);

    const suite = await deployAccountSuite(clients, ENTRYPOINT);
    factory = suite.factory;
    implementation = suite.implementation;

    const abi = loadArtifact('AccountFactory').abi;
    read = async (owner, salt) =>
      (await clients.publicClient.readContract({ address: factory, abi, functionName: 'getAddress', args: [owner, salt] })) as Address;
  }, 60_000);

  it('deployed a factory that points at the implementation it was given', async () => {
    expect(factory).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(implementation).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(factory.toLowerCase()).not.toBe(implementation.toLowerCase());
  });

  /** THE ONE THAT MATTERS. 25 owner/salt pairs, both derivations, byte for byte. */
  it.each(OWNERS.flatMap((owner) => SALTS.map((userSalt) => ({ owner, userSalt }))))(
    'agrees for owner $owner salt $userSalt',
    async ({ owner, userSalt }) => {
      const offChain = computeAccountAddress({ factory, implementation, owner, userSalt });
      const onChain = await read(owner, userSalt);
      expect(offChain.toLowerCase()).toBe(onChain.toLowerCase());
    },
  );

  it('binds the owner into the salt — two owners never share an address', async () => {
    const [a, b] = [await read(OWNERS[0]!, DEFAULT_USER_SALT), await read(OWNERS[1]!, DEFAULT_USER_SALT)];
    expect(a.toLowerCase()).not.toBe(b.toLowerCase());
  });

  it('gives one owner a distinct address per userSalt (§23 named spaces)', async () => {
    const addresses = await Promise.all(SALTS.map(async (salt) => (await read(OWNERS[0]!, salt)).toLowerCase()));
    expect(new Set(addresses).size).toBe(SALTS.length);
  });
});

describe.skipIf(!reachable)('the predicted address is where the account actually lands', () => {
  let factory: Address;
  let implementation: Address;
  let clients: ReturnType<typeof devChainClients>;

  beforeAll(async () => {
    clients = devChainClients(rpcUrl, DEV_CHAIN_ID, DEPLOYER_INDEX);
    const suite = await deployAccountSuite(clients, ENTRYPOINT);
    factory = suite.factory;
    implementation = suite.implementation;
  }, 60_000);

  /**
   * The full promise of §17.4, end to end: an address exists before the account
   * does, a user could fund it, and deploying later puts THEIR account there.
   */
  it('has no code before deployment and the user own account after', async () => {
    // Deliberately NOT one of the anvil accounts, and never the deployer: the
    // point of the last assertion is that paying for a deployment grants the
    // payer nothing.
    const owner: Address = '0x00000000000000000000000000000000000000A1';
    const abi = loadArtifact('AccountFactory').abi;
    const predicted = computeAccountAddress({ factory, implementation, owner, userSalt: DEFAULT_USER_SALT });

    const before = await clients.publicClient.getCode({ address: predicted });
    expect(before ?? '0x').toBe('0x');

    const hash = await clients.walletClient.writeContract({
      address: factory,
      abi,
      functionName: 'createAccount',
      args: [owner, DEFAULT_USER_SALT],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');

    const after = await clients.publicClient.getCode({ address: predicted });
    expect(after, 'the account did not land at the predicted address').toBeDefined();
    expect(after).not.toBe('0x');

    /**
     * A relayer paid the gas. The owner is still the user, because the owner is
     * bound into the salt and the factory initialises the clone with it. If this
     * ever came back as the deployer, `createAccount` would be a way to take an
     * account somebody else was shown.
     */
    const onChainOwner = await clients.publicClient.readContract({
      address: predicted,
      abi: loadArtifact('SmartAccount').abi,
      functionName: 'owner',
    });
    expect((onChainOwner as string).toLowerCase()).toBe(owner.toLowerCase());
    expect((onChainOwner as string).toLowerCase()).not.toBe(clients.deployer.toLowerCase());
  }, 60_000);

  /**
   * The deployed account is the EIP-1167 runtime this repository builds its
   * init code from — not merely *an* address with code. If the runtime differed,
   * the address arithmetic would still agree and the account would delegate
   * somewhere nobody chose.
   */
  it('deploys exactly the minimal proxy this repo derives addresses from', async () => {
    const owner = OWNERS[2]!;
    const abi = loadArtifact('AccountFactory').abi;
    const predicted = computeAccountAddress({ factory, implementation, owner, userSalt: DEFAULT_USER_SALT });

    const hash = await clients.walletClient.writeContract({
      address: factory,
      abi,
      functionName: 'createAccount',
      args: [owner, DEFAULT_USER_SALT],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    await clients.publicClient.waitForTransactionReceipt({ hash });

    const runtime = (await clients.publicClient.getCode({ address: predicted })) ?? '0x';
    // Init code = 10-byte constructor ++ runtime. Strip the constructor and the
    // rest must be byte-identical to what CREATE2 was told to hash.
    const initCode = minimalProxyInitCode(implementation);
    expect(runtime.toLowerCase()).toBe(`0x${initCode.slice(2 + 20).toLowerCase()}`);
    expect(runtime.toLowerCase()).toContain(implementation.slice(2).toLowerCase());
  }, 60_000);

  /** Idempotent by design: a relayer racing itself is normal, not an error. */
  it('returns the existing account instead of reverting on a second createAccount', async () => {
    const owner = OWNERS[3]!;
    const abi = loadArtifact('AccountFactory').abi;
    const args = [owner, DEFAULT_USER_SALT] as const;

    for (const _attempt of [1, 2]) {
      const hash = await clients.walletClient.writeContract({
        address: factory,
        abi,
        functionName: 'createAccount',
        args,
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      });
      expect((await clients.publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    }

    const isDeployed = await clients.publicClient.readContract({ address: factory, abi, functionName: 'isDeployed', args });
    expect(isDeployed).toBe(true);
  }, 60_000);
});
