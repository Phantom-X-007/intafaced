import { z } from 'zod';
import { BEST_EX_CLAIM_UNSET, refuseBestExClaim, type BestExClaimVerdict } from '@intafaced/venue-adapter';

/**
 * Q-dex leftover — the internal book is ledger-settled.
 *
 * `custody-scan` proves this process never posts. That is not the same as
 * "a quote from `internal-book` is non-custodial" or "this is an on-chain AMM".
 * A fill on our engine settles through the ledger. AMM is not a venue until
 * an indexer projects reserves; this payload never claims one is wired here.
 *
 * Ranking + degraded/singleVenue is not a certified best-execution claim.
 * Hitch: `refuseBestExClaim` from venue-adapter. Unset owner law → claimed
 * false; copy/claim true without law refuses `venue.best_ex_claim_unset`.
 */

export const dexInternalBookHonestySchema = z.discriminatedUnion('enabled', [
  z.object({
    enabled: z.literal(true),
    priced: z.boolean().optional(),
    custodial: z.literal(true),
    plane: z.literal('fiat'),
    venueKind: z.literal('internal'),
    amm: z.literal(false),
  }),
  z.object({
    enabled: z.literal(false),
    amm: z.literal(false),
  }),
]);

/** Wire shape of `refuseBestExClaim` — ranking is not a certified claim. */
export const dexBestExHonestySchema = z.union([
  z.object({ ok: z.literal(true), claimed: z.literal(false) }),
  z.object({
    ok: z.literal(true),
    claimed: z.literal(true),
    ownerBestExLaw: z.string().min(1),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.literal('best_ex_unset'),
    code: z.literal(BEST_EX_CLAIM_UNSET),
    detail: z.string(),
  }),
]);

export const dexDoorHonestySchema = z.object({
  serviceHoldsBalances: z.literal(false),
  internalBook: dexInternalBookHonestySchema,
  ammVenueWired: z.boolean(),
  bestEx: dexBestExHonestySchema,
});

export type DexInternalBookHonesty = z.infer<typeof dexInternalBookHonestySchema>;
export type DexBestExHonesty = z.infer<typeof dexBestExHonestySchema>;
export type DexDoorHonesty = z.infer<typeof dexDoorHonestySchema>;

export type DexBestExHonestyInput = {
  readonly ownerBestExLaw?: string | boolean | null;
  readonly claim?: boolean;
  readonly kind?: string | null;
  readonly copy?: string | null;
};

/** Public quote/health never pass `claim: true`. Ranking is idle, not certified. */
export function dexBestExHonesty(input: DexBestExHonestyInput = {}): BestExClaimVerdict {
  return refuseBestExClaim(input);
}

export function dexDoorHonesty(opts: {
  internalBookEnabled: boolean;
  ammVenueWired?: boolean;
  internalBookPriced?: boolean;
  ownerBestExLaw?: string | boolean | null;
  bestExClaim?: boolean;
  bestExKind?: string | null;
  bestExCopy?: string | null;
}): DexDoorHonesty {
  const ammVenueWired = opts.ammVenueWired ?? false;
  const bestEx = dexBestExHonesty({
    ownerBestExLaw: opts.ownerBestExLaw,
    claim: opts.bestExClaim,
    kind: opts.bestExKind,
    copy: opts.bestExCopy,
  });
  if (!opts.internalBookEnabled) {
    return {
      serviceHoldsBalances: false,
      internalBook: { enabled: false, amm: false },
      ammVenueWired,
      bestEx,
    };
  }
  return {
    serviceHoldsBalances: false,
    internalBook: {
      enabled: true,
      ...(opts.internalBookPriced === undefined ? {} : { priced: opts.internalBookPriced }),
      custodial: true,
      plane: 'fiat',
      venueKind: 'internal',
      amm: false,
    },
    ammVenueWired,
    bestEx,
  };
}

export function dexReadyHonesty(opts: { internalBookEnabled: boolean; ammVenueWired?: boolean }) {
  return { ready: true as const, ...dexDoorHonesty(opts) };
}

export function dexHealthHonesty(opts: { internalBookEnabled: boolean; ammVenueWired?: boolean }) {
  return { ok: true as const, service: 'svc-dex' as const, ...dexDoorHonesty(opts) };
}
