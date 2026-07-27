import { z } from 'zod';
import { loadEnv, serviceEnvSchema } from '@intafaced/config';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase())));

const schema = serviceEnvSchema.merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-p2p'),
    HTTP_PORT: z.coerce.number().int().default(4004),

    /** svc-ledger's internal address. Escrowed value lives there, not here. */
    LEDGER_URL: z.string().url().default('http://localhost:4001'),

    /**
     * KILL-SWITCH (§14 admin controls).
     *
     * OFF stops new offers and new takes. It deliberately does NOT stop
     * release, refund, dispute resolution or the sweeps: a switch that could
     * freeze settlement would be a switch that strands every open escrow, which
     * is the exact failure this service exists to make impossible.
     */
    P2P_TRADING_ENABLED: bool.default(true),

    /** Platform fee, in bps, taken off the escrowed amount at release. */
    P2P_FEE_BPS: z.coerce.number().int().min(0).max(9_999).default(30),

    /** `created` → the take never finished escrowing. Nothing is locked yet. */
    P2P_ESCROW_DEADLINE_SECONDS: z.coerce.number().int().min(30).default(120),

    /** `escrowed` → the buyer never marked the fiat sent. Refunds the seller. */
    P2P_PAYMENT_DEADLINE_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .default(15 * 60),

    /** `fiat_sent` → the seller never confirmed. Opens a dispute, never auto-releases. */
    P2P_RELEASE_DEADLINE_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .default(30 * 60),

    /**
     * `disputed` → no moderator ruled within the SLA.
     *
     * Past this the backstop decides, because a dispute that can stay open
     * forever is the same bug as an escrow that can stay locked forever — it
     * just has a person's name attached to the delay.
     */
    P2P_DISPUTE_BACKSTOP_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .default(7 * 24 * 60 * 60),

    /**
     * How an un-adjudicated dispute resolves when the backstop fires.
     *
     * `refund` by default, and the asymmetry is deliberate: releasing to a
     * buyer who never paid destroys the seller's asset irrecoverably, while
     * refunding a buyer who did pay leaves them a fiat claim they can still
     * pursue through their bank. When we must decide without evidence, we
     * decide the recoverable way.
     */
    P2P_DISPUTE_BACKSTOP_RESOLUTION: z.enum(['release', 'refund']).default('refund'),

    /** The identity recorded as moderator when the backstop rules. Never a real person. */
    P2P_BACKSTOP_MODERATOR_ID: z.string().default('system:p2p-backstop'),

    /** How often the timeout + settlement sweeps run. */
    P2P_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
