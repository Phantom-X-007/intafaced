import { keccak256, type Hex } from 'viem';

/**
 * S-F1 / §19 — subject of a rank attestation.
 *
 * `salt` is a user-chosen secret the holder already has. This hashes that salt
 * and nothing else. Do not pass identity fields (address, name, email, user id,
 * KYC) — joining the digest to a Fiat Plane person is forbidden.
 */
export function subjectCommitment(salt: Hex): Hex {
  return keccak256(salt);
}
