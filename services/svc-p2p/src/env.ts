import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema, internalServiceEnvSchema } from '@intafaced/config';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase())));

// This service self-mounts /trpc, so it must be able to authenticate the edge.
// Releasing escrow is one `p2p:write` check away, and that check reads a
// principal it did not derive — so the header carrying it must be signed, or the
// check is decorative (docs/decisions/mount-boundary.md).
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
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
       * `disputed` → THE MODERATOR SLA, and nothing more than that.
       *
       * Past this the dispute ESCALATES: it is raised, it keeps its (now past)
       * deadline so it stays at the top of the moderator queue, and the escrow
       * does not move. There is no setting here that resolves a dispute,
       * because there is no code path that does.
       *
       * `P2P_DISPUTE_BACKSTOP_SECONDS`, `P2P_DISPUTE_BACKSTOP_RESOLUTION` and
       * `P2P_BACKSTOP_MODERATOR_ID` are gone rather than deprecated. Leaving a
       * `…_RESOLUTION` knob in the environment would say the platform still has
       * an opinion about how to auto-settle a disagreement, and it does not.
       */
      P2P_DISPUTE_SLA_SECONDS: z.coerce
        .number()
        .int()
        .min(3600)
        .default(7 * 24 * 60 * 60),

      /**
       * How often an escalated dispute is raised again.
       *
       * `p2p_trades_live_has_deadline_ck` requires a live trade to carry a
       * deadline. This is the deadline it carries once the SLA is blown — a
       * re-check, not a disposition.
       */
      P2P_DISPUTE_ESCALATION_RECHECK_SECONDS: z.coerce
        .number()
        .int()
        .min(60)
        .default(60 * 60),

      /** How often the timeout + settlement sweeps run. */
      P2P_SWEEP_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
