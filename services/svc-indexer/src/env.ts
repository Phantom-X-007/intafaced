import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';
import { DEV_VENUE_ADDRESS, ZERO_VENUE_ADDRESS } from './clob-honesty.js';

export { DEV_VENUE_ADDRESS, ZERO_VENUE_ADDRESS };

/**
 * Environment for svc-indexer.
 *
 * Note what this service does NOT need, and must never acquire:
 *
 *   · no signing key of any kind. A read model originates no transaction, so
 *     there is nothing here for a key to authorise (§16.10)
 *   · no ledger connection, and no `LEDGER_URL`. This plane posts nothing —
 *     `custody-scan` asserts it, and `sovereignty.test.ts` asserts it again
 *   · no write credentials against any other service's schema (§2)
 *
 * If a future change adds a private key or a ledger URL to this file, that
 * change is either wrong or belongs in svc-bridge, which is custodial by design
 * (§17.3).
 *
 * `EDGE_PRINCIPAL_SECRET` is here because this service self-mounts `/trpc`
 * (docs/decisions/mount-boundary.md). Every read procedure is permissionless,
 * so the secret authorises nothing — but the mount recipe is the mount recipe,
 * and a service that cannot tell an edge-vouched principal from a caller-typed
 * one should not be the service that decides it does not need to.
 */
const schema = serviceEnvSchema.merge(edgeEnvSchema).merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-indexer'),
    // 4013: every port from 4000 to 4012 is taken by another service in
    // docker-compose.apps.yml, and a default that collides is a default that
    // works on a laptop and fails in the fleet.
    HTTP_PORT: z.coerce.number().int().default(4013),

    /** The chain being projected. Matches `PROTOCOL_CHAIN_ID` in svc-protocol. */
    INDEXER_CHAIN_ID: z.coerce.number().int().positive().default(31337),

    /**
     * EVM JSON-RPC endpoint. EMPTY means "there is no chain", and that is the
     * default on purpose.
     *
     * `src/index.ts` picks the source from this: empty → `NullChainSource`, which
     * reports no chain and says so on `status`. Set → the real `EvmChainSource`.
     * There is no third state and nothing in between, because the in-between
     * state is the one where a service quietly indexes nothing and serves the
     * result as a book.
     *
     * A default of `http://localhost:8545` would be worse than empty: on a
     * machine where something else happens to listen there, the indexer would
     * start following a chain nobody chose.
     */
    INDEXER_RPC_URL: z.string().default(''),

    /**
     * The venue contract whose logs are this read model's only input.
     *
     * Dev defaults to the deterministic disposable Anvil deployment; prod
     * defaults to the zero address and `EvmChainSource` refuses it. `eth_getLogs`
     * against `0x0` does not fail — it returns `[]`, forever — so production's
     * loud zero is surfaced as `indexer.venue_unset`.
     */
    INDEXER_VENUE_ADDRESS: z
      .string()
      .optional()
      .transform((value) => value || (process.env.APP_ENV === 'prod' ? ZERO_VENUE_ADDRESS : DEV_VENUE_ADDRESS))
      .pipe(z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address')),

    /**
     * First height to index — in practice the venue's deployment block.
     *
     * Not cosmetic. Starting from 0 on a chain that has been running a while
     * means thousands of `eth_getBlockByNumber` + `eth_getLogs` round trips over
     * blocks that provably cannot hold a venue log, because the contract did not
     * exist yet. The projection would still be correct; it would just take hours
     * to say anything.
     */
    INDEXER_START_HEIGHT: z.coerce.number().int().min(0).default(0),

    /**
     * How deep a reorg this projection can repair.
     *
     * This is NOT the correctness mechanism — see `projection/store.ts`. Blocks
     * are projected as soon as they are seen and unwound if they are orphaned,
     * so a shallow depth never makes the read model wrong, only more expensive
     * to repair. What this number really controls is how much version history
     * `prune()` retains, and therefore the deepest reorg that can be repaired
     * without a full re-index.
     *
     * 64 because it must exceed anything a healthy chain produces by a wide
     * margin, and the cost of being generous is a bounded number of superseded
     * rows.
     */
    INDEXER_FINALITY_DEPTH: z.coerce.number().int().min(1).max(10_000).default(64),

    /** Poll cadence for the ingest loop, in ms. */
    INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(600_000).default(2_000),

    /** Blocks pulled per sync pass. Bounds how long one pass holds the loop. */
    INDEXER_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(200),

    /**
     * Kill-switch mirror for the `indexer.ingest` flag (§14 admin controls).
     *
     * OFF stops the projection advancing. It does not stop anyone reading the
     * chain — every fact in this database is public and available from any node
     * — so what an operator gets here is a pause on OUR ingestion, never a gate
     * on a user's access. A kill-switch that could do more than that would mean
     * this service was load-bearing for someone's funds, and it is not.
     */
    INDEXER_INGEST_ENABLED: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
