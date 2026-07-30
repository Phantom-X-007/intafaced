import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from 'viem';
import { computeTokenAddress, DEFAULT_TOKEN_SALT, templateArtifact, tokenInitCode, tokenSalt, TokenAddressError } from './address.js';
import { parseTokenParams } from './params.js';

/**
 * TOKEN ADDRESS DERIVATION — the arithmetic, pinned against this repository.
 *
 * This is TypeScript checked against TypeScript, and it cannot prove the thing
 * that matters: that our derivation agrees with the factory's. Only
 * `token-factory-onchain.test.ts` can, by asking a deployed `TokenFactory`.
 *
 * What this file is for is the properties that must hold whether or not a chain
 * is running — that the salt commits to the creator, that every parameter is
 * inside the init code, and that the structure of the preimage is what CREATE2
 * expects. When the on-chain suite goes red, this is what tells you which half
 * moved.
 */

const FACTORY: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CREATOR: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const RECIPIENT: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const params = parseTokenParams({
  name: 'Sovereign One',
  symbol: 'SOV',
  decimals: 18,
  totalSupply: '1000000',
  recipient: RECIPIENT,
});

describe('the init code is creation code followed by the constructor arguments', () => {
  it('starts with the compiled template bytecode, unmodified', () => {
    const bytecode = templateArtifact().bytecode;
    expect(tokenInitCode(params).startsWith(bytecode)).toBe(true);
  });

  it('appends exactly the ABI encoding of the five constructor arguments', () => {
    const bytecode = templateArtifact().bytecode;
    const tail = `0x${tokenInitCode(params).slice(bytecode.length)}` as Hex;
    const expected = encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'address' }],
      [params.name, params.symbol, params.decimals, params.totalSupply, RECIPIENT],
    );
    expect(tail).toBe(expected);
  });

  /**
   * Every parameter is inside the address, because every parameter is a
   * constructor argument. This is what makes a predicted address a commitment
   * to a specific token rather than to a name.
   */
  it('changes for any change to any parameter', () => {
    const variants = [
      { ...params, name: 'Sovereign Two' },
      { ...params, symbol: 'SOW' },
      { ...params, decimals: 17 },
      { ...params, totalSupply: params.totalSupply + 1n },
      { ...params, recipient: OTHER },
    ];
    const addresses = variants.map((p) => computeTokenAddress({ factory: FACTORY, creator: CREATOR, params: p }).toLowerCase());
    addresses.push(computeTokenAddress({ factory: FACTORY, creator: CREATOR, params }).toLowerCase());
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  /** A single character of the name moves the address. Worth pinning explicitly. */
  it('changes for a one-character difference in the name', () => {
    const a = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params });
    const b = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params: { ...params, name: 'Sovereign one' } });
    expect(a).not.toBe(b);
  });
});

describe('the salt commits to the creator', () => {
  it('is keccak256(abi.encode(creator, userSalt)) — the same as TokenFactory._salt', () => {
    const userSalt = keccak256(toHex('named-space'));
    expect(tokenSalt(CREATOR, userSalt)).toBe(
      keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [CREATOR, userSalt])),
    );
  });

  /**
   * The property that makes a published address safe. Without the creator in
   * the salt, anyone who learned a creator's parameters could occupy the
   * address they announced.
   */
  it('gives two creators different addresses for identical parameters', () => {
    const a = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params });
    const b = computeTokenAddress({ factory: FACTORY, creator: OTHER, params });
    expect(a).not.toBe(b);
  });

  it('gives one creator a different address per userSalt', () => {
    const a = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params });
    const b = computeTokenAddress({ factory: FACTORY, creator: CREATOR, userSalt: `0x${'11'.repeat(32)}`, params });
    expect(a).not.toBe(b);
  });

  it('defaults userSalt to 32 zero bytes', () => {
    expect(DEFAULT_TOKEN_SALT).toBe(`0x${'00'.repeat(32)}`);
    expect(computeTokenAddress({ factory: FACTORY, creator: CREATOR, params })).toBe(
      computeTokenAddress({ factory: FACTORY, creator: CREATOR, userSalt: DEFAULT_TOKEN_SALT, params }),
    );
  });
});

describe('the address depends on the factory it will be deployed by', () => {
  /**
   * A CREATE2 address is only meaningful for the deployer that produces it.
   * Deriving against the wrong factory yields a valid-looking address nothing
   * will ever deploy to — which is why `router.ts` refuses on a zero factory
   * before this function is ever called.
   */
  it('differs per factory', () => {
    const a = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params });
    const b = computeTokenAddress({ factory: OTHER, creator: CREATOR, params });
    expect(a).not.toBe(b);
  });

  /**
   * The zero factory produces a real, checksummed, entirely fictional address.
   * This test exists to document that it does NOT throw — the arithmetic is
   * perfectly happy — which is exactly why the refusal has to live in the
   * router, upstream of here.
   */
  it('happily derives a fictional address from the zero factory, which is why the router refuses first', () => {
    const address = computeTokenAddress({
      factory: '0x0000000000000000000000000000000000000000',
      creator: CREATOR,
      params,
    });
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('malformed input is refused, not coerced', () => {
  it('rejects a non-address factory, creator or recipient', () => {
    expect(() => computeTokenAddress({ factory: 'not-an-address' as Address, creator: CREATOR, params })).toThrow(TokenAddressError);
    expect(() => computeTokenAddress({ factory: FACTORY, creator: '0x123' as Address, params })).toThrow(TokenAddressError);
    expect(() =>
      computeTokenAddress({ factory: FACTORY, creator: CREATOR, params: { ...params, recipient: '0xzz' as Address } }),
    ).toThrow(TokenAddressError);
  });

  it('rejects a userSalt that is not 32 bytes', () => {
    expect(() => computeTokenAddress({ factory: FACTORY, creator: CREATOR, userSalt: '0x11' as Hex, params })).toThrow(
      TokenAddressError,
    );
  });

  it('is stable — the same inputs give the same address every time', () => {
    const once = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params });
    const twice = computeTokenAddress({ factory: FACTORY, creator: CREATOR, params });
    expect(once).toBe(twice);
    expect(once).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('the template the addresses commit to', () => {
  /**
   * `launch.status` reports this hash to a creator. If it were ever empty or
   * missing, the surface would be telling them "this address was derived from
   * template X" without being able to say which X.
   */
  it('carries a sourceHash, real bytecode, and no unlinked library placeholder', () => {
    const template = templateArtifact();
    expect(template.contractName).toBe('SovereignToken');
    expect(template.sourceHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(template.bytecode.length).toBeGreaterThan(2);
    expect(template.deployedBytecode.length).toBeGreaterThan(2);
    expect(template.bytecode).not.toContain('__$');
  });
});
