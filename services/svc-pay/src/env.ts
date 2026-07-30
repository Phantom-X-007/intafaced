import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

const schema = serviceEnvSchema
  .merge(internalServiceEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
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

      /**
       * Rails on which an operator may credit a deposit by hand.
       *
       * Default: the sandbox acquirer, and nothing else. An operator credit is an
       * assertion that value arrived; on a real rail that assertion has a
       * counterparty who can be asked, so deposits there belong to that rail's own
       * confirmation path. A hand-typed `crypto-native` credit would move
       * `railBoundary('crypto-native')` away from the chain balance it mirrors,
       * and reconciliation would then report a discrepancy that is really a typo.
       *
       * Widening this is a deliberate operator decision, which is why it is
       * configuration rather than a list in the code.
       */
      PAY_OPERATOR_CREDIT_RAILS: z
        .string()
        .default('card-sandbox')
        .transform((value) =>
          value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),

      /**
       * Let a SANDBOX rail move value in a production-like environment.
       *
       * Default false, and the default is the whole point: with it unset, an
       * `APP_ENV` of `staging` or `prod` refuses to boot while any registered rail
       * declares itself a sandbox (`rails/posture.ts`). A sandbox payout returns a
       * provider reference this codebase invented and the user is told their money
       * moved — so the honest states are "a live rail exists" or "the process does
       * not start", and this flag is the third one an operator has to ask for by
       * name.
       *
       * Legitimate uses: a pilot, a demo, a load test. It is logged loudly on
       * every boot, because it means no user of that deployment is being told
       * anything true about their money leaving the platform.
       */
      PAY_ALLOW_SANDBOX_RAILS: z.enum(['true', 'false']).default('false'),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
