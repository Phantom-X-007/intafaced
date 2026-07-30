import { encodeFunctionData } from 'viem';
import type { Address, Hex } from 'viem';
import { tokenFactoryAbi } from '../chain/abi.js';
import type { TokenParams } from './params.js';

/**
 * UNSIGNED CALLDATA FOR A LAUNCH.
 *
 * This service builds the bytes and stops. It holds no key (`env.ts` says so and
 * `custody-scan` enforces it), so a launch is something the creator signs and
 * anybody may broadcast — the same shape as `session/relay.ts:buildDeployment`.
 *
 * That is not a limitation to work around later. A launch that the platform
 * could originate on a creator's behalf would be a platform-controlled token
 * issuance, which is a different product with a different licence question.
 *
 * `value` is always 0. The factory is not payable and takes no fee: a launch fee
 * is a Fiat Plane ledger recipe (§0.6) charged by whichever module sells the
 * launch, never value held by a contract on this plane.
 */
export interface UnsignedCall {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
  /** Plain-language description of exactly what signing this does. */
  readonly summary: string;
}

/**
 * The `createToken` call.
 *
 * `params.totalSupply` is already scaled by `parseTokenParams` and is a bigint
 * here — it is encoded straight into the calldata as `uint256` and is never
 * formatted, parsed or rounded on the way.
 */
export function buildCreateToken(factory: Address, userSalt: Hex, params: TokenParams, predictedAddress: Address): UnsignedCall {
  return {
    to: factory,
    data: encodeFunctionData({ abi: tokenFactoryAbi, functionName: 'createToken', args: [userSalt, params] }),
    value: 0n,
    // The summary names the irreversible parts. A creator signing this is
    // minting a fixed supply to an address, forever, with no mint authority
    // retained by anyone — and the summary is the last place that can be said
    // before it is true.
    summary:
      `Launch ${params.symbol} ("${params.name}", ${params.decimals} decimals) at ${predictedAddress}. ` +
      `The entire supply of ${params.totalSupply} base units is minted once to ${params.recipient}. ` +
      `There is no mint function, no owner and no upgrade path: after this transaction the supply is fixed permanently ` +
      `and nobody — not the creator, not INTAFACED — can issue more or alter the token.`,
  };
}
