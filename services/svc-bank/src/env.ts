import { z } from 'zod';
import { loadEnv, serviceEnvSchema } from '@intafaced/config';

const schema = serviceEnvSchema.merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-bank'),
    HTTP_PORT: z.coerce.number().int().default(4009),

    /** svc-ledger's internal address. All value movement goes through it. */
    LEDGER_URL: z.string().url().default('http://localhost:4001'),

    /**
     * The native asset. svc-bank refuses it in earn pools: native staking lives
     * in svc-token (§8.1), and both would otherwise write to the same
     * `userStake(user, IFC)` ledger account — at which point neither service's
     * table could be reconciled against it. Configurable only so a testnet can
     * run its own symbol.
     */
    TOKEN_ASSET_ID: z.string().default('IFC'),

    /**
     * Emergency stop for the standing-order runner.
     *
     * Separate from a general service toggle because the failure it guards
     * against is different in kind: a bad deploy that mis-computes occurrence
     * indices would fire every schedule in the book, and unlike a bad read there
     * is nothing to roll back — the ledger is append-only and each transfer is a
     * real movement between two real accounts.
     */
    SCHEDULED_TRANSFERS_ENABLED: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

    /**
     * Emergency stop for interest accrual. Same reasoning, opposite direction:
     * interest leaves the pool reserve, and a reserve drained by a runaway job
     * cannot be un-paid without asking users to return money.
     */
    INTEREST_ACCRUAL_ENABLED: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

    /** How many due schedules one runner pass claims. Bounds the blast radius of a bad pass. */
    TRANSFER_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(200),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
