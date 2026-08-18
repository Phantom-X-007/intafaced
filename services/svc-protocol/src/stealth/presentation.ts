/**
 * S-L3 / §26 — one human, two unlinkable presentations.
 *
 * A stealth receive address is derived from a spending key id plus an
 * ephemeral the sender chooses. Two ephemerals never collide into the same
 * presentation, and neither presentation is the spending key itself.
 *
 * Full EIP-5564 ECDH scanning is residual; this P0 proves the unlinkable
 * receive shape so we do not ship a public address as the only receive path.
 */
import { concat, keccak256, type Address, type Hex } from 'viem';

export const STEALTH_SCHEME_ID = 1n;

export function presentationAddress(spendingKeyId: Hex, ephemeral: Hex): Address {
  const digest = keccak256(concat([spendingKeyId, ephemeral]));
  return `0x${digest.slice(-40)}` as Address;
}
