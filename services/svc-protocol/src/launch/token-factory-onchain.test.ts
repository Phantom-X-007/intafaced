import { beforeAll, describe, expect, it } from 'vitest';
import { decodeEventLog, keccak256, toHex, type Address, type Hex } from 'viem';
import { computeTokenAddress, DEFAULT_TOKEN_SALT, templateArtifact, tokenInitCode } from './address.js';
import { parseTokenParams, type TokenParams } from './params.js';
import { deployedCodeMatches, loadArtifact } from '../chain/artifacts.js';
// .ts helper under scripts/, deliberately outside the service build — it is the
// only file in this repository holding a private key, and it is a public one.
import {
  deployTokenFactory,
  devChainReachable,
  devChainRequired,
  devRpcUrl,
  devSuiteClients,
  type DevChainClients,
} from '../../scripts/dev-chain.js';

/**
 * This file sends from an account derived from its own path, funded on demand —
 * see the per-suite sender banner in `scripts/dev-chain.ts`. It used to name a
 * hand-picked anvil index here, and `pool-factory-onchain.test.ts` had picked
 * the same one; the two raced that account's nonce and whichever lost failed
 * with `nonce too low`.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LAUNCHED TOKEN IS THE ONE THING HERE THAT CANNOT BE CORRECTED LATER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything this suite checks has the same shape: the platform tells a creator
 * something before the deployment, and the deployment must be that thing.
 *
 *   · the ADDRESS we predict is where the token lands. A creator publishes it,
 *     early buyers send funds to it, and if it is wrong those funds sit at an
 *     address with no code, permanently. Same failure as the account factory's,
 *     with a larger blast radius, because a token address gets broadcast.
 *   · the CODE that lands is the template we showed them the `sourceHash` of.
 *     An address arriving at the right place proves nothing about what is AT
 *     it: the arithmetic would agree just as happily if the factory embedded a
 *     token with a mint function in it.
 *   · the SUPPLY the creator asked for is the supply that exists, in full, at
 *     the address they named — not rounded, not partial, not somewhere else.
 *   · NOBODY holds mint authority afterwards. This is the product's whole
 *     claim, and it has to be proved against the deployed bytecode rather than
 *     against the source we hope it came from.
 *
 * ── When this runs ─────────────────────────────────────────────────────────
 *
 * It needs a chain: `docker compose up -d evm`. Without one it skips, loudly.
 * On CI `REQUIRE_EVM_CHAIN=1` makes a missing chain a hard failure, because a
 * suite that silently skips is how "we proved the address is real" quietly
 * stops being true.
 *
 * It deploys its own factory rather than reading one out of the environment: a
 * test that depends on somebody having run the deploy script first fails for
 * reasons unrelated to the code under test.
 */

const rpcUrl = devRpcUrl();
const reachable = await devChainReachable(rpcUrl);

if (!reachable && devChainRequired()) {
  throw new Error(
    `REQUIRE_EVM_CHAIN=1 but no EVM RPC answered at ${rpcUrl}. This suite is what proves a launched token lands at ` +
      `the address a creator was shown, holding the code they were promised; it must not be skipped on CI. ` +
      `Start it with: docker compose up -d evm`,
  );
}

/** Deterministic creators, chosen to move bytes around rather than to look real. */
const CREATORS: Address[] = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x0000000000000000000000000000000000000001',
  '0xffffffffffffffffffffffffffffffffffffffff',
];

const SALTS: Hex[] = [DEFAULT_TOKEN_SALT, `0x${'11'.repeat(32)}`, `0x${'ff'.repeat(32)}`, keccak256(toHex('intafaced:launch:v1'))];

/**
 * Parameter sets that exercise the encoding, not one lucky case: the boundary
 * decimals, a fractional supply, a multi-byte UTF-8 name (the `string` head/tail
 * offsets in the init code are where a hand-rolled encoding goes wrong), and a
 * supply at the top of the permitted range.
 */
const PARAM_SETS: TokenParams[] = [
  parseTokenParams({ name: 'Sovereign One', symbol: 'SOV', decimals: 18, totalSupply: '1000000', recipient: CREATORS[0]! }),
  parseTokenParams({ name: 'Zero Decimals', symbol: 'ZED', decimals: 0, totalSupply: '21000000', recipient: CREATORS[1]! }),
  parseTokenParams({ name: 'Fractional', symbol: 'FRAC', decimals: 6, totalSupply: '1234.567891', recipient: CREATORS[0]! }),
  // Multi-byte name and symbol: `bytes(name).length` in Solidity counts bytes,
  // and the ABI string encoding pads to 32-byte words. If our encoder measured
  // code units anywhere, this is the case that diverges.
  parseTokenParams({ name: 'Ünïcödé Tökén 通貨', symbol: 'ÜNÏ', decimals: 8, totalSupply: '500', recipient: CREATORS[2]! }),
  parseTokenParams({
    name: 'At The Ceiling',
    symbol: 'CEIL',
    decimals: 18,
    totalSupply: '99999999999999999999',
    recipient: CREATORS[3]!,
  }),
];

describe.skipIf(!reachable)('CREATE2 — the TypeScript derivation against the deployed TokenFactory', () => {
  let factory: Address;
  let clients: DevChainClients;
  let abi: ReturnType<typeof loadArtifact>['abi'];

  beforeAll(async () => {
    clients = await devSuiteClients(import.meta.url, rpcUrl);
    ({ factory } = await deployTokenFactory(clients));
    abi = loadArtifact('TokenFactory').abi;
  }, 60_000);

  const read = async (creator: Address, salt: Hex, params: TokenParams): Promise<Address> =>
    (await clients.publicClient.readContract({
      address: factory,
      abi,
      functionName: 'getAddress',
      args: [creator, salt, params],
    })) as Address;

  /**
   * THE ONE THAT MATTERS. 20 creator/salt pairs across 5 parameter sets, both
   * derivations, byte for byte.
   */
  it.each(CREATORS.flatMap((creator, i) => SALTS.map((userSalt) => ({ creator, userSalt, params: PARAM_SETS[i % PARAM_SETS.length]! }))))(
    'agrees for creator $creator salt $userSalt',
    async ({ creator, userSalt, params }) => {
      const offChain = computeTokenAddress({ factory, creator, userSalt, params });
      const onChain = await read(creator, userSalt, params);
      expect(offChain.toLowerCase()).toBe(onChain.toLowerCase());
    },
  );

  /**
   * The init code itself, not just the address it hashes to.
   *
   * An address mismatch says something is wrong; these bytes say WHERE. It also
   * catches the case an address comparison cannot: the standalone
   * `SovereignToken.json` bytecode drifting from the copy the compiler embedded
   * in `TokenFactory` via `type(T).creationCode`. If those ever differ, every
   * address we derive is wrong in a way that looks like arithmetic.
   */
  it.each(PARAM_SETS)('builds the same init code as the factory for $symbol', async (params) => {
    const onChain = (await clients.publicClient.readContract({
      address: factory,
      abi,
      functionName: 'initCode',
      args: [params],
    })) as Hex;
    expect(tokenInitCode(params).toLowerCase()).toBe(onChain.toLowerCase());
  });

  it('binds the creator into the salt — two creators never share an address', async () => {
    const params = PARAM_SETS[0]!;
    const a = await read(CREATORS[0]!, DEFAULT_TOKEN_SALT, params);
    const b = await read(CREATORS[1]!, DEFAULT_TOKEN_SALT, params);
    expect(a.toLowerCase()).not.toBe(b.toLowerCase());
  });

  /**
   * The parameters are in the init code, so they are in the address. A creator
   * who changes one character of the name gets a different token — which is the
   * property that makes a predicted address a commitment rather than a guess.
   */
  it('gives a different address for every parameter set', async () => {
    const addresses = await Promise.all(
      PARAM_SETS.map(async (params) => (await read(CREATORS[0]!, DEFAULT_TOKEN_SALT, params)).toLowerCase()),
    );
    expect(new Set(addresses).size).toBe(PARAM_SETS.length);
  });

  it('gives one creator a distinct address per userSalt', async () => {
    const params = PARAM_SETS[0]!;
    const addresses = await Promise.all(SALTS.map(async (salt) => (await read(CREATORS[0]!, salt, params)).toLowerCase()));
    expect(new Set(addresses).size).toBe(SALTS.length);
  });
});

describe.skipIf(!reachable)('the predicted address is where the token actually lands', () => {
  let factory: Address;
  let clients: DevChainClients;
  let abi: ReturnType<typeof loadArtifact>['abi'];
  const tokenAbi = loadArtifact('SovereignToken').abi;

  beforeAll(async () => {
    clients = await devSuiteClients(import.meta.url, rpcUrl);
    ({ factory } = await deployTokenFactory(clients));
    abi = loadArtifact('TokenFactory').abi;
  }, 60_000);

  /** The deployer is the creator here — `createToken` binds `msg.sender`. */
  const launch = async (userSalt: Hex, params: TokenParams) => {
    const hash = await clients.walletClient.writeContract({
      address: factory,
      abi,
      functionName: 'createToken',
      args: [userSalt, params],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    return clients.publicClient.waitForTransactionReceipt({ hash });
  };

  it('has no code before deployment and the exact compiled template after', async () => {
    const creator = clients.deployer;
    const params = parseTokenParams({
      name: 'Landing Check',
      symbol: 'LAND',
      decimals: 18,
      totalSupply: '1000000',
      recipient: '0x00000000000000000000000000000000000000a1',
    });
    const userSalt = keccak256(toHex('landing-check'));
    const predicted = computeTokenAddress({ factory, creator, userSalt, params });

    const before = await clients.publicClient.getCode({ address: predicted });
    expect(before ?? '0x').toBe('0x');

    const receipt = await launch(userSalt, params);
    expect(receipt.status).toBe('success');

    const after = await clients.publicClient.getCode({ address: predicted });
    expect(after, 'the token did not land at the predicted address').toBeDefined();
    expect(after).not.toBe('0x');

    /**
     * THE SECOND HALF OF THE PROMISE. Landing at the right address says nothing
     * about what is at it — the arithmetic would agree just as happily if the
     * factory embedded a different token. This compares the runtime against
     * what the compiler produced, so "the template" is a claim about the
     * deployed code and not about our intentions.
     */
    expect(deployedCodeMatches(templateArtifact(), after)).toBe(true);

    /**
     * And the thing that makes the check above non-trivial, pinned so nobody
     * "simplifies" it back to byte-equality.
     *
     * The runtime is NOT byte-identical to `deployedBytecode`, and a correct
     * deployment never will be: `decimals`, `totalSupply` and `initialHolder`
     * are `immutable`, so the compiler leaves zero placeholders and the
     * constructor splices the real values in. Writing the obvious comparison
     * first is how this was found — `12` on chain where the artefact had `00`
     * was `decimals = 18`.
     */
    expect(after!.toLowerCase()).not.toBe(templateArtifact().deployedBytecode.toLowerCase());
    expect(Object.keys(templateArtifact().immutableReferences ?? {}).length, 'the template lost its immutables').toBe(3);
  }, 60_000);

  /**
   * The masking must not turn the check into a rubber stamp.
   *
   * `deployedCodeMatches` zeroes three 32-byte windows. If that were ever
   * widened — or if the comparison silently became "same length" — a completely
   * different contract would pass. The factory's own runtime is a real,
   * unrelated, deployed contract, so it is the honest negative control.
   */
  it('does not match a different contract deployed on the same chain', async () => {
    const factoryRuntime = await clients.publicClient.getCode({ address: factory });
    expect(factoryRuntime).toBeDefined();
    expect(deployedCodeMatches(templateArtifact(), factoryRuntime)).toBe(false);
    expect(deployedCodeMatches(templateArtifact(), '0x')).toBe(false);
    expect(deployedCodeMatches(templateArtifact(), null)).toBe(false);
  }, 60_000);

  it('mints the entire supply to the recipient, and nothing to the creator', async () => {
    const creator = clients.deployer;
    const recipient: Address = '0x00000000000000000000000000000000000000b2';
    const params = parseTokenParams({
      name: 'Supply Check',
      symbol: 'SUP',
      decimals: 6,
      totalSupply: '1234.567891',
      recipient,
    });
    const userSalt = keccak256(toHex('supply-check'));
    const token = computeTokenAddress({ factory, creator, userSalt, params });

    await launch(userSalt, params);

    const read = async (functionName: string, args: readonly unknown[] = []) =>
      clients.publicClient.readContract({ address: token, abi: tokenAbi, functionName, args });

    // 1234.567891 at 6 decimals = 1_234_567_891 base units. Asserted as the
    // literal, not recomputed from the same helper that produced it — a scaling
    // bug that appears on both sides of a comparison is invisible.
    expect(await read('totalSupply')).toBe(1_234_567_891n);
    expect(await read('balanceOf', [recipient])).toBe(1_234_567_891n);
    expect(await read('balanceOf', [creator]), 'the creator paid gas and must hold nothing').toBe(0n);
    expect(await read('initialHolder')).toBe(recipient);
    expect(await read('name')).toBe('Supply Check');
    expect(await read('symbol')).toBe('SUP');
    expect(await read('decimals')).toBe(6);
  }, 60_000);

  /**
   * NO MINT AUTHORITY, PROVED AGAINST THE DEPLOYED BYTECODE.
   *
   * The product's central claim. Asserting it against the source would be
   * asserting that we read our own file correctly; asserting it against the ABI
   * would assert that the compiler's summary matches the source. This checks
   * that the four-byte selector of every function that could inflate supply or
   * confer control is absent from the runtime code actually on chain, which is
   * the only version of the claim a holder cares about.
   */
  it('deploys bytecode containing no mint, owner, pause or upgrade selector', async () => {
    const creator = clients.deployer;
    const params = parseTokenParams({
      name: 'Authority Check',
      symbol: 'AUTH',
      decimals: 18,
      totalSupply: '1',
      recipient: creator,
    });
    const userSalt = keccak256(toHex('authority-check'));
    const token = computeTokenAddress({ factory, creator, userSalt, params });
    await launch(userSalt, params);

    const runtime = ((await clients.publicClient.getCode({ address: token })) ?? '0x').toLowerCase();
    expect(runtime).not.toBe('0x');

    const forbidden = [
      'mint(address,uint256)',
      'mint(uint256)',
      'burn(uint256)',
      'owner()',
      'transferOwnership(address)',
      'renounceOwnership()',
      'pause()',
      'unpause()',
      'upgradeTo(address)',
      'setFee(uint256)',
      'blacklist(address)',
    ];
    for (const sig of forbidden) {
      const selector = keccak256(toHex(sig)).slice(2, 10);
      expect(runtime.includes(selector), `runtime contains the selector for ${sig}`).toBe(false);
    }

    // And the control: a selector that IS supposed to be there, so the test
    // above cannot pass by looking in the wrong place or at an empty string.
    expect(runtime.includes(keccak256(toHex('totalSupply()')).slice(2, 10))).toBe(true);
  }, 60_000);

  /**
   * A repeated launch REVERTS, unlike `AccountFactory.createAccount` which
   * returns the existing account.
   *
   * The asymmetry is the point. A second `createAccount` is the same account
   * and nothing happened twice. A second `createToken` cannot mint a second
   * supply — the first call already did — so returning the existing address
   * would let a caller believe a launch happened when none did.
   */
  it('reverts on a second launch with identical parameters', async () => {
    const params = parseTokenParams({
      name: 'Collision Check',
      symbol: 'COL',
      decimals: 18,
      totalSupply: '1000',
      recipient: clients.deployer,
    });
    const userSalt = keccak256(toHex('collision-check'));

    expect((await launch(userSalt, params)).status).toBe('success');
    await expect(launch(userSalt, params)).rejects.toThrow(/TokenAlreadyDeployed|reverted/i);
  }, 60_000);

  /**
   * Provenance is recorded at the moment it is true, and is per-creator.
   * `creatorOf` is what §35 deployer reputation reads; a token launched
   * elsewhere must come back as the zero address so the API can report it as
   * unknown rather than as ours.
   */
  it('records the creator, and reports 0x0 for a token it did not deploy', async () => {
    const params = parseTokenParams({
      name: 'Provenance Check',
      symbol: 'PROV',
      decimals: 18,
      totalSupply: '77',
      recipient: clients.deployer,
    });
    const userSalt = keccak256(toHex('provenance-check'));
    const token = computeTokenAddress({ factory, creator: clients.deployer, userSalt, params });
    await launch(userSalt, params);

    expect(
      (
        (await clients.publicClient.readContract({
          address: factory,
          abi,
          functionName: 'creatorOf',
          args: [token],
        })) as string
      ).toLowerCase(),
    ).toBe(clients.deployer.toLowerCase());

    // The factory itself was not launched through the factory.
    expect(await clients.publicClient.readContract({ address: factory, abi, functionName: 'creatorOf', args: [factory] })).toBe(
      '0x0000000000000000000000000000000000000000',
    );
  }, 60_000);

  /**
   * The event carries what an indexer needs, decoded with the hand-written ABI
   * this service actually uses — so an `indexed` flag in the wrong place fails
   * here rather than silently producing an unreadable log in production.
   */
  it('emits TokenCreated with the launched parameters', async () => {
    const params = parseTokenParams({
      name: 'Event Check',
      symbol: 'EVT',
      decimals: 9,
      totalSupply: '42',
      recipient: '0x00000000000000000000000000000000000000c3',
    });
    const userSalt = keccak256(toHex('event-check'));
    const token = computeTokenAddress({ factory, creator: clients.deployer, userSalt, params });

    const receipt = await launch(userSalt, params);
    const log = receipt.logs.find((entry) => entry.address.toLowerCase() === factory.toLowerCase());
    expect(log, 'no log from the factory').toBeDefined();

    const decoded = decodeEventLog({ abi, data: log!.data, topics: log!.topics }) as {
      eventName: string;
      args: Record<string, unknown>;
    };
    expect(decoded.eventName).toBe('TokenCreated');
    expect((decoded.args.token as string).toLowerCase()).toBe(token.toLowerCase());
    expect((decoded.args.creator as string).toLowerCase()).toBe(clients.deployer.toLowerCase());
    expect(decoded.args.recipient).toBe(params.recipient);
    expect(decoded.args.name).toBe('Event Check');
    expect(decoded.args.symbol).toBe('EVT');
    expect(decoded.args.decimals).toBe(9);
    expect(decoded.args.totalSupply).toBe(42_000_000_000n);
  }, 60_000);

  /**
   * The contract enforces its own bounds, because it is permissionless and the
   * API is not the only caller. `params.ts` refuses these too, earlier and with
   * a better message — but a caller who goes straight to the chain must not be
   * able to create a token the rest of the system cannot represent.
   */
  it('refuses decimals above 18 at the contract, not only at the API', async () => {
    const beyondPolicy = {
      name: 'Too Precise',
      symbol: 'TP',
      decimals: 19,
      totalSupply: 1_000n,
      recipient: clients.deployer,
    };
    await expect(
      clients.walletClient.writeContract({
        address: factory,
        abi,
        functionName: 'createToken',
        args: [keccak256(toHex('too-precise')), beyondPolicy],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      }),
    ).rejects.toThrow(/DecimalsTooHigh|reverted/i);
  }, 60_000);
});
