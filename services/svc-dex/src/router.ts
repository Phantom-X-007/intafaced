import { z } from 'zod';
import { publicJurisdictionProcedure, publicProcedure, router } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client/money';
import { presentRoute, route, type VenueQuote } from './router-quote.js';

/**
 * svc-dex — the Protocol Plane's front door (§17.5).
 *
 * **Every procedure here is permissionless.** No login, no KYC tier, no account
 * gate beyond a wallet. That is not a relaxation, it is §503:
 *
 *   "No-KYC exists on the Protocol Plane because there is nothing to KYC — the
 *    platform never holds user assets there."
 *
 * `publicJurisdictionProcedure('dex', 'protocol')` still runs the jurisdiction
 * matrix, because a sanctioned region is a legal constraint rather than a
 * custody one. `checkAccess` short-circuits a `custodial: false` module on the
 * protocol plane to `allowed.permissionless` before any tier is read — so the
 * gate that remains is the one that must, and the one that must not is gone.
 *
 * Contrast svc-trade, the custodial venue: `scopedProcedure('trade:write')`
 * with `minTier: 'basic'`, because that service holds the user's balance. Same
 * platform, two planes, and the difference is visible in one line of each
 * router.
 */

const quoteInput = z.object({
  venue: z.string().min(1),
  kind: z.enum(['book', 'pool']),
  fillableQty: z.string(),
  quoteAmount: z.string(),
  feeBps: z.number().int().min(0).max(9_999),
  settlementCost: z.string(),
});

export function createDexRouter() {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.literal(true), service: z.literal('svc-dex'), custodial: z.literal(false) }))
      .query(() => ({ ok: true as const, service: 'svc-dex' as const, custodial: false as const })),

    /**
     * Best execution across venues.
     *
     * Amounts cross the wire as decimal strings and are parsed to scaled bigint
     * here. A JSON number would round the 18th decimal away, and the 18th
     * decimal is where a split route stops adding up.
     */
    quote: publicJurisdictionProcedure('dex', 'protocol')
      .input(z.object({ side: z.enum(['buy', 'sell']), qty: z.string(), quotes: z.array(quoteInput) }))
      .query(({ input }) => {
        const quotes: VenueQuote[] = input.quotes.map((q) => ({
          venue: q.venue,
          kind: q.kind,
          fillableQty: parseAmount(q.fillableQty),
          quoteAmount: parseAmount(q.quoteAmount),
          feeBps: q.feeBps,
          settlementCost: parseAmount(q.settlementCost),
        }));

        return presentRoute(route({ side: input.side, qty: parseAmount(input.qty) }, quotes));
      }),
  });
}

export type DexRouter = ReturnType<typeof createDexRouter>;
