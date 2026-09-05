import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema, internalServiceEnvSchema } from '@intafaced/config';
import { parseOwnerIntegerEnv } from './fee-bps-env.js';

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
       * svc-identity base for affiliate accrue/payout after escrowRelease.
       * Unset → noop port (release still posts). No localhost default.
       */
      IDENTITY_URL: z.string().url().optional(),

      /**
       * KILL-SWITCH (§14 admin controls).
       *
       * OFF stops new offers and new takes. It deliberately does NOT stop
       * release, refund, dispute resolution or the sweeps: a switch that could
       * freeze settlement would be a switch that strands every open escrow, which
       * is the exact failure this service exists to make impossible.
       */
      P2P_TRADING_ENABLED: bool.default(true),

      /**
       * Platform fee, in bps, taken off the escrowed amount at release.
       * Blank / unset → null. Callers refuse `p2p.fee_bps_unset` — never invent 30.
       */
      P2P_FEE_BPS: z
        .union([z.string(), z.number()])
        .optional()
        .transform((raw) => parseOwnerIntegerEnv(raw)),

      /**
       * Largest `maxAmt` an offer may advertise — the merchant badge's first
       * real entitlement (`merchant-limits.ts` argues why the numbers are not
       * invented in code).
       *
       * DECIMAL STRINGS, not numbers — or the literal `unlimited` when the
       * owner confirms no ceiling. An amount that arrives through
       * `z.coerce.number()` has already been through a float by the time
       * anything reads it. Left unset they are `null` with mode `unset`
       * (operationally still no cap, same as before Stage 2). That is not the
       * same claim as writing `unlimited`.
       */
      /**
       * Compose pass-through uses `${VAR:-}` so a clean clone injects "".
       * Empty is unset (same as omitted) — never a baked magnitude.
       */
      P2P_OFFER_MAX_STANDARD: z.preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z
          .string()
          .regex(/^(unlimited|\d+(\.\d+)?)$/i, 'P2P_OFFER_MAX_STANDARD must be a non-negative decimal string or the literal unlimited')
          .optional(),
      ),
      P2P_OFFER_MAX_MERCHANT: z.preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z
          .string()
          .regex(/^(unlimited|\d+(\.\d+)?)$/i, 'P2P_OFFER_MAX_MERCHANT must be a non-negative decimal string or the literal unlimited')
          .optional(),
      ),

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

      /**
       * How long a CLOSED trade keeps the account details it showed the buyer.
       *
       * The API already refuses to disclose a terminal trade's snapshot; this
       * is the other half of the same promise, because "you cannot read it" and
       * "we no longer have it" are different statements and only the second
       * survives a database being copied. The purge keeps the fingerprint, so
       * a late appeal can still be told whether the account a seller now names
       * is the one the buyer was shown — without us holding the account to say
       * so.
       *
       * The NUMBER is an operator decision, not an engineering one: it trades
       * the ability to adjudicate a late appeal against holding personal data
       * we no longer need, and where a market imposes its own retention rule
       * that rule wins. The default is set well clear of the default 7-day
       * dispute SLA. The cross-field check after this object enforces that
       * retention (in seconds) is never shorter than `P2P_DISPUTE_SLA_SECONDS`,
       * so a purge cannot race an open appeal even if both knobs are retuned.
       */
      P2P_INSTRUMENT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3_650).default(90),

      /**
       * HUMAN MODERATORS this deployment will actually serve.
       *
       * Comma-separated lowercase canonical UUIDs. Empty (the default) means
       * moderation is NOT configured: `disputes.list` / `disputes.resolve`
       * honest-refuse with `p2p.moderation_unreachable` rather than sitting
       * behind `admin:compliance` that no user session can hold (D-S-08).
       * Named ids moderate with ordinary `p2p:read`. This is not the
       * `p2p:moderate` scope split — that remains an owner sign-off.
       */
      P2P_MODERATOR_USER_IDS: z.string().default(''),
    }),
  )
  .superRefine((value, ctx) => {
    // Audit P4 (2026-08-08): a 60-day SLA with a 30-day retention floor was a
    // valid config before this check, and the purge then raced open appeals.
    const retentionSeconds = value.P2P_INSTRUMENT_RETENTION_DAYS * 24 * 60 * 60;
    if (retentionSeconds < value.P2P_DISPUTE_SLA_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['P2P_INSTRUMENT_RETENTION_DAYS'],
        message:
          `P2P_INSTRUMENT_RETENTION_DAYS (${value.P2P_INSTRUMENT_RETENTION_DAYS}d = ${retentionSeconds}s) ` +
          `must be at least P2P_DISPUTE_SLA_SECONDS (${value.P2P_DISPUTE_SLA_SECONDS}s), ` +
          `or a purge can race an open dispute appeal.`,
      });
    }
  });

export const env = loadEnv(schema);
export type Env = typeof env;
