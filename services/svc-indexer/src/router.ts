import { z } from 'zod';
import { formatAmount } from '@intafaced/ledger-client/money';
import { publicJurisdictionProcedure, publicProcedure, router, TRPCError } from '@intafaced/contracts';
import { ChainDataError } from './chain/source.js';
import type { FillRecord, PositionRecord, ProjectionStore } from './projection/store.js';
import type { Indexer } from './indexer.js';
import { withReadSpan } from './tracing.js';

/**
 * svc-indexer's API — the read path for `apps/web` (§17.5).
 *
 * ── Read the guards ────────────────────────────────────────────────────────
 *
 * EVERY data procedure is `publicJurisdictionProcedure('indexer', 'protocol')`.
 * No login, no KYC tier, no account gate. That is §22 as code:
 * `MODULES.indexer` is `custodial: false` on the `protocol` plane, so
 * `checkAccess` returns `allowed.permissionless` and there is nothing to
 * verify, because there is nothing held. `sovereignty.test.ts` asserts that for
 * every region and every tier rather than trusting the reading.
 *
 * There is no scoped procedure anywhere in this router, and there could not
 * usefully be one. Every fact here is a copy of public chain state: the book,
 * the tape, and a position at an address anyone can already query from any
 * node. Putting an account gate in front of a mirror of public data would not
 * protect a user, it would only make the mirror worse than the original.
 *
 * ── Money on the wire ──────────────────────────────────────────────────────
 *
 * Decimal strings, always. `formatAmount` is the only thing that renders a
 * price in this file; nothing here constructs a `number` from an amount. A
 * client that wants arithmetic parses the string — it does not get handed a
 * float that already lost the last decimal place.
 */

const marketSchema = z.string().min(1).max(64);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address');

/** `['30000.5', '2.25']` — price, quantity. */
const wireLevelSchema = z.tuple([z.string(), z.string()]);

const fillSchema = z.object({
  market: z.string(),
  price: z.string(),
  quantity: z.string(),
  takerSide: z.enum(['buy', 'sell']),
  maker: z.string(),
  taker: z.string(),
  blockHeight: z.number().int(),
  blockHash: z.string(),
  logIndex: z.number().int(),
  blockTime: z.string(),
});

const positionSchema = z.object({
  market: z.string(),
  account: z.string(),
  /** Signed decimal string — negative is short. */
  size: z.string(),
  entryPrice: z.string(),
  blockHeight: z.number().int(),
  blockHash: z.string(),
});

function toWireFill(fill: FillRecord): z.infer<typeof fillSchema> {
  return {
    market: fill.market,
    price: formatAmount(fill.price),
    quantity: formatAmount(fill.quantity),
    takerSide: fill.takerSide,
    maker: fill.maker,
    taker: fill.taker,
    blockHeight: fill.blockHeight,
    blockHash: fill.blockHash,
    logIndex: fill.logIndex,
    blockTime: fill.blockTime.toISOString(),
  };
}

function toWirePosition(position: PositionRecord): z.infer<typeof positionSchema> {
  return {
    market: position.market,
    account: position.account,
    size: formatAmount(position.size),
    entryPrice: formatAmount(position.entryPrice),
    blockHeight: position.blockHeight,
    blockHash: position.blockHash,
  };
}

function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  if (err instanceof ChainDataError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Indexer request failed', cause: err });
}

/**
 * A live look at the chain behind the projection. Produced by
 * `EvmChainSource.probe()`, which never throws — "the chain is down" is an
 * answer a status surface has to render, not an exception it has to catch.
 *
 * `NullChainSource` fills this in too, with `kind: 'null'` and a reason, because
 * "we were never given a chain" is a fact a caller needs as much as "the chain
 * is down" and the two must not render the same.
 */
export interface ChainProbe {
  readonly kind: 'null' | 'evm';
  readonly rpcUrl: string | null;
  readonly venue: string | null;
  readonly reachable: boolean;
  readonly observedChainId: number | null;
  /** The chain's own tip. Half of the staleness answer; the cursor is the other. */
  readonly chainHeight: number | null;
  readonly venueDeployed: boolean;
  readonly refusalCode: string | null;
  readonly reason: string | null;
}

const chainProbeSchema = z.object({
  kind: z.enum(['null', 'evm']),
  rpcUrl: z.string().nullable(),
  venue: z.string().nullable(),
  reachable: z.boolean(),
  observedChainId: z.number().int().nullable(),
  chainHeight: z.number().int().nullable(),
  venueDeployed: z.boolean(),
  refusalCode: z.string().nullable(),
  reason: z.string().nullable(),
});

export interface IndexerRouterDeps {
  readonly store: ProjectionStore;
  readonly indexer: Indexer;
  readonly chainId: number;
  readonly finalityDepth: number;
  /** Mirrors the `indexer.ingest` kill-switch (§14). */
  readonly ingestEnabled: () => boolean;
  /** Which `ChainSource` is wired: `'null'` or `'evm'`. */
  readonly chainSource: string;
  /**
   * Live probe of the chain, for `status`. Optional so a router can be mounted
   * without one; when it is absent `status.chain` is `null`, which reads as
   * "nobody asked" and never as "the chain is fine".
   */
  readonly chainProbe?: () => Promise<ChainProbe>;
}

/**
 * Chain-door failures that make a served book a lie about "live" state
 * (D26-P1-I3). Status still surfaces `lastError`; data paths refuse.
 */
const CHAIN_DOOR_REFUSE_CODES = new Set([
  'indexer.chain_not_configured',
  'indexer.chain_unreachable',
  'indexer.chain_id_mismatch',
  'indexer.venue_not_deployed',
  'indexer.malformed_block',
]);

/**
 * A halted projection knows its book is wrong and cannot repair it.
 * A projection whose last sync hit a typed chain-door failure likewise must
 * not serve prices as current. `status` and `health` still answer so an
 * operator can see why; every data procedure refuses so a client that never
 * checks `status.halted` / `status.lastError` cannot render a fake book.
 */
function assertServing(indexer: Indexer): void {
  const halt = indexer.halted;
  if (halt) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: `Indexer halted — projection is known wrong and will not serve data until re-indexed. ${halt.reason}`,
    });
  }
  const failure = indexer.lastError;
  if (failure?.code && CHAIN_DOOR_REFUSE_CODES.has(failure.code)) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: `Indexer chain door refused (${failure.code}) — will not serve projected books as live. ${failure.message}`,
    });
  }
}

export function createIndexerRouter(deps: IndexerRouterDeps) {
  const { store, indexer } = deps;

  return router({
    health: publicProcedure
      .output(
        z.object({
          ok: z.boolean(),
          service: z.literal('svc-indexer'),
          chainId: z.number(),
          custodial: z.literal(false),
          ingestEnabled: z.boolean(),
        }),
      )
      .query(() => ({
        ok: true,
        service: 'svc-indexer' as const,
        chainId: deps.chainId,
        custodial: false as const,
        ingestEnabled: deps.ingestEnabled(),
      })),

    /**
     * How far behind the chain this projection is, and whether it trusts itself.
     *
     * ── The three fields that matter, and why none of them is optional ───────
     *
     * `halted` — a projection that has hit a reorg deeper than its retained
     * history knows it is wrong. `indexedHeight` looks perfectly healthy in that
     * state, so the halt is published beside it rather than left to `/ready`.
     *
     * `behindBy` — the cursor alone cannot say how stale it is. "Height 8412"
     * means nothing without the chain's own tip next to it, and a read model that
     * cannot state its staleness gets trusted at exactly the moment it should not
     * be. `null` here means we could not ask, which is itself the answer: it is
     * never zero-by-default, because zero would read as "current".
     *
     * `lastError` — the pass that ends in neither progress nor a halt. The
     * endpoint is down, the venue holds no code, the node is on another chain:
     * the cursor freezes at a plausible number and nothing else on this response
     * would change. See `Indexer.lastError`.
     *
     * Always answers, including when halted — that is how a caller learns why
     * data procedures refuse.
     */
    status: publicJurisdictionProcedure('indexer', 'protocol')
      .output(
        z.object({
          chainId: z.number(),
          chainSource: z.string(),
          indexedHeight: z.number().int().nullable(),
          indexedHash: z.string().nullable(),
          earliestHeight: z.number().int().nullable(),
          finalityDepth: z.number().int(),
          /** Below this, blocks are treated as final and version history is pruned. */
          finalizedHeight: z.number().int().nullable(),
          ingestEnabled: z.boolean(),
          halted: z.object({ reason: z.string(), at: z.string() }).nullable(),
          /** Live, per request. `null` when no probe is wired — never a guess. */
          chain: chainProbeSchema.nullable(),
          /** Chain tip minus our cursor. `null` when either is unknown. */
          behindBy: z.number().int().nullable(),
          lastError: z.object({ code: z.string().nullable(), message: z.string(), at: z.string() }).nullable(),
        }),
      )
      .query(async () => {
        const [head, earliest, chain] = await Promise.all([store.head(), store.earliestHeight(), deps.chainProbe?.() ?? null]);
        const halt = indexer.halted;
        const failure = indexer.lastError;
        const indexedHeight = head?.height ?? null;
        return {
          chainId: deps.chainId,
          chainSource: deps.chainSource,
          indexedHeight,
          indexedHash: head?.hash ?? null,
          earliestHeight: earliest,
          finalityDepth: deps.finalityDepth,
          finalizedHeight: head ? Math.max(0, head.height - deps.finalityDepth) : null,
          ingestEnabled: deps.ingestEnabled(),
          halted: halt ? { reason: halt.reason, at: halt.at.toISOString() } : null,
          chain,
          behindBy: chain?.chainHeight != null && indexedHeight != null ? chain.chainHeight - indexedHeight : null,
          lastError: failure ? { code: failure.code, message: failure.message, at: failure.at.toISOString() } : null,
        };
      }),

    markets: publicJurisdictionProcedure('indexer', 'protocol')
      .output(z.array(z.string()))
      .query(async () => {
        assertServing(indexer);
        return [...(await store.markets())];
      }),

    /**
     * The book, as of a named block.
     *
     * `asOfHeight` / `asOfHash` are part of the response rather than a detail,
     * because "which chain state is this?" is the question a reorg makes real.
     * A client holding two books can tell whether they describe the same chain;
     * one holding two bare price ladders cannot.
     *
     * Refuses when halted or when the chain door last failed with a typed code
     * (D26-P1-I3) — a wrong/stale-as-live price costs a trade.
     */
    book: publicJurisdictionProcedure('indexer', 'protocol')
      .input(z.object({ market: marketSchema, depth: z.number().int().min(1).max(200).default(50) }))
      .output(
        z.object({
          market: z.string(),
          chainId: z.number(),
          asOfHeight: z.number().int().nullable(),
          asOfHash: z.string().nullable(),
          bids: z.array(wireLevelSchema),
          asks: z.array(wireLevelSchema),
        }),
      )
      .query(async ({ input }) => {
        try {
          assertServing(indexer);
          const view = await withReadSpan('indexer.book', input.market, () => store.book(input.market, input.depth));
          return {
            market: view.market,
            chainId: view.chainId,
            asOfHeight: view.asOfHeight,
            asOfHash: view.asOfHash,
            bids: view.bids.map((l) => [formatAmount(l.price), formatAmount(l.quantity)] as [string, string]),
            asks: view.asks.map((l) => [formatAmount(l.price), formatAmount(l.quantity)] as [string, string]),
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    fills: publicJurisdictionProcedure('indexer', 'protocol')
      .input(z.object({ market: marketSchema, limit: z.number().int().min(1).max(500).default(100) }))
      .output(z.array(fillSchema))
      .query(async ({ input }) => {
        try {
          assertServing(indexer);
          const rows = await withReadSpan('indexer.fills', input.market, () => store.recentFills(input.market, input.limit));
          return rows.map(toWireFill);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /** An address's own tape. Public chain data, so public here (§22). */
    accountFills: publicJurisdictionProcedure('indexer', 'protocol')
      .input(z.object({ account: addressSchema, limit: z.number().int().min(1).max(500).default(100) }))
      .output(z.array(fillSchema))
      .query(async ({ input }) => {
        try {
          assertServing(indexer);
          const rows = await withReadSpan('indexer.accountFills', null, () => store.fillsForAccount(input.account, input.limit));
          return rows.map(toWireFill);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    position: publicJurisdictionProcedure('indexer', 'protocol')
      .input(z.object({ market: marketSchema, account: addressSchema }))
      .output(positionSchema.nullable())
      .query(async ({ input }) => {
        try {
          assertServing(indexer);
          const row = await withReadSpan('indexer.position', input.market, () => store.position(input.market, input.account));
          return row ? toWirePosition(row) : null;
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    positions: publicJurisdictionProcedure('indexer', 'protocol')
      .input(z.object({ account: addressSchema }))
      .output(z.array(positionSchema))
      .query(async ({ input }) => {
        try {
          assertServing(indexer);
          const rows = await withReadSpan('indexer.positions', null, () => store.positionsOf(input.account));
          return rows.map(toWirePosition);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),
  });
}

export type IndexerRouter = ReturnType<typeof createIndexerRouter>;
