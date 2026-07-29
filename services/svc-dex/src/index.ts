import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client/money';
import { env } from './env.js';
import { createDexRouter } from './router.js';
import type { QuoteVenue } from './quote/venue.js';
import { IndexerQuoteVenue } from './quote/indexer-venue.js';
import { MatchingQuoteVenue } from './quote/matching-venue.js';
import { ExternalQuoteVenue } from './quote/external-venue.js';

/**
 * svc-dex — the Protocol Plane's front door (§8.6, §17.5).
 *
 * Non-custodial by construction, and provably so: `custody-scan` fails the
 * build if this service imports a ledger write recipe, and its environment
 * carries no `INTERNAL_SERVICE_SECRET`, so it could not reach `ledger.post`
 * even if an import slipped past the scanner.
 *
 * That is what earns the permissionless surface. §585: "If the platform never
 * holds the asset → the feature ships permissionless: no KYC, no KYB, no
 * account gate beyond a wallet."
 */

/**
 * WHERE PRICES COME FROM, WIRED — the §27 venue set.
 *
 * Three kinds of venue, one interface. `LiquiditySource`'s header states why
 * that matters: the internal book implements the same type as everyone else, so
 * the router has no notion of "ours" versus "theirs" and cannot quietly favour
 * us. svc-dex ranks on effective price alone.
 *
 *   · `intachain-clob`  — on-chain, self-custody. The sovereign leg.
 *   · `internal-book`   — our engine. Custodial, and disclosed as such.
 *   · external venues   — operator configuration, none by default.
 *
 * Built per request from the caller's already-screened region, so the region
 * this service admitted is the region it reads upstream as.
 *
 * The timeout is `QUOTE_MAX_AGE_MS` on purpose: a fetch that outlives the
 * staleness ceiling produces a book too old to price against the moment it
 * lands, so waiting longer only turns a fast refusal into a slow one.
 *
 * Adapters, not integrations (Doctrine §0.4) — and none of them can move value:
 * every one declares `capabilities: ['quote', 'orderbook']` and throws on
 * `submit`.
 */
const venuesFor = (region: string): readonly QuoteVenue[] => {
  const venues: QuoteVenue[] = [
    new IndexerQuoteVenue({
      baseUrl: env.INDEXER_URL,
      timeoutMs: env.QUOTE_MAX_AGE_MS,
      quoteTtlMs: env.QUOTE_MAX_AGE_MS,
      feeBps: env.DEX_CLOB_FEE_BPS,
      settlementCost: parseAmount(env.DEX_CLOB_SETTLEMENT_COST),
      region,
    }),
  ];

  if (env.DEX_INTERNAL_BOOK_ENABLED) {
    venues.push(
      new MatchingQuoteVenue({
        baseUrl: env.MATCHING_URL,
        timeoutMs: env.QUOTE_MAX_AGE_MS,
        quoteTtlMs: env.QUOTE_MAX_AGE_MS,
        feeBps: env.DEX_INTERNAL_BOOK_FEE_BPS,
      }),
    );
  }

  for (const config of env.DEX_EXTERNAL_VENUES) {
    venues.push(
      new ExternalQuoteVenue({
        config,
        baseUrl: config.depthUrl,
        timeoutMs: env.QUOTE_MAX_AGE_MS,
        quoteTtlMs: env.QUOTE_MAX_AGE_MS,
      }),
    );
  }

  return venues;
};

export const appRouter = createDexRouter({
  venues: venuesFor,
  maxAgeMs: env.QUOTE_MAX_AGE_MS,
  depth: env.DEX_QUOTE_DEPTH,
});
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

// Built before the listener opens. The edge secret is still required even
// though every procedure is permissionless: a signed principal may arrive (a
// user who also holds a Fiat Plane account), and if one does, it must be
// verified rather than believed.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  // Stated on the readiness probe on purpose: an operator, or an auditor,
  // should be able to confirm the custody posture without reading source.
  custodial: false,
  plane: 'protocol',
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, plane: 'protocol', custodial: false }, 'svc-dex ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      process.exit(0);
    })();
  });
}
