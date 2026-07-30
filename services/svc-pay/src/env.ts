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

      /**
       * WHICH RAILS MAY SERVE THE PUBLIC HOSTED CHECKOUT, in preference order,
       * as `railId:method` — e.g. `crypto-native:crypto`.
       *
       * CONFIGURATION, NEVER A REQUEST FIELD, and that is the entire reason it
       * lives here rather than as an input on `checkout.open`. A hosted checkout
       * that lets its caller name a rail — or a payment link that resolves to
       * one — is exactly where the sandbox-withdrawal P0 (`rails/posture.ts`)
       * comes back, this time with an anonymous third party's money.
       *
       * `crypto-native` alone by default. It is the only v1 rail that can ever
       * be live (§13: "crypto-native is real from day one"), and `card-sandbox`
       * is deliberately absent: a sandbox capture on the MERCHANT INTEGRATION
       * path leaves the platform short and reconciliation against the rail
       * boundary catches it, but a sandbox capture on the PUBLIC path credits a
       * merchant nobody paid, who can then settle and withdraw it. Widening this
       * is an operator decision with that sentence attached to it.
       */
      PAY_CHECKOUT_RAILS: z
        .string()
        .default('crypto-native:crypto')
        .transform((value) =>
          value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((entry) => {
              const [railId, method] = entry.split(':');
              return { railId: (railId ?? '').trim(), method: (method ?? 'crypto').trim() || 'crypto' };
            })
            .filter((r) => r.railId.length > 0),
        ),

      /**
       * How long a payer's browser handoff stays open.
       *
       * Minutes, not days: a session is one payer's attempt at a checkout, and a
       * stale page showing a live acceptance address is something somebody can
       * be phished with. It NEVER expires the payment behind it — funds sent
       * late still land, are still matched by the rail's webhook, and are still
       * credited to the merchant. See `PayService.getCheckoutSession`.
       */
      PAY_CHECKOUT_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

      /**
       * The lifetime a payment link gets when the merchant does not name one,
       * and the hard ceiling on one that does.
       *
       * A payment link is a capability URL: whoever holds it can pay against it,
       * and it survives in email threads, screenshots and browser history. There
       * is no "never expires" — the service refuses to create one.
       */
      PAY_LINK_DEFAULT_TTL_DAYS: z.coerce.number().int().min(1).max(3_650).default(30),
      PAY_LINK_MAX_TTL_DAYS: z.coerce.number().int().min(1).max(3_650).default(365),

      /**
       * Open checkout sessions allowed against one link at a time.
       *
       * The floor under an anonymous caller opening rows off one URL forever.
       * Not a rate limiter — a rate limiter belongs at the edge, and this is the
       * bound that still holds when the edge is bypassed.
       */
      PAY_CHECKOUT_MAX_OPEN_SESSIONS: z.coerce.number().int().min(1).max(10_000).default(25),

      /**
       * The prefix a BROWSER sees the hosted checkout under.
       *
       * svc-pay serves `/checkout`; svc-edge is the only public listener and
       * routes `/api/pay/*` here with the prefix STRIPPED
       * (`services/svc-edge/src/routes.ts`). Every path the page emits — the
       * form action, the redirect Location — has to carry the prefix back, or a
       * form rendered at `/api/pay/checkout` posts to the edge's root and 404s
       * with the payer watching.
       *
       * Configurable rather than hard-coded because the mount is the EDGE's
       * decision, not this service's, and a constant here would be a second copy
       * of somebody else's route table.
       */
      PAY_PUBLIC_BASE_PATH: z
        .string()
        .default('/api/pay')
        .transform((v) => (v === '/' ? '' : v.replace(/\/+$/, ''))),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
