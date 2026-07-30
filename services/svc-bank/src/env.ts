import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema, internalServiceEnvSchema } from '@intafaced/config';

// This service self-mounts /trpc, so it must be able to authenticate the edge.
// Every procedure here resolves `ctx.principal.userId` into somebody's spaces
// and transfers; an unsigned principal header would let a caller name any of
// them (docs/decisions/mount-boundary.md).
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
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

      // ── Loans (§8.1) ───────────────────────────────────────────────────────

      /**
       * Where LTV marks come from. svc-trade's public REST, read over HTTP.
       *
       * A READ of another stream's public surface — no import, no shared table,
       * nothing written back. `loans/prices.ts` sets out what that surface can and
       * cannot currently support, and why a liquidation is refused on the weaker
       * of the two mark qualities it produces.
       */
      TRADE_URL: z.string().url().default('http://localhost:4004'),

      /**
       * The asset LTV is measured in, unless a product says otherwise.
       *
       * Both marks — collateral and debt — are taken against this, so it must be
       * an asset that actually has markets. Getting it wrong does not produce a
       * wrong number; it produces `bank.mark_missing` and no lending at all,
       * which is the right way for a misconfiguration this central to fail.
       */
      LOAN_QUOTE_ASSET_ID: z.string().default('USDT'),

      /**
       * Emergency stop for LOAN interest accrual.
       *
       * Separate from `INTEREST_ACCRUAL_ENABLED`, which stops the earn pools, and
       * it stops the opposite direction of money: earn accrual PAYS users out of
       * a reserve, loan accrual CHARGES borrowers. A single flag would mean
       * halting a runaway payout also stops charging every borrower on the book,
       * and an operator in an incident should not have to accept that trade.
       */
      LOAN_ACCRUAL_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /**
       * THE ONE THAT SELLS PEOPLE'S COLLATERAL.
       *
       * Defaults to OFF. Every other job in this service defaults on, because the
       * worst a bad pass does is move a user's own money between their own
       * accounts, or pay out yield that was funded. The risk sweep seizes and
       * sells collateral, and a first deploy that has not yet had its price
       * source, its thresholds and its liquidation venue checked by a human must
       * not do that on its own initiative.
       *
       * With the sweep off, loans still open, accrue and repay. Nothing is
       * liquidated and margin calls are not raised — so an operator turning this
       * on for the first time should expect a batch of calls, and that is the
       * correct thing to look at before it is the correct thing to automate.
       */
      LOAN_RISK_SWEEP_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /** How many loans one sweep pass marks. Bounds the blast radius of a bad pass. */
      LOAN_SWEEP_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(500),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
