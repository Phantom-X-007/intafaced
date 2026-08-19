/**
 * S-E3 — Protocol Plane card-issuer adapter.
 *
 * Builds calldata for `ICardPull` / `CardPull`. Never holds an issuer key,
 * mnemonic, or PAN. Amounts are bigint (scaled), never `number`.
 *
 * The custodial `CardIssuerAdapter` in svc-bank is a different port. Live
 * credentials stay `socket.live-issuer` (Nitro).
 */
import { encodeFunctionData, type Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

export const ISSUER_SECRET_ENV = ['ISSUER_PRIVATE_KEY', 'ISSUER_MNEMONIC', 'CARD_ISSUER_KEY'] as const;

export function refuseIssuerSecrets(env: NodeJS.Dict<string | undefined>): void {
  for (const key of ISSUER_SECRET_ENV) {
    if (env[key]) {
      throw new Error('card.issuer_key_forbidden');
    }
  }
}

export function buildPullExactCalldata(amount: bigint): Hex {
  if (amount <= 0n) throw new Error('card.bad_amount');
  return encodeFunctionData({
    abi: loadArtifact('CardPull').abi,
    functionName: 'pullExact',
    args: [amount],
  });
}

export function buildKillCalldata(): Hex {
  return encodeFunctionData({
    abi: loadArtifact('CardPull').abi,
    functionName: 'kill',
  });
}
