/**
 * S-L3 / §26 — one human, two unlinkable presentations.
 *
 * A stealth receive address is derived from a spending key id plus an
 * ephemeral the sender chooses. Two ephemerals never collide into the same
 * presentation, and neither presentation is the spending key itself.
 *
 * ECDH scanning of announcer logs lives in `scan.ts` (ERC-5564 scheme 1).
 * This helper is the P0 keccak presentation — not an ECDH match.
 */
import { concat, keccak256, type Address, type Hex } from 'viem';

export const STEALTH_SCHEME_ID = 1n;

export function presentationAddress(spendingKeyId: Hex, ephemeral: Hex): Address {
  const digest = keccak256(concat([spendingKeyId, ephemeral]));
  return `0x${digest.slice(-40)}` as Address;
}
