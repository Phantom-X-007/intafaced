/**
 * Live offers freeze a payment-instrument snapshot onto the trade.
 *
 * `details` is jsonb at rest. Envelope encryption is owner-gated Class X.
 * A key improvised in this service would be the appearance of protection
 * without the substance. Until OWNER KMS is wired, live offer create is
 * refuse-closed. No env unblocks plaintext. No method registry is seeded.
 */
import { P2pError } from './p2p-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

export const P2P_INSTRUMENT_KMS_REQUIRED = 'p2p.instrument_kms_required' as const;

export function refuseLiveOffersUntilOwnerKms(): never {
  throw new P2pError(resolveP2pCopy(P2P_COPY.instrumentKmsRequired), P2P_INSTRUMENT_KMS_REQUIRED);
}
