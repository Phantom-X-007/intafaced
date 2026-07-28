import { z } from 'zod';
import { loadEnv, serviceEnvSchema, internalServiceEnvSchema } from '@intafaced/config';

const schema = serviceEnvSchema.merge(internalServiceEnvSchema).merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-pay'),
    HTTP_PORT: z.coerce.number().int().default(4006),

    /** svc-ledger's internal address. All value movement goes through it. */
    LEDGER_URL: z.string().url().default('http://localhost:4001'),

    /**
     * Webhook signing secret for the chain watcher that feeds `crypto-native`.
     *
     * A forged delivery on this endpoint says "this payment was captured" about
     * money that never moved, so there is no development default: an unset
     * secret fails startup rather than quietly verifying everything.
     */
    PAY_CRYPTO_WEBHOOK_SECRET: z.string().min(32),

    /** Same, for the sandbox acquirer. Sandbox money is still a real state machine. */
    PAY_CARD_SANDBOX_WEBHOOK_SECRET: z.string().min(32),

    /**
     * Confirmations before an on-chain transfer counts as final.
     *
     * The reorg risk budget. Too low and a deep reorg takes back money already
     * settled to a merchant out of a clearing account that has since emptied.
     */
    PAY_MIN_CONFIRMATIONS: z.coerce.number().int().min(1).default(6),

    /**
     * Seconds a signed webhook stays acceptable. Beyond it, a correctly signed
     * delivery is a replay of one somebody observed.
     */
    PAY_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).default(300),

    /**
     * Fee rate for merchants whose own pricing does not state one.
     *
     * Unset by default, on purpose: settlement refuses to run at an unknown
     * price rather than silently settling a merchant at zero, which is revenue
     * that is not merely lost but invisible.
     */
    PAY_DEFAULT_FEE_BPS: z.coerce.number().int().min(0).max(10_000).optional(),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
