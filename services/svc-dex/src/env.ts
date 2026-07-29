import { z } from 'zod';
import { baseEnvSchema, edgeEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';
import { externalVenueConfigSchema } from './quote/external-venue.js';

/**
 * svc-dex environment.
 *
 * **No `DATABASE_URL` and no `INTERNAL_SERVICE_SECRET`, deliberately.**
 *
 * The Protocol Plane holds no balances of ours: state lives on chain and is
 * projected into read models by svc-indexer. A database here would eventually
 * hold a position, and a position we hold is custody (Doctrine §16.10).
 *
 * The internal service secret is what lets a service call `ledger.post`.
 * Withholding it means a bug in this service cannot become a ledger write even
 * if someone imports the wrong module — `custody-scan` catches the import, and
 * the missing secret catches anything that slips past it.
 */
const schema = baseEnvSchema
  .merge(httpEnvSchema)
  .merge(otelEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-dex'),
      HTTP_PORT: z.coerce.number().int().default(4010),

      /** Read models. Quotes are served from projections, never from a chain call. */
      // 4013 = svc-indexer (4012 is svc-protocol). Matching listens on 4005.
      INDEXER_URL: z.string().url().default('http://localhost:4013'),
      /** The internal CLOB, quoted as one venue among several. */
      MATCHING_URL: z.string().url().default('http://localhost:4005'),

      /**
       * Quote staleness ceiling. A router that acts on an old quote routes to a
       * price that no longer exists — which looks to the user like the venue
       * lied to them.
       *
       * Enforced in `quote/quote-service.ts` against `VenueBook.observedAt` —
       * the moment THIS process finished reading a venue, not a timestamp the
       * venue supplied. It doubles as the per-venue fetch timeout: waiting
       * longer than the answer can be valid for only converts a fast refusal
       * into a slow one.
       */
      QUOTE_MAX_AGE_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),

      /** Book levels pulled from each venue when pricing a size. */
      DEX_QUOTE_DEPTH: z.coerce.number().int().min(1).max(200).default(50),

      /**
       * Quote the Fiat Plane internal book alongside the on-chain one (§8.6).
       *
       * ON by default, because §8.6 is explicit — "internal book vs. pool quote
       * → best execution" — and hiding a venue that genuinely has the better
       * price costs the user money.
       *
       * What it does not do is hide the consequence: every venue in a
       * `dex.quote` response carries `plane` and `custodial`, so a caller who
       * wants only sovereign liquidity can see which legs are which. An operator
       * who wants this front door to quote nothing custodial sets it to `false`,
       * and the quote path is then Protocol Plane end to end.
       */
      DEX_INTERNAL_BOOK_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /**
       * ── Venue cost parameters ─────────────────────────────────────────────
       *
       * SOCKET §13 — `socket.dex-fee-source`. These are CONFIGURED, not sourced.
       *
       * A taker fee and a settlement cost are both price components: understate
       * either and the effective price reported is better than the one the user
       * actually gets. The authoritative figures cannot be read yet — the
       * per-market spot schedule lives in svc-trade's own `markets` row (§2
       * forbids reading another service's tables), and the on-chain CLOB has no
       * deployed contract to publish one.
       *
       * So they are stated here, and every response discloses the exact `feeBps`
       * and `settlementCost` applied per venue. A caller can check the arithmetic
       * against the venue's real schedule; nobody is silently quoted a fee we
       * chose, because the response says which one was used.
       */

      /** Taker fee on the on-chain CLOB, in bps. */
      DEX_CLOB_FEE_BPS: z.coerce.number().int().min(0).max(9_999).default(0),

      /**
       * Gas for an on-chain fill, in the QUOTE asset, as a decimal string.
       *
       * `'0'` today, and that is an UNDERSTATEMENT declared rather than hidden:
       * converting gas into the quote asset needs a gas oracle and a
       * native-token price, and neither exists in this stack. It costs nothing
       * in practice because there is no chain for that venue to read
       * (`socket.evm-rpc`), and it must be set before the first real on-chain
       * quote is served.
       */
      DEX_CLOB_SETTLEMENT_COST: z
        .string()
        .regex(/^\d+(\.\d{1,18})?$/, 'settlement cost is a decimal string with at most 18 decimal places')
        .default('0'),

      /**
       * Taker fee on the internal book, in bps.
       *
       * Settlement there is a ledger post, so there is no gas leg and therefore
       * no settlement-cost knob beside it — a fabricated one would be worse than
       * none.
       */
      DEX_INTERNAL_BOOK_FEE_BPS: z.coerce.number().int().min(0).max(9_999).default(20),

      /**
       * EXTERNAL VENUES — the §27 multi-venue fabric, as configuration.
       *
       * A JSON array of `externalVenueConfigSchema` rows. No venue is named in
       * shipped code: adding one is config (Doctrine §0.4 — adapters, not
       * integrations; Doctrine §0.7 — no vendor names in the repo), and an
       * operator can add, reweight or drop a venue without a deploy.
       *
       * **Empty by default, deliberately.** A service that had no outbound
       * network egress yesterday does not silently acquire it because a package
       * was upgraded. Every venue is an explicit operator decision.
       *
       * Public depth needs no credentials on any tier-one venue, so quotes work
       * the moment a row is added. Execution does need keys, and there is no
       * execution path here at all — every adapter refuses `submit` (§28 owns
       * that, and it is not built).
       *
       * Example (one venue, tokens substituted per `renderDepthUrl`):
       *   [{"id":"venue-a","depthUrl":"https://…/depth?symbol={symbolCompact}&limit={limit}","feeBps":10}]
       */
      DEX_EXTERNAL_VENUES: z
        .string()
        .default('[]')
        .transform((raw, ctx) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch (err) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `DEX_EXTERNAL_VENUES is not valid JSON: ${(err as Error).message}` });
            return z.NEVER;
          }
          const result = z.array(externalVenueConfigSchema).safeParse(parsed);
          if (!result.success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `DEX_EXTERNAL_VENUES is malformed: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
            });
            return z.NEVER;
          }
          return result.data;
        }),
    }),
  );

export const env = loadEnv(schema);
export type DexEnv = typeof env;
