import { z } from 'zod';

/**
 * Q-dex leftover — the internal book is ledger-settled.
 *
 * `custody-scan` proves this process never posts. That is not the same as
 * "a quote from `internal-book` is non-custodial" or "this is an on-chain AMM".
 * A fill on our engine settles through the ledger. AMM is not a venue until
 * an indexer projects reserves; this payload never claims one is wired here.
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

export const dexDoorHonestySchema = z.object({
  serviceHoldsBalances: z.literal(false),
  internalBook: dexInternalBookHonestySchema,
  ammVenueWired: z.boolean(),
});

export type DexInternalBookHonesty = z.infer<typeof dexInternalBookHonestySchema>;
export type DexDoorHonesty = z.infer<typeof dexDoorHonestySchema>;

export function dexDoorHonesty(opts: {
  internalBookEnabled: boolean;
  ammVenueWired?: boolean;
  internalBookPriced?: boolean;
}): DexDoorHonesty {
  const ammVenueWired = opts.ammVenueWired ?? false;
  if (!opts.internalBookEnabled) {
    return {
      serviceHoldsBalances: false,
      internalBook: { enabled: false, amm: false },
      ammVenueWired,
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
  };
}

export function dexReadyHonesty(opts: { internalBookEnabled: boolean; ammVenueWired?: boolean }) {
  return { ready: true as const, ...dexDoorHonesty(opts) };
}

export function dexHealthHonesty(opts: { internalBookEnabled: boolean; ammVenueWired?: boolean }) {
  return { ok: true as const, service: 'svc-dex' as const, ...dexDoorHonesty(opts) };
}
