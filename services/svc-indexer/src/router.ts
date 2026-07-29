import { z } from 'zod';
import { formatAmount } from '@intafaced/ledger-client/money';
import { publicJurisdictionProcedure, publicProcedure, router, TRPCError } from '@intafaced/contracts';
import { ChainDataError } from './chain/source.js';
import type { FillRecord, PoolReservesRecord, PositionRecord, ProjectionStore } from './projection/store.js';
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

/**
 * ONE POOL'S RESERVES ON THE WIRE — the input `protocol.amm.quoteExactIn` needs.
 *
 * ── Everything here is either a fact or a refusal ───────────────────────────
 *
 * `quoteExactIn` takes `reserveIn` / `reserveOut` and nothing in the platform
 * produced them, so the only way to call it was to make them up. This is the
 * shape that makes it honest, and the fields that are NOT the two numbers are
 * the ones that keep it honest:
 *
 *   · `baseReserve` / `quoteReserve` are `reserve0` / `reserve1` ORIENTED to
 *     the market symbol. A pool orders its tokens by address; a symbol orders
 *     them by meaning, and the two agree by coincidence about half the time.
 *     Handing a consumer only `reserve0`/`reserve1` would make inverting the
 *     price a one-line mistake that produces an entirely plausible number.
 *     Both forms are published: the oriented pair to quote with, the raw pair
 *     because it is what the chain actually says.
 *   · `decimals0` / `decimals1` so the raw uint256 the contract holds can be
 *     reconstructed exactly — see `chain/source.ts` for why that matters for a
 *     token with fewer than 18 decimals.
 *   · `blockHeight` / `blockHash` / `blockTime` / `observedAt` so a consumer
 *     can REFUSE this. See `poolReserves` below.
 */
const poolReservesSchema = z.object({
  market: z.string(),
  pool: z.string(),
  /** Swap fee in bps. Not money — a protocol parameter, as svc-protocol has it. */
  feeBps: z.number().int(),

  token0: z.string(),
  token1: z.string(),
  decimals0: z.number().int(),
  decimals1: z.number().int(),
  /** Decimal strings, human units. `'0'` is a real answer, not a missing one. */
  reserve0: z.string(),
  reserve1: z.string(),

  /** Orientation, as a fact rather than a convention. */
  baseToken: z.string(),
  quoteToken: z.string(),
  baseReserve: z.string(),
  quoteReserve: z.string(),

  /** The block that wrote this reserve pair — this venue's sequence. */
  blockHeight: z.number().int(),
  blockHash: z.string(),
  /** The chain's own clock on that block. Measures lag behind the CHAIN. */
  blockTime: z.string(),
  /** OUR clock, when this projection recorded it. Measures lag behind US. */
  observedAt: z.string(),
  /** Canonical head minus the block that wrote this. `0` is current. */
  lagBlocks: z.number().int(),
});

/**
 * Why reserves could not be served — deliberately NOT collapsed into one code.
 *
 * These map onto `svc-dex`'s own `VenueUnavailableReason` vocabulary, and the
 * distinctions are the same ones it draws: "the indexer is down" and "the
 * indexer is up and has projected nothing" demand different responses from
 * whoever is on call, and a single `unavailable` would hide which one happened.
 */
const poolReservesUnavailableReason = z.enum([
  /** Nothing has been indexed at all — no canonical head. Today's answer. */
  'not_ready',
  /** The projection hit a reorg deeper than retained history. It knows it is wrong. */
  'halted',
  /** The index is live, but no pool has ever been projected for this market. */
  'unknown_pool',
]);

function toWirePoolReserves(row: PoolReservesRecord, headHeight: number): z.infer<typeof poolReservesSchema> {
  const baseIsToken0 = row.baseToken.toLowerCase() === row.token0.toLowerCase();
  return {
    market: row.market,
    pool: row.pool,
    feeBps: row.feeBps,
    token0: row.token0,
    token1: row.token1,
    decimals0: row.decimals0,
    decimals1: row.decimals1,
    reserve0: formatAmount(row.reserve0),
    reserve1: formatAmount(row.reserve1),
    baseToken: row.baseToken,
    quoteToken: baseIsToken0 ? row.token1 : row.token0,
    baseReserve: formatAmount(baseIsToken0 ? row.reserve0 : row.reserve1),
    quoteReserve: formatAmount(baseIsToken0 ? row.reserve1 : row.reserve0),
    blockHeight: row.blockHeight,
    blockHash: row.blockHash,
    blockTime: row.blockTime.toISOString(),
    observedAt: row.observedAt.toISOString(),
    // Never negative: a reserve row is written by a block at or below the head.
    lagBlocks: Math.max(0, headHeight - row.blockHeight),
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
  if (err instanceof ChainDataError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Indexer request failed', cause: err });
}

export interface IndexerRouterDeps {
  readonly store: ProjectionStore;
  readonly indexer: Indexer;
  readonly chainId: number;
  readonly finalityDepth: number;
  /** Mirrors the `indexer.ingest` kill-switch (§14). */
  readonly ingestEnabled: () => boolean;
  /** Which `ChainSource` is wired. `'null'` until `socket.evm-rpc` closes. */
  readonly chainSource: string;
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
     * How far behind the chain this projection is, and whether it trusts
     * itself.
     *
     * `halted` is the field that matters and it is deliberately not buried:
     * a projection that has hit a reorg deeper than its retained history knows
     * it is wrong, and every caller is entitled to be told before it renders a
     * price. `indexedHeight` alone would look perfectly healthy in that state.
     */
    status: publicJurisdictionProcedure('indexer', 'protocol')
      .output(
        z.object({
          chainId: z.number(),
          chainSource: z.string(),
          indexedHeight: z.number().int().nullable(),
          indexedHash: z.string().nullable(),
          /**
           * The head block's OWN timestamp, from the chain.
           *
           * Added because `svc-dex`'s indexer adapter recorded the gap in its
           * own header and could not close it from that side: it can enforce
           * how long ago it READ us, but without this it cannot tell how far
           * behind the chain we are. **A projection that is up, unhalted and
           * twenty blocks behind looks perfectly fresh without this field**,
           * and pricing against it is the exact failure this service exists to
           * prevent. Closing it needed a change here, so it is here.
           */
          indexedBlockTime: z.string().nullable(),
          earliestHeight: z.number().int().nullable(),
          finalityDepth: z.number().int(),
          /** Below this, blocks are treated as final and version history is pruned. */
          finalizedHeight: z.number().int().nullable(),
          ingestEnabled: z.boolean(),
          halted: z.object({ reason: z.string(), at: z.string() }).nullable(),
        }),
      )
      .query(async () => {
        const [head, earliest] = await Promise.all([store.head(), store.earliestHeight()]);
        const halt = indexer.halted;
        return {
          chainId: deps.chainId,
          chainSource: deps.chainSource,
          indexedHeight: head?.height ?? null,
          indexedHash: head?.hash ?? null,
          indexedBlockTime: head?.blockTime.toISOString() ?? null,
          earliestHeight: earliest,
          finalityDepth: deps.finalityDepth,
          finalizedHeight: head ? Math.max(0, head.height - deps.finalityDepth) : null,
          ingestEnabled: deps.ingestEnabled(),
          halted: halt ? { reason: halt.reason, at: halt.at.toISOString() } : null,
        };
      }),

    markets: publicJurisdictionProcedure('indexer', 'protocol')
      .output(z.array(z.string()))
      .query(async () => [...(await store.markets())]),

    /**
     * The book, as of a named block.
     *
     * `asOfHeight` / `asOfHash` are part of the response rather than a detail,
     * because "which chain state is this?" is the question a reorg makes real.
     * A client holding two books can tell whether they describe the same chain;
     * one holding two bare price ladders cannot.
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
          const rows = await withReadSpan('indexer.positions', null, () => store.positionsOf(input.account));
          return rows.map(toWirePosition);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * AMM POOL RESERVES — the missing input to `protocol.amm.quoteExactIn`.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * WHY THIS RETURNS A UNION INSTEAD OF THROWING
     * ═══════════════════════════════════════════════════════════════════════
     *
     * `svc-dex`'s adapters turn any non-200 into `VenueUnavailableReason
     * 'unreachable'`. If this procedure threw a `TRPCError` when it had nothing
     * to serve, the one distinction that matters most would be destroyed in
     * transit: **"the indexer is down" and "the indexer is up and has projected
     * nothing" would arrive as the same word.** They demand different responses
     * from whoever is on call, so the refusal is DATA — a 200 carrying a
     * machine-readable reason — and the transport is left to mean what it
     * means.
     *
     * There is no shape in this response that can be mistaken for reserves.
     * `status: 'unavailable'` carries no `pools` field at all, so a consumer
     * cannot read a reserve off a refusal by forgetting to check a flag.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * WHAT THIS RETURNS TODAY, STATED PLAINLY
     * ═══════════════════════════════════════════════════════════════════════
     *
     * **`{ status: 'unavailable', reason: 'not_ready' }`.** svc-indexer boots on
     * `NullChainSource` — SOCKET §13 (`socket.evm-rpc`). There is no EVM RPC in
     * this stack and no deployed pool contract to read, so nothing has ever
     * been projected and there is no canonical head.
     *
     * That refusal is the deliverable, not a placeholder. The alternative — a
     * reserve of `0`, or a plausible-looking pair — is precisely the failure
     * this whole branch exists to prevent: `quoteExactIn` would happily price
     * against invented numbers and a user would see a rate no pool had ever
     * offered. **A fabricated price in a trading product is worse than an
     * outage**, because an outage stops a user and an invented number
     * encourages one. The moment `socket.evm-rpc` closes and an adapter emits
     * `pool_reserves` events, this procedure starts answering without a line of
     * it changing.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * STALENESS IS THE CALLER'S TO ENFORCE, AND WE OWE THEM THE FACTS
     * ═══════════════════════════════════════════════════════════════════════
     *
     * A reserve projection that lags is a WRONG PRICE, not a slow one, and it
     * has no visible symptom: a stale book shows thin depth and a user can see
     * that, a stale reserve pair produces a confident plausible number. This
     * service does not impose a ceiling — `QUOTE_MAX_AGE_MS` lives with the
     * quote path that knows what the quote is for — but it publishes every
     * clock needed to apply one:
     *
     *   · `observedAt` — when THIS projection recorded the row. Our clock. The
     *     same field `svc-dex` already enforces its ceiling against.
     *   · `blockTime` — the chain's own clock on the writing block.
     *   · `lagBlocks` / `asOfHeight` — how far the canonical head has moved on
     *     since. A pool nobody has traded holds current reserves at an old
     *     height, which is why lag alone is not staleness and both are given.
     *
     * `halted` is checked FIRST and refuses outright. A halted projection knows
     * it is wrong and cannot repair itself; serving reserves from it would be
     * reading the one state this service explicitly declares untrustworthy.
     */
    poolReserves: publicJurisdictionProcedure('indexer', 'protocol')
      .input(
        z.object({
          market: marketSchema,
          /** Narrow to one pool. Omitted, every pool projected for the market. */
          pool: addressSchema.optional(),
        }),
      )
      .output(
        z.discriminatedUnion('status', [
          z.object({
            status: z.literal('ok'),
            chainId: z.number(),
            chainSource: z.string(),
            market: z.string(),
            /** The canonical head these reserves are current as of. */
            asOfHeight: z.number().int(),
            asOfHash: z.string(),
            asOfBlockTime: z.string(),
            /** Never empty — an empty list is an `unavailable`, not an `ok`. */
            pools: z.array(poolReservesSchema).min(1),
          }),
          z.object({
            status: z.literal('unavailable'),
            chainId: z.number(),
            chainSource: z.string(),
            market: z.string(),
            reason: poolReservesUnavailableReason,
            /** Human-readable, and it names the socket when that is the cause. */
            detail: z.string(),
            asOfHeight: z.number().int().nullable(),
            asOfHash: z.string().nullable(),
          }),
        ]),
      )
      .query(async ({ input }) => {
        try {
          const common = { chainId: deps.chainId, chainSource: deps.chainSource, market: input.market };

          // Checked before anything is read. A projection that knows it is
          // wrong must not be the thing a price is derived from, and finding
          // that out after the read would mean the read decided the answer.
          const halt = indexer.halted;
          if (halt) {
            return {
              ...common,
              status: 'unavailable' as const,
              reason: 'halted' as const,
              detail: `svc-indexer is halted and its projection knows it is wrong: ${halt.reason}`,
              asOfHeight: null,
              asOfHash: null,
            };
          }

          const head = await store.head();
          if (!head) {
            return {
              ...common,
              status: 'unavailable' as const,
              reason: 'not_ready' as const,
              detail:
                `svc-indexer has projected no chain state (chainSource="${deps.chainSource}"), so there are no reserves to serve. ` +
                'Reserves are not defaulted to zero: a zero reserve is a real pool state and inventing one would let a ' +
                'quote path price a swap against liquidity that was never there (SOCKET §13 socket.evm-rpc).',
              asOfHeight: null,
              asOfHash: null,
            };
          }

          const rows = await withReadSpan('indexer.poolReserves', input.market, () =>
            input.pool ? store.poolReserve(input.pool).then((r) => (r ? [r] : [])) : store.poolReservesFor(input.market),
          );

          // A pool looked up by address must actually belong to the market the
          // caller named. Without this, `{ market: 'A-USD', pool: <B-USD pool> }`
          // would answer with B's reserves labelled as A's — a mislabelled
          // price, which is the one thing worse than no price.
          const matching = rows.filter((r) => r.market === input.market);

          if (matching.length === 0) {
            return {
              ...common,
              status: 'unavailable' as const,
              reason: 'unknown_pool' as const,
              detail: input.pool
                ? `no pool ${input.pool} projected for market "${input.market}" at height ${head.height}`
                : `no AMM pool has been projected for market "${input.market}" at height ${head.height}`,
              asOfHeight: head.height,
              asOfHash: head.hash,
            };
          }

          return {
            ...common,
            status: 'ok' as const,
            asOfHeight: head.height,
            asOfHash: head.hash,
            asOfBlockTime: head.blockTime.toISOString(),
            pools: matching.map((row) => toWirePoolReserves(row, head.height)),
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * Every AMM pool this projection knows about. Discovery, like `markets()`.
     *
     * A plain array rather than the union above: "no pools" is an unambiguous
     * answer to "list the pools", and there is no number in an empty list for
     * anything to price against by mistake.
     */
    pools: publicJurisdictionProcedure('indexer', 'protocol')
      .output(
        z.object({
          chainId: z.number(),
          chainSource: z.string(),
          asOfHeight: z.number().int().nullable(),
          asOfHash: z.string().nullable(),
          pools: z.array(poolReservesSchema),
        }),
      )
      .query(async () => {
        try {
          const [head, rows] = await Promise.all([store.head(), store.pools()]);
          return {
            chainId: deps.chainId,
            chainSource: deps.chainSource,
            asOfHeight: head?.height ?? null,
            asOfHash: head?.hash ?? null,
            pools: rows.map((row) => toWirePoolReserves(row, head?.height ?? 0)),
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),
  });
}

export type IndexerRouter = ReturnType<typeof createIndexerRouter>;
