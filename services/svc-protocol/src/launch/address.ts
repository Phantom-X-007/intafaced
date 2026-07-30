import { concatHex, encodeAbiParameters, getContractAddress, isAddress, keccak256, getAddress as toChecksum } from 'viem';
import type { Address, Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import type { TokenParams } from './params.js';

/**
 * DETERMINISTIC TOKEN ADDRESS DERIVATION (§8.4).
 *
 * A creator is shown their token's address before they pay to deploy it, so
 * they can publish it, pre-announce it, or hand it to a market-making flow.
 * This file makes that promise true off chain, and it must agree with
 * `TokenFactory.getAddress` byte for byte.
 *
 * The consequence of disagreement is the same one `accounts/address.ts` names,
 * with one extra edge: the token is where a supply lives. A creator who
 * publishes the wrong address sends every early buyer to a contract that will
 * never exist, and the ones who send funds to it lose them to nobody.
 *
 * ── Why this needs the compiled artefact and account derivation does not ─────
 *
 * A smart account is an EIP-1167 clone, so its creation code is 55 known bytes
 * plus an address — derivable from constants, no compiler output required.
 * A token is a full contract: the init code is `SovereignToken`'s creation
 * bytecode followed by its ABI-encoded constructor arguments, so the derivation
 * genuinely depends on what the compiler produced.
 *
 * That is why `artifacts.test.ts` matters more here, not less: a stale
 * `SovereignToken.json` would produce confident, wrong addresses. `sourceHash`
 * is what ties the bytecode used below to the `.sol` in this tree, and
 * `token-factory-onchain.test.ts` asks the deployed factory to confirm the
 * whole chain of reasoning.
 */

/** Default salt — one token per creator per parameter set unless they ask for more. */
export const DEFAULT_TOKEN_SALT: Hex = `0x${'00'.repeat(32)}`;

export class TokenAddressError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TokenAddressError';
  }
}

function requireAddress(value: string, field: string): Address {
  if (!isAddress(value, { strict: false })) {
    throw new TokenAddressError(`${field} is not an address: ${value}`, 'launch.invalid_address');
  }
  return toChecksum(value);
}

/**
 * `keccak256(abi.encode(creator, userSalt))` — mirrors `TokenFactory._salt`.
 *
 * The creator is bound into the salt so that a published address cannot be
 * occupied by anyone else. Note that it is bound into the SALT and the
 * parameters are bound into the INIT CODE: both halves of the CREATE2 preimage
 * carry a commitment, which is what makes "this address, these parameters, this
 * creator" a single claim rather than three.
 */
export function tokenSalt(creator: Address, userSalt: Hex = DEFAULT_TOKEN_SALT): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [requireAddress(creator, 'creator'), userSalt]));
}

/**
 * The exact bytes CREATE2 will hash: creation code ++ abi.encode(ctor args).
 *
 * `TokenFactory.initCode` is the same function in Solidity and is exposed as a
 * public view purely so a test can compare these bytes directly, rather than
 * inferring an encoding bug from an address that came out wrong.
 */
export function tokenInitCode(params: TokenParams): Hex {
  const { bytecode } = loadArtifact('SovereignToken');
  const args = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'address' }],
    [params.name, params.symbol, params.decimals, params.totalSupply, requireAddress(params.recipient, 'recipient')],
  );
  return concatHex([bytecode, args]);
}

export interface TokenAddressInput {
  /** The deployed TokenFactory. */
  factory: Address;
  /** Whoever will call `createToken` — bound into the salt. */
  creator: Address;
  /** Lets one creator hold several tokens with identical parameters. */
  userSalt?: Hex;
  params: TokenParams;
}

/**
 * The token's address, before the token exists.
 *
 * `keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]`.
 */
export function computeTokenAddress(input: TokenAddressInput): Address {
  const factory = requireAddress(input.factory, 'factory');
  const creator = requireAddress(input.creator, 'creator');
  const userSalt = input.userSalt ?? DEFAULT_TOKEN_SALT;

  if (!/^0x[0-9a-fA-F]{64}$/.test(userSalt)) {
    throw new TokenAddressError(`userSalt must be 32 bytes: ${userSalt}`, 'launch.invalid_salt');
  }

  return getContractAddress({
    opcode: 'CREATE2',
    from: factory,
    salt: tokenSalt(creator, userSalt),
    bytecode: tokenInitCode(input.params),
  });
}
