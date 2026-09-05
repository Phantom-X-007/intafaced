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
 *
 * Empty `DEX_EXTERNAL_VENUES` is not a live external venue. This payload names
 * `externalVenueWired: false` rather than inventing a row.
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
  /** Operator `DEX_EXTERNAL_VENUES`. Default empty — not a shipped live venue. */
  externalVenueWired: z.boolean(),
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

export type DexDoorHonestyInput = {
  readonly internalBookEnabled: boolean;
  readonly ammVenueWired?: boolean;
  readonly externalVenueWired?: boolean;
  readonly internalBookPriced?: boolean;
  readonly ownerBestExLaw?: string | boolean | null;
  readonly bestExClaim?: boolean;
  readonly bestExKind?: string | null;
  readonly bestExCopy?: string | null;
};

export function dexDoorHonesty(opts: DexDoorHonestyInput): DexDoorHonesty {
  const ammVenueWired = opts.ammVenueWired ?? false;
  const externalVenueWired = opts.externalVenueWired ?? false;
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
      externalVenueWired,
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
    externalVenueWired,
    bestEx,
  };
}

export function dexReadyHonesty(opts: DexDoorHonestyInput) {
  return { ready: true as const, ...dexDoorHonesty(opts) };
}

export function dexHealthHonesty(opts: DexDoorHonestyInput) {
  return { ok: true as const, service: 'svc-dex' as const, ...dexDoorHonesty(opts) };
}
