import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  formatAmount,
  merchantClearing,
  mulBps,
  parseAmount,
  recipes,
  userAvailable,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import type { PaymentIntent, RailAdapter, RailEvent, RailResult, RailWebhookRequest } from './rails/rail-adapter.js';
import type { RailRegistry } from './rails/registry.js';
import { withMoneySpan, withRailSpan } from './tracing.js';

/**
 * svc-pay — THE PAYMENTS CORE (§6.1).
 *
 * Gateway mode only in this PR. PSP mode, PayFac trees, smart routing, fraud
 * scoring, the checkout builder, subscriptions and plugins are each their own
 * tracker feature; none of them changes anything in this file, which is the
 * point of the shape it has.
 *
 * THREE RULES GOVERN EVERY METHOD HERE.
 *
 * 1. Value moves only through a ledger recipe (Doctrine §0.6). This service
 *    holds no balance. What it holds is a payment id, a merchant id, and an
 *    opinion about what should happen next.
 *
 * 2. Idempotency keys are business keys. `payment.capture:<paymentId>`,
 *    `settlement:<merchantId>:<window>:<assetId>`. A PSP webhook WILL be
 *    delivered twice; that is normal, not exceptional, and every path here is
 *    written on the assumption that it already has been.
 *
 * 3. Every transition appends to `payment_events`. Nothing is overwritten —
 *    the database enforces it with a trigger. `payments.status` is a
 *    projection; the event log is the truth, and it is what the captured and
 *    refunded totals are computed from rather than a column that could drift.
 *
 * ORDERING, AND WHOSE FUNDS ARE STRANDED IF THIS CRASHES EXACTLY HERE.
 *
 * The rule that decides operation order is the direction of the money:
 *
 *   INBOUND  (capture) — the rail moves first, the ledger books second. We only
 *                        ever book value we know has arrived. A crash between
 *                        them leaves money at the rail that is not yet in the
 *                        book: the classic "captured but not settled". Nothing
 *                        is lost, because both halves are idempotent on the
 *                        payment id and re-running finishes the job.
 *
 *   OUTBOUND (refund, payout) — the LEDGER moves first, the rail second. The
 *                        merchant must be shown to have the money before any of
 *                        it is sent somewhere irreversible. A crash between them
 *                        leaves the book correct and a status projection behind,
 *                        which is a reporting problem, not a money problem.
 *
 * Getting those two the wrong way round is how a gateway sends a refund out of
 * a balance that could not cover it.
 */

export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'settled' | 'refunded' | 'disputed' | 'failed';
export type SettlementStatus = 'pending' | 'posted' | 'paid_out' | 'failed';

export type PayErrorCode =
  | 'pay.merchant_not_found'
  | 'pay.merchant_inactive'
  | 'pay.merchant_pricing_invalid'
  | 'pay.payment_not_found'
  | 'pay.profile_not_found'
  | 'pay.link_not_found'
  | 'pay.link_expired'
  | 'pay.invalid_amount'
  | 'pay.invalid_transition'
  | 'pay.capture_exceeds_authorized'
  | 'pay.partial_capture_unsupported'
  | 'pay.refund_exceeds_captured'
  | 'pay.refund_in_flight'
  | 'pay.rail_declined'
  | 'pay.rail_failed'
  | 'pay.rail_amount_mismatch'
  | 'pay.rail_pending'
  | 'pay.webhook_invalid'
  | 'pay.webhook_unmatched'
  | 'pay.nothing_to_settle'
  | 'pay.fee_exceeds_gross'
  | 'pay.invalid_window'
  | 'pay.settlement_not_found'
  // ── User money in and out (`user-money-service.ts`) ──
  | 'pay.rail_unknown'
  /** The rail exists but does not accept hand-typed operator credits. */
  | 'pay.rail_not_creditable'
  /** A rail reference already credited something else. Never resolved by retrying. */
  | 'pay.deposit_conflict'
  | 'pay.withdrawal_not_found'
  /** A client reference already names a different withdrawal. */
  | 'pay.withdrawal_conflict'
  /** Row already terminal-failed; caller must open a new clientRef. */
  | 'pay.withdrawal_failed';

export class PayError extends Error {
  constructor(
    message: string,
    readonly code: PayErrorCode,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PayError';
  }
}

/**
 * §6.1 "custom pricing", as this PR needs it: one rate, in basis points.
 *
 * Optional on read because the column is jsonb and a merchant onboarded by
 * another path may not have one. Settlement then refuses to run rather than
 * quietly settling at zero — see `PayServiceOptions.defaultFeeBps`.
 */
export interface MerchantPricing {
  readonly feeBps?: number;
}

export interface MerchantRecord {
  id: string;
  userId: string;
  mode: 'gateway' | 'psp' | 'payfac';
  tier: number;
  kybStatus: 'none' | 'pending' | 'approved' | 'rejected';
  status: 'pending' | 'active' | 'suspended' | 'closed';
  pricing: MerchantPricing;
  settlementPrefs: Record<string, unknown>;
}

export interface PaymentRecord {
  id: string;
  merchantId: string;
  profileId: string | null;
  /** Scaled bigint. What the rail authorized once a rail has spoken. */
  amount: Amount;
  assetId: string;
  method: string;
  railAdapter: string;
  railRef: string | null;
  status: PaymentStatus;
  createdAt: Date;
}

export interface PaymentView extends PaymentRecord {
  capturedAmount: Amount;
  refundedAmount: Amount;
}

export interface PaymentEventRecord {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  railEventId: string | null;
  ts: Date;
}

export interface SettlementRecord {
  id: string;
  merchantId: string;
  window: string;
  assetId: string;
  gross: Amount;
  fees: Amount;
  net: Amount;
  payoutMethod: string | null;
  payoutRef: string | null;
  /** Rail refusals so far. Part of the payout hold's idempotency key. */
  payoutAttempts: number;
  status: SettlementStatus;
}

export interface WebhookOutcome {
  readonly railId: string;
  readonly eventId: string;
  readonly type: string;
  /** True when this exact delivery has already been processed. Nothing changed. */
  readonly duplicate: boolean;
  readonly paymentId: string | null;
  readonly applied: boolean;
}

export interface PayServiceOptions {
  /**
   * Fee rate used when a merchant's pricing does not state one.
   *
   * There is no silent default of zero: a merchant settled at 0 bps by accident
   * is revenue that is not merely lost but invisible, because nothing ever
   * errors. If this is not configured and the merchant has no rate, settlement
   * refuses to run.
   */
  readonly defaultFeeBps?: number;
}

interface PaymentRow {
  id: string;
  merchant_id: string;
  profile_id: string | null;
  amount: string;
  currency: string;
  method: string;
  rail_adapter: string;
  rail_ref: string | null;
  status: PaymentStatus;
  created_at: Date;
}

interface MerchantRow {
  id: string;
  user_id: string;
  mode: MerchantRecord['mode'];
  tier: number;
  kyb_status: MerchantRecord['kybStatus'];
  status: MerchantRecord['status'];
  pricing: Record<string, unknown>;
  settlement_prefs: Record<string, unknown>;
}

interface SettlementRow {
  id: string;
  merchant_id: string;
  window: string;
  asset_id: string;
  gross: string;
  fees: string;
  net: string;
  payout_method: string | null;
  payout_ref: string | null;
  payout_attempts: number;
  status: SettlementStatus;
}

/** Which statuses may legally follow which. Anything else is a bug, not an edge case. */
const TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  created: ['authorized', 'failed'],
  authorized: ['captured', 'failed'],
  captured: ['settled', 'refunded'],
  settled: ['refunded', 'disputed'],
  refunded: [],
  disputed: [],
  failed: [],
};

export class PayService {
  private readonly defaultFeeBps: number | undefined;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly rails: RailRegistry,
    options: PayServiceOptions = {},
  ) {
    this.defaultFeeBps = options.defaultFeeBps;
  }

  // ── Merchants ──────────────────────────────────────────────────────────────

  async createMerchant(input: {
    userId: string;
    mode?: MerchantRecord['mode'];
    tier?: number;
    kybStatus?: MerchantRecord['kybStatus'];
    status?: MerchantRecord['status'];
    /** A rate is required at onboarding. There is no implicit free processing. */
    pricing: { feeBps: number };
    settlementPrefs?: Record<string, unknown>;
  }): Promise<MerchantRecord> {
    assertFeeBps(input.pricing.feeBps);

    // Keyed on the user: onboarding is retried more than almost anything else
    // in a payments product, and a second merchant row for one account makes
    // "settle this account's takings" ambiguous forever after.
    await this.sql`
      INSERT INTO pay.merchants (user_id, mode, tier, kyb_status, status, pricing, settlement_prefs)
      VALUES (
        ${input.userId}, ${input.mode ?? 'gateway'}, ${input.tier ?? 0}, ${input.kybStatus ?? 'none'},
        ${input.status ?? 'active'}, ${this.sql.json(input.pricing as never)},
        ${this.sql.json((input.settlementPrefs ?? {}) as never)}
      )
      ON CONFLICT (user_id) DO NOTHING
    `;

    const rows = await this.sql<MerchantRow[]>`
      SELECT id, user_id, mode, tier, kyb_status, status, pricing, settlement_prefs
        FROM pay.merchants WHERE user_id = ${input.userId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Merchant for user ${input.userId} not found after insert`, 'pay.merchant_not_found');
    return toMerchant(row);
  }

  async getMerchant(merchantId: string): Promise<MerchantRecord> {
    const rows = await this.sql<MerchantRow[]>`
      SELECT id, user_id, mode, tier, kyb_status, status, pricing, settlement_prefs
        FROM pay.merchants WHERE id = ${merchantId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Merchant ${merchantId} not found`, 'pay.merchant_not_found');
    return toMerchant(row);
  }

  async createProfile(input: {
    merchantId: string;
    checkoutConfig?: Record<string, unknown>;
    feeRouting?: Record<string, unknown>;
    domains?: readonly string[];
  }): Promise<{ id: string; merchantId: string }> {
    await this.getMerchant(input.merchantId);

    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO pay.payment_profiles (merchant_id, checkout_config, fee_routing, domains)
      VALUES (
        ${input.merchantId}, ${this.sql.json((input.checkoutConfig ?? {}) as never)},
        ${this.sql.json((input.feeRouting ?? {}) as never)}, ${(input.domains ?? []) as string[]}
      )
      RETURNING id
    `;
    return { id: rows[0]!.id, merchantId: input.merchantId };
  }

  /**
   * Create a shareable payment link. The raw token is returned once.
   * Hosted page: GET /checkout?token= (see checkout-page.ts).
   */
  async createPaymentLink(input: {
    merchantId: string;
    label: string;
    profileId?: string | null;
    amount?: Amount;
    currency?: string;
    expiresAt?: Date | null;
  }): Promise<{ id: string; token: string; prefix: string; label: string }> {
    await this.getMerchant(input.merchantId);
    if (input.profileId) {
      const profiles = await this.sql<Array<{ id: string }>>`
        SELECT id FROM pay.payment_profiles
         WHERE id = ${input.profileId} AND merchant_id = ${input.merchantId}
      `;
      if (!profiles[0]) throw new PayError('payment profile not found for merchant', 'pay.profile_not_found');
    }

    const token = `pl_${randomBytes(24).toString('base64url')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const prefix = token.slice(0, 10);

    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO pay.payment_links (
        merchant_id, profile_id, token_hash, token_prefix, label, amount, currency, expires_at
      ) VALUES (
        ${input.merchantId},
        ${input.profileId ?? null},
        ${tokenHash},
        ${prefix},
        ${input.label},
        ${input.amount === undefined ? null : formatAmount(input.amount)}::numeric,
        ${input.currency ?? null},
        ${input.expiresAt ?? null}
      )
      RETURNING id
    `;

    return { id: rows[0]!.id, token, prefix, label: input.label };
  }

  /**
   * Public resolve. Returns checkout intent only — no merchant secrets.
   */
  async resolvePaymentLink(token: string): Promise<{
    id: string;
    merchantId: string;
    profileId: string | null;
    label: string;
    amount: string | null;
    currency: string | null;
    checkoutConfig: Record<string, unknown>;
  }> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const rows = await this.sql<
      Array<{
        id: string;
        merchant_id: string;
        profile_id: string | null;
        label: string;
        amount: string | null;
        currency: string | null;
        active: boolean;
        expires_at: Date | null;
        checkout_config: Record<string, unknown> | null;
      }>
    >`
      SELECT l.id, l.merchant_id, l.profile_id, l.label, l.amount::text, l.currency,
             l.active, l.expires_at, p.checkout_config
        FROM pay.payment_links l
        LEFT JOIN pay.payment_profiles p ON p.id = l.profile_id
       WHERE l.token_hash = ${tokenHash}
    `;
    const row = rows[0];
    if (!row || !row.active) throw new PayError('payment link not found', 'pay.link_not_found');
    if (row.expires_at && row.expires_at.getTime() < Date.now()) {
      throw new PayError('payment link expired', 'pay.link_expired');
    }

    return {
      id: row.id,
      merchantId: row.merchant_id,
      profileId: row.profile_id,
      label: row.label,
      amount: row.amount,
      currency: row.currency,
      checkoutConfig: row.checkout_config ?? {},
    };
  }

  async listPaymentLinks(merchantId: string): Promise<
    Array<{
      id: string;
      prefix: string;
      label: string;
      amount: string | null;
      currency: string | null;
      active: boolean;
      expiresAt: string | null;
      createdAt: string;
    }>
  > {
    await this.getMerchant(merchantId);
    const rows = await this.sql<
      Array<{
        id: string;
        token_prefix: string;
        label: string;
        amount: string | null;
        currency: string | null;
        active: boolean;
        expires_at: Date | null;
        created_at: Date;
      }>
    >`
      SELECT id, token_prefix, label, amount::text, currency, active, expires_at, created_at
        FROM pay.payment_links
       WHERE merchant_id = ${merchantId}
       ORDER BY created_at DESC
    `;
    return rows.map((r) => ({
      id: r.id,
      prefix: r.token_prefix,
      label: r.label,
      amount: r.amount,
      currency: r.currency,
      active: r.active,
      expiresAt: r.expires_at?.toISOString() ?? null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** Soft-disable a link so public resolve fails. Token never re-issued. */
  async deactivatePaymentLink(merchantId: string, linkId: string): Promise<{ deactivated: boolean }> {
    await this.getMerchant(merchantId);
    const result = await this.sql`
      UPDATE pay.payment_links
         SET active = false
       WHERE id = ${linkId} AND merchant_id = ${merchantId} AND active = true
    `;
    return { deactivated: result.count > 0 };
  }

  // ── Payment lifecycle ──────────────────────────────────────────────────────

  /**
   * `created`. Nothing has been asked of a rail yet and no value has moved.
   *
   * The rail is chosen by the caller in this PR. Smart routing — geo, method,
   * amount band, risk score, live approval rates — is its own tracker feature
   * and slots in exactly here, choosing `railAdapter`, with nothing else in
   * this file changing.
   */
  async createPayment(input: {
    merchantId: string;
    profileId?: string | null;
    amount: Amount;
    assetId: string;
    method: string;
    railAdapter: string;
    instrument?: PaymentIntent['instrument'];
    customerRef?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentView> {
    if (input.amount <= 0n) throw new PayError('Payment amount must be positive', 'pay.invalid_amount');

    const merchant = await this.getMerchant(input.merchantId);
    if (merchant.status !== 'active') {
      throw new PayError(`Merchant ${merchant.id} is ${merchant.status}`, 'pay.merchant_inactive');
    }

    // Resolved now so an unknown or incapable rail fails before a payment row
    // exists, rather than at authorize time with a buyer watching.
    this.rails.require(input.railAdapter, 'authorize');

    return transaction(
      this.sql,
      async (tx) => {
        const rows = await tx<PaymentRow[]>`
          INSERT INTO pay.payments (merchant_id, profile_id, amount, currency, method, rail_adapter, status)
          VALUES (
            ${input.merchantId}, ${input.profileId ?? null}, ${formatAmount(input.amount)}::numeric,
            ${input.assetId}, ${input.method}, ${input.railAdapter}, 'created'
          )
          RETURNING id, merchant_id, profile_id, amount, currency, method, rail_adapter, rail_ref, status, created_at
        `;
        const row = rows[0]!;

        await appendEvent(tx, row.id, 'created', {
          amount: formatAmount(input.amount),
          assetId: input.assetId,
          method: input.method,
          railAdapter: input.railAdapter,
          customerRef: input.customerRef ?? null,
          // The instrument lives on the `created` event rather than in a column
          // because it is a rail's business, not ours, and because a tokenised
          // instrument is the sort of thing that must never end up in a WHERE
          // clause by accident.
          instrument: input.instrument ?? null,
          metadata: input.metadata ?? {},
        });

        return { ...toPayment(row), capturedAmount: 0n, refundedAmount: 0n };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  /**
   * `created → authorized`.
   *
   * No value moves here on any rail. A card authorization is a promise; a
   * crypto "authorization" is a confirmed transfer that is already ours but is
   * not booked until capture. Either way the ledger is untouched, which is why
   * this method can be retried freely.
   */
  async authorize(paymentId: string): Promise<PaymentView> {
    return withMoneySpan('pay.authorize', { operation: 'authorize', paymentId }, async () => {
      const outcome = await transaction(
        this.sql,
        async (tx) => {
          const row = await lockPayment(tx, paymentId);

          // Idempotent: an authorization that already happened is not an error.
          if (row.status === 'authorized' || row.status === 'captured' || row.status === 'settled') {
            return { declined: false as const, view: await this.view(tx, row) };
          }
          assertTransition(row, 'authorized');

          const adapter = this.rails.require(row.rail_adapter, 'authorize');

          const intent: PaymentIntent = {
            paymentId: row.id,
            merchantId: row.merchant_id,
            amount: parseAmount(row.amount),
            assetId: row.currency,
            method: row.method,
            instrument: await instrumentFor(tx, row.id),
          };

          const result = await withRailSpan(adapter.id, 'authorize', async () => adapter.authorize(intent));
          await appendEvent(tx, row.id, 'rail.authorize', railPayload(result));

          if (!result.ok) {
            await appendEvent(tx, row.id, 'failed', {
              failureCode: result.failureCode ?? 'rail.failed',
              failureReason: result.failureReason ?? null,
            });
            await tx`UPDATE pay.payments SET status = 'failed', updated_at = now() WHERE id = ${row.id}`;
            // Recorded, then thrown OUTSIDE the transaction. Throwing from in
            // here would roll back the very rows that say the payment failed,
            // and the next call would ask a rail that has already declined.
            return { declined: true as const, result, view: await this.view(tx, { ...row, status: 'failed' }) };
          }

          if (result.status === 'pending') {
            // The rail has taken the request but not completed it — on
            // crypto-native, the payer has not sent yet or is not deep enough.
            // The payment stays `created`: nothing has been authorized, and
            // saying otherwise is how a merchant ships against a transfer that
            // is still reorganisable.
            await tx`
              UPDATE pay.payments SET rail_ref = ${result.railRef || null}, updated_at = now() WHERE id = ${row.id}
            `;
            await appendEvent(tx, row.id, 'rail.pending', railPayload(result));
            return { declined: false as const, view: await this.view(tx, { ...row, rail_ref: result.railRef || null }) };
          }

          // What the rail authorized is what was agreed — it may exceed what was
          // asked (a payer who overpays on-chain has still sent the funds, and
          // they are at an address we control). Booking the smaller number would
          // strand the difference.
          await tx`
            UPDATE pay.payments
               SET status = 'authorized', rail_ref = ${result.railRef},
                   amount = ${formatAmount(result.amount)}::numeric, updated_at = now()
             WHERE id = ${row.id}
          `;
          await appendEvent(tx, row.id, 'authorized', { amount: formatAmount(result.amount), railRef: result.railRef });

          return {
            declined: false as const,
            view: await this.view(tx, {
              ...row,
              status: 'authorized',
              rail_ref: result.railRef,
              amount: formatAmount(result.amount),
            }),
          };
        },
        { isolation: 'read committed', maxAttempts: 5 },
      );

      if (outcome.declined) {
        throw new PayError(outcome.result.failureReason ?? 'Rail declined the authorization', 'pay.rail_declined', {
          failureCode: outcome.result.failureCode,
        });
      }

      return outcome.view;
    });
  }

  /**
   * `authorized → captured`. THE INBOUND MONEY PATH.
   *
   * The rail moves first and the ledger books second: we only book value we
   * know has arrived.
   *
   * IF THIS CRASHES BETWEEN THE TWO, whose funds are stranded? Nobody's, but
   * they are in the wrong place for a while — captured at the rail, not yet in
   * the merchant's clearing account. The payment is still `authorized`, the
   * adapter's `capture` is idempotent, and `payment.capture:<paymentId>` means
   * the ledger post cannot double. Re-running this method finishes the job and
   * the merchant is made whole. That is the entire reason both halves are keyed
   * on the payment rather than on the attempt.
   */
  async capture(paymentId: string, options: { amount?: Amount } = {}): Promise<PaymentView> {
    return withMoneySpan('pay.capture', { operation: 'capture', paymentId }, async (span) =>
      transaction(
        this.sql,
        async (tx) => {
          const row = await lockPayment(tx, paymentId);

          if (row.status === 'captured' || row.status === 'settled') return this.view(tx, row);
          assertTransition(row, 'captured');

          const authorized = parseAmount(row.amount);

          if (options.amount !== undefined) {
            if (options.amount > authorized) {
              throw new PayError(
                `Cannot capture ${formatAmount(options.amount)} against an authorization of ${formatAmount(authorized)}`,
                'pay.capture_exceeds_authorized',
                { authorized: formatAmount(authorized), requested: formatAmount(options.amount) },
              );
            }
            if (options.amount < authorized) {
              // §6.1's interface is `capture(ref: string)` — there is nowhere to
              // put a partial amount. Refusing is honest; capturing the full
              // authorization while telling the caller we captured less is not.
              throw new PayError(
                'Partial capture is not expressible through the RailAdapter interface (§6.1) — refund the difference instead',
                'pay.partial_capture_unsupported',
                { authorized: formatAmount(authorized), requested: formatAmount(options.amount) },
              );
            }
          }

          if (!row.rail_ref) {
            throw new PayError(`Payment ${row.id} has no rail reference to capture`, 'pay.invalid_transition');
          }

          const adapter = this.rails.require(row.rail_adapter, 'capture');
          const railRef = row.rail_ref;

          const result = await withRailSpan(adapter.id, 'capture', async () => adapter.capture(railRef));
          await appendEvent(tx, row.id, 'rail.capture', railPayload(result));

          if (!result.ok) {
            // NOT marked failed. An authorization whose capture failed is still
            // an authorization, and a retry is the normal response. Marking it
            // failed here would abandon a buyer's held funds on a transient
            // acquirer error.
            throw new PayError(result.failureReason ?? 'Rail failed to capture', 'pay.rail_failed', {
              failureCode: result.failureCode,
            });
          }

          if (result.amount !== authorized) {
            // The rail captured something other than what we authorized. Book
            // neither number: one of the two systems is wrong and guessing which
            // is how a discrepancy becomes a loss.
            throw new PayError(
              `Rail captured ${formatAmount(result.amount)} against an authorization of ${formatAmount(authorized)}`,
              'pay.rail_amount_mismatch',
              { authorized: formatAmount(authorized), captured: formatAmount(result.amount) },
            );
          }

          const posted = await this.ledger.post(
            recipes.paymentCapture({
              paymentId: row.id,
              merchantId: row.merchant_id,
              assetId: row.currency,
              amount: result.amount,
              rail: adapter.id,
              railRef: result.railRef,
            }),
          );

          await appendEvent(tx, row.id, 'captured', {
            amount: formatAmount(result.amount),
            railRef: result.railRef,
            ledgerTxId: posted.id,
          });
          await tx`UPDATE pay.payments SET status = 'captured', updated_at = now() WHERE id = ${row.id}`;

          span.setAttribute('intafaced.amount', formatAmount(result.amount));
          return this.view(tx, { ...row, status: 'captured' });
        },
        { isolation: 'read committed', maxAttempts: 5 },
      ),
    );
  }

  /**
   * Refund, in full or in part. THE OUTBOUND MONEY PATH.
   *
   * The ledger moves FIRST, in its own committed transaction, and only then is
   * the rail asked to send money out. That order is the whole design:
   *
   *   · The merchant must be shown to have the money before any of it leaves.
   *     A post-settlement refund the merchant cannot cover fails here, at the
   *     ledger, before anything irreversible happens.
   *
   *   · IF THIS CRASHES AFTER THE LEDGER POST AND BEFORE THE RAIL CALL, nothing
   *     is stranded: the book is already correct — the merchant is debited and
   *     the value sits at the rail boundary, which is exactly what "we owe this
   *     to a buyer" means. A `refund.posted` event with no `refunded` sibling is
   *     the marker an operator reconciles from.
   *
   *   · IF THE RAIL THEN REFUSES, the ledger post is reversed and the merchant
   *     gets their money back in the same call.
   *
   * A retry of a refund id that is already in flight is REFUSED rather than
   * re-sent. `RailAdapter.refund(ref, amount)` carries no refund id (§6.1), so
   * the rail cannot dedupe it for us, and "send it again and hope" is how one
   * refund becomes two.
   */
  async refund(paymentId: string, amount: Amount, options: { refundId?: string } = {}): Promise<PaymentView> {
    return withMoneySpan('pay.refund', { operation: 'refund', paymentId, amount: formatAmount(amount) }, async () =>
      this.refundInner(paymentId, amount, options),
    );
  }

  private async refundInner(paymentId: string, amount: Amount, options: { refundId?: string }): Promise<PaymentView> {
    if (amount <= 0n) throw new PayError('Refund amount must be positive', 'pay.invalid_amount');

    // ── Phase 1: debit the merchant, and commit the fact that we are about to
    // send money out. Nothing external is called inside this transaction.
    const prepared = await transaction(
      this.sql,
      async (tx) => {
        const row = await lockPayment(tx, paymentId);

        if (row.status !== 'captured' && row.status !== 'settled') {
          throw new PayError(
            `Payment ${row.id} is ${row.status}; only a captured or settled payment can be refunded`,
            'pay.invalid_transition',
          );
        }

        const totals = await totalsFor(tx, row.id);
        const refundable = totals.captured - totals.refunded;
        if (amount > refundable) {
          throw new PayError(
            `Refundable balance is ${formatAmount(refundable)}, requested ${formatAmount(amount)}`,
            'pay.refund_exceeds_captured',
            { refundable: formatAmount(refundable), requested: formatAmount(amount) },
          );
        }

        const inFlight = await tx<Array<{ refund_id: string }>>`
          SELECT p.payload->>'refundId' AS refund_id
            FROM pay.payment_events p
           WHERE p.payment_id = ${row.id} AND p.event = 'refund.posted'
             AND NOT EXISTS (
               SELECT 1 FROM pay.payment_events d
                WHERE d.payment_id = p.payment_id
                  AND d.event IN ('refunded', 'refund.reversed')
                  AND d.payload->>'refundId' = p.payload->>'refundId'
             )
        `;
        if (inFlight.length > 0) {
          throw new PayError(
            `Refund ${inFlight[0]!.refund_id} is already in flight — reconcile it against the rail before refunding again`,
            'pay.refund_in_flight',
            { refundId: inFlight[0]!.refund_id },
          );
        }

        const sequence = await countEvents(tx, row.id, 'refund.posted');
        const refundId = options.refundId ?? `${row.id}:${sequence + 1}`;
        const merchant = await this.getMerchant(row.merchant_id);
        const source = row.status === 'settled' ? ('settled' as const) : ('clearing' as const);

        const posted = await this.ledger.post(
          recipes.paymentRefund({
            refundId,
            paymentId: row.id,
            merchantId: row.merchant_id,
            merchantUserId: merchant.userId,
            assetId: row.currency,
            amount,
            rail: row.rail_adapter,
            source,
          }),
        );

        await appendEvent(tx, row.id, 'refund.posted', {
          refundId,
          amount: formatAmount(amount),
          source,
          ledgerTxId: posted.id,
        });

        return { row, refundId, source, merchant, captured: totals.captured, refunded: totals.refunded };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    // ── Phase 2: send it. The book already says this money is on its way out.
    const adapter = this.rails.require(prepared.row.rail_adapter, 'refund');
    const railRef = prepared.row.rail_ref!;
    const result = await withRailSpan(adapter.id, 'refund', async () => adapter.refund(railRef, amount));

    // ── Phase 3: record what the rail did, and reverse the ledger if it refused.
    const settled = await transaction(
      this.sql,
      async (tx) => {
        const row = await lockPayment(tx, paymentId);
        await appendEvent(tx, row.id, 'rail.refund', { ...railPayload(result), refundId: prepared.refundId });

        const refundInput = {
          refundId: prepared.refundId,
          paymentId: row.id,
          merchantId: row.merchant_id,
          merchantUserId: prepared.merchant.userId,
          assetId: row.currency,
          amount,
          rail: row.rail_adapter,
          source: prepared.source,
        };

        if (!result.ok) {
          // Put the merchant's money back. Its own business key, so a retry of
          // the reversal finds the reversal rather than the refund.
          await this.ledger.post(recipes.paymentRefundReverse(refundInput));
          await appendEvent(tx, row.id, 'refund.reversed', {
            refundId: prepared.refundId,
            amount: formatAmount(amount),
            failureCode: result.failureCode ?? 'rail.failed',
          });
          // Recorded, then thrown OUTSIDE this transaction. Throwing here would
          // roll back the very event that says the reversal happened, and the
          // next refund attempt would see a refund still in flight.
          return { ok: false as const, view: await this.view(tx, row) };
        }

        await appendEvent(tx, row.id, 'refunded', {
          refundId: prepared.refundId,
          amount: formatAmount(amount),
          source: prepared.source,
          railRef: result.railRef,
        });

        if (prepared.refunded + amount >= prepared.captured) {
          await tx`UPDATE pay.payments SET status = 'refunded', updated_at = now() WHERE id = ${row.id}`;
          return { ok: true as const, view: await this.view(tx, { ...row, status: 'refunded' }) };
        }

        // Partially refunded. The status stays where it was: the merchant is
        // still owed the remainder, and a settlement sweep must still see it.
        return { ok: true as const, view: await this.view(tx, row) };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    if (!settled.ok) {
      throw new PayError(result.failureReason ?? 'Rail refused the refund', 'pay.rail_failed', {
        failureCode: result.failureCode,
        refundId: prepared.refundId,
      });
    }

    return settled.view;
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * Handle an inbound webhook.
   *
   * A PSP webhook WILL be delivered twice. The second delivery must change
   * NOTHING, and that is guaranteed at the database level rather than in this
   * method: `payment_events.rail_event_id` is unique, the insert is
   * `ON CONFLICT DO NOTHING`, and a delivery that inserts no row returns
   * `duplicate: true` without going near a rail or the ledger.
   *
   * THE EFFECT IS APPLIED BEFORE THE DEDUPE MARKER IS WRITTEN, not after. Write
   * the marker first and a crash in between leaves a delivery permanently
   * recorded as seen and never acted on — a captured payment nobody ever books.
   * This way the worst case is that a redelivery re-applies an effect that is
   * already idempotent on the payment id, which costs a wasted call and
   * changes nothing.
   */
  async handleWebhook(railId: string, request: RailWebhookRequest): Promise<WebhookOutcome> {
    const adapter = this.rails.require(railId, 'webhook');

    const event = adapter.verifyWebhook(request);
    if (!event) {
      // Deliberately uninformative to the caller. A verification endpoint that
      // explains WHY it rejected something is an oracle for forging the next
      // attempt.
      throw new PayError('Webhook signature verification failed', 'pay.webhook_invalid', { railId });
    }

    return withMoneySpan('pay.webhook', { operation: 'webhook', rail: railId, railRef: event.railRef }, async () =>
      this.applyWebhook(adapter, event),
    );
  }

  private async applyWebhook(adapter: RailAdapter, event: RailEvent): Promise<WebhookOutcome> {
    const rows = await this.sql<PaymentRow[]>`
      SELECT id, merchant_id, profile_id, amount, currency, method, rail_adapter, rail_ref, status, created_at
        FROM pay.payments WHERE rail_adapter = ${adapter.id} AND rail_ref = ${event.railRef}
    `;
    const payment = rows[0];

    if (!payment) {
      // A verified event about a payment we have no record of. Rejecting is
      // right — inventing a payment row from a webhook is how a rail's bug
      // becomes our liability — but it is also an operator signal, not a
      // client error.
      throw new PayError(`No payment for ${adapter.id} reference ${event.railRef}`, 'pay.webhook_unmatched', {
        railId: adapter.id,
        railRef: event.railRef,
        eventId: event.eventId,
      });
    }

    // Namespaced by rail. Two rails can and will use the same event id string,
    // and an unqualified collision would silently mark a genuine delivery a
    // duplicate — a captured payment nobody ever books.
    const deliveryKey = `${adapter.id}:${event.eventId}`;

    // The fast path, and the one the test "a webhook delivered twice changes
    // nothing" exercises: a delivery we have already recorded stops here,
    // before any rail call and before the ledger.
    const seen = await this.sql<Array<{ id: string }>>`
      SELECT id FROM pay.payment_events WHERE rail_event_id = ${deliveryKey}
    `;
    if (seen.length > 0) {
      return { railId: adapter.id, eventId: event.eventId, type: event.type, duplicate: true, paymentId: payment.id, applied: false };
    }

    // The effect. Every one of these is idempotent on the payment id, which is
    // what makes it safe to apply before the marker is written — and safe for
    // two concurrent deliveries of the same event to race here.
    let applied = false;
    switch (event.type) {
      case 'authorized':
        if (payment.status === 'created') {
          await this.authorize(payment.id);
          applied = true;
        }
        break;
      case 'captured':
        if (payment.status === 'authorized') {
          await this.capture(payment.id);
          applied = true;
        } else if (payment.status === 'created') {
          // Some rails announce authorization and capture in one delivery.
          await this.authorize(payment.id);
          await this.capture(payment.id);
          applied = true;
        }
        break;
      case 'failed':
        if (payment.status === 'created' || payment.status === 'authorized') {
          await this.markFailed(payment.id, event.failureCode ?? 'rail.failed');
          applied = true;
        }
        break;
      case 'refunded':
      case 'payout.completed':
        // Recorded, not acted on. A refund we did not initiate, or a payout the
        // rail is confirming, both need a human decision — acting on either
        // automatically would move money on a rail's say-so alone.
        break;
    }

    // The dedupe marker, written last. `ON CONFLICT DO NOTHING` because two
    // concurrent deliveries of one event both get here; the loser reports the
    // duplicate and neither has done anything twice.
    const claimed = await this.sql<Array<{ id: string }>>`
      INSERT INTO pay.payment_events (payment_id, event, payload, rail_event_id)
      VALUES (
        ${payment.id}, ${`webhook.${event.type}`},
        ${this.sql.json({
          type: event.type,
          railRef: event.railRef,
          amount: event.amount === undefined ? null : formatAmount(event.amount),
          assetId: event.assetId ?? null,
          occurredAt: event.occurredAt.toISOString(),
          failureCode: event.failureCode ?? null,
        } as never)},
        ${deliveryKey}
      )
      ON CONFLICT ("rail_event_id") WHERE "rail_event_id" IS NOT NULL DO NOTHING
      RETURNING id
    `;

    return {
      railId: adapter.id,
      eventId: event.eventId,
      type: event.type,
      duplicate: claimed.length === 0,
      paymentId: payment.id,
      applied,
    };
  }

  private async markFailed(paymentId: string, failureCode: string): Promise<void> {
    await transaction(
      this.sql,
      async (tx) => {
        const row = await lockPayment(tx, paymentId);
        if (row.status !== 'created' && row.status !== 'authorized') return;
        await appendEvent(tx, row.id, 'failed', { failureCode });
        await tx`UPDATE pay.payments SET status = 'failed', updated_at = now() WHERE id = ${row.id}`;
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  // ── Settlement (§6.1) ──────────────────────────────────────────────────────

  /**
   * Settle a window: merchant net posts to their ledger account — "the same
   * balance graph they trade and spend from — the doc's promise, kept".
   *
   * Two phases, because the alternative silently loses money:
   *
   *   1. Freeze. The payment set is fixed by appending `settlement.included` to
   *      each payment, and gross/fees/net are computed and stored `pending`.
   *   2. Post. The ledger transaction uses the FROZEN numbers.
   *
   * If it were one phase, a crash between posting and committing would leave a
   * ledger transaction keyed `settlement:<merchant>:<window>:<asset>` for one
   * gross while a retry — now including a payment that landed in the meantime —
   * computed a different gross, posted it, and got the ORIGINAL transaction
   * back from the idempotency check. The database would then record a
   * settlement the ledger never made. Freezing first makes the retry
   * arithmetically identical.
   */
  async settleWindow(input: {
    merchantId: string;
    /** Window label, e.g. '2026-07-27'. Half the business key. */
    window: string;
    assetId: string;
    /** Defaults to the UTC day named by `window`. */
    from?: Date;
    to?: Date;
  }): Promise<SettlementRecord> {
    return withMoneySpan(
      'pay.settleWindow',
      { operation: 'settlement', merchantId: input.merchantId, window: input.window, assetId: input.assetId },
      async (span) => {
        const prepared = await this.prepareSettlement(input);
        if (prepared.status !== 'pending') return prepared;

        const merchant = await this.getMerchant(input.merchantId);

        return transaction(
          this.sql,
          async (tx) => {
            const rows = await tx<SettlementRow[]>`
              SELECT id, merchant_id, "window", asset_id, gross, fees, net, payout_method, payout_ref, payout_attempts, status
                FROM pay.settlements WHERE id = ${prepared.id} FOR UPDATE
            `;
            const row = rows[0]!;
            if (row.status !== 'pending') return toSettlement(row);

            const gross = parseAmount(row.gross);
            const fees = parseAmount(row.fees);

            await this.ledger.post(
              recipes.merchantSettlement({
                merchantId: row.merchant_id,
                merchantUserId: merchant.userId,
                window: row.window,
                assetId: row.asset_id,
                gross,
                fee: fees,
              }),
            );

            await tx`
              UPDATE pay.settlements SET status = 'posted', payout_method = 'ledger', updated_at = now()
               WHERE id = ${row.id}
            `;

            const included = await tx<Array<{ payment_id: string }>>`
              SELECT payment_id FROM pay.payment_events
               WHERE event = 'settlement.included' AND payload->>'settlementId' = ${row.id}
            `;

            for (const { payment_id } of included) {
              await appendEvent(tx, payment_id, 'settled', {
                settlementId: row.id,
                window: row.window,
                assetId: row.asset_id,
              });
              await tx`
                UPDATE pay.payments SET status = 'settled', updated_at = now()
                 WHERE id = ${payment_id} AND status = 'captured'
              `;
            }

            span.setAttribute('intafaced.amount', formatAmount(parseAmount(row.net)));
            span.setAttribute('intafaced.payments', included.length);
            return toSettlement({ ...row, status: 'posted', payout_method: 'ledger' });
          },
          { isolation: 'read committed', maxAttempts: 5 },
        );
      },
    );
  }

  /** Phase 1: freeze the set and the numbers. No external call, no value moved. */
  private async prepareSettlement(input: {
    merchantId: string;
    window: string;
    assetId: string;
    from?: Date;
    to?: Date;
  }): Promise<SettlementRecord> {
    const { from, to } = windowBounds(input.window, input.from, input.to);
    const merchant = await this.getMerchant(input.merchantId);
    const feeBps = merchant.pricing.feeBps ?? this.defaultFeeBps;
    if (feeBps === undefined) {
      throw new PayError(
        `Merchant ${merchant.id} has no fee rate and no default is configured — refusing to settle at an unknown price`,
        'pay.merchant_pricing_invalid',
      );
    }

    return transaction(
      this.sql,
      async (tx) => {
        // Lock the merchant, not the settlement row (which may not exist yet).
        // Two settlement runs for one merchant must queue, or both would select
        // the same unsettled payments and freeze them into two settlements.
        await tx`SELECT id FROM pay.merchants WHERE id = ${input.merchantId} FOR UPDATE`;

        const existing = await tx<SettlementRow[]>`
          SELECT id, merchant_id, "window", asset_id, gross, fees, net, payout_method, payout_ref, payout_attempts, status
            FROM pay.settlements
           WHERE merchant_id = ${input.merchantId} AND "window" = ${input.window} AND asset_id = ${input.assetId}
        `;
        if (existing[0]) return toSettlement(existing[0]);

        const candidates = await tx<Array<{ id: string; captured: string; refunded: string }>>`
          SELECT p.id,
                 COALESCE(SUM(CASE WHEN e.event = 'captured' THEN (e.payload->>'amount')::numeric END), 0) AS captured,
                 COALESCE(SUM(CASE WHEN e.event = 'refunded' THEN (e.payload->>'amount')::numeric END), 0) AS refunded
            FROM pay.payments p
            JOIN pay.payment_events e ON e.payment_id = p.id
           WHERE p.merchant_id = ${input.merchantId}
             AND p.currency = ${input.assetId}
             AND p.status = 'captured'
             AND NOT EXISTS (
               SELECT 1 FROM pay.payment_events s
                WHERE s.payment_id = p.id AND s.event = 'settlement.included'
             )
             AND EXISTS (
               SELECT 1 FROM pay.payment_events c
                WHERE c.payment_id = p.id AND c.event = 'captured' AND c.ts >= ${from} AND c.ts < ${to}
             )
           GROUP BY p.id
           ORDER BY p.id
        `;

        let gross = 0n;
        const included: string[] = [];
        for (const candidate of candidates) {
          const net = parseAmount(candidate.captured) - parseAmount(candidate.refunded);
          if (net <= 0n) continue; // Fully refunded inside the window — nothing to settle.
          gross += net;
          included.push(candidate.id);
        }

        if (gross <= 0n) {
          throw new PayError(
            `Nothing to settle for merchant ${input.merchantId} in ${input.window} (${input.assetId})`,
            'pay.nothing_to_settle',
          );
        }

        // Fees round `ceil` — the house never pays a rounding unit on a merchant's
        // behalf, and the merchant is never short by one either, because net is
        // derived by subtraction rather than computed independently.
        const fees = mulBps(gross, feeBps, 'ceil');
        const net = gross - fees;
        if (net <= 0n) {
          throw new PayError(
            `Fee of ${formatAmount(fees)} consumes the whole ${formatAmount(gross)} window — check merchant pricing`,
            'pay.fee_exceeds_gross',
            { gross: formatAmount(gross), fees: formatAmount(fees), feeBps },
          );
        }

        const inserted = await tx<SettlementRow[]>`
          INSERT INTO pay.settlements (merchant_id, "window", asset_id, gross, fees, net, status)
          VALUES (
            ${input.merchantId}, ${input.window}, ${input.assetId},
            ${formatAmount(gross)}::numeric, ${formatAmount(fees)}::numeric, ${formatAmount(net)}::numeric, 'pending'
          )
          RETURNING id, merchant_id, "window", asset_id, gross, fees, net, payout_method, payout_ref, payout_attempts, status
        `;
        const row = inserted[0]!;

        for (const paymentId of included) {
          await appendEvent(tx, paymentId, 'settlement.included', {
            settlementId: row.id,
            window: input.window,
            assetId: input.assetId,
          });
        }

        return toSettlement(row);
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  /**
   * Pay a settled window out of the book, to a bank or a chain (§6.1 "payout to
   * bank/crypto via adapter `payout`").
   *
   * Reuses the ledger's existing withdrawal recipes rather than inventing a
   * fourth payment recipe, because the shape is exactly a withdrawal: hold the
   * funds while the rail works, settle on success, reverse on failure. There is
   * no state in which the merchant's money is neither in their available
   * balance, nor in their hold, nor gone with a rail reference against it.
   *
   * IF THIS CRASHES between the hold and the payout, the funds are in the
   * merchant's `hold` account and the settlement is still `posted`. Re-running
   * re-posts the hold (idempotent on the settlement id), asks the rail again
   * (idempotent on the settlement id), and finishes.
   */
  async payoutSettlement(input: {
    settlementId: string;
    railId: string;
    destination: { kind: string; ref: string };
  }): Promise<SettlementRecord> {
    return withMoneySpan(
      'pay.payoutSettlement',
      { operation: 'payout', settlementId: input.settlementId, rail: input.railId },
      async () => {
        const adapter = this.rails.require(input.railId, 'payout');

        const settlement = await this.getSettlement(input.settlementId);
        if (settlement.status === 'paid_out') return settlement;
        if (settlement.status !== 'posted' && settlement.status !== 'failed') {
          throw new PayError(
            `Settlement ${settlement.id} is ${settlement.status}; only a posted settlement can be paid out`,
            'pay.invalid_transition',
          );
        }

        const merchant = await this.getMerchant(settlement.merchantId);

        // The attempt number is part of the hold's business key. A refused
        // payout releases the hold, so the next attempt must not reuse the key
        // — it would find the original hold, move nothing, and then try to
        // settle out of a hold that is no longer there. It advances only on
        // refusal, so a crash-and-resume reuses its key and stays idempotent.
        const withdrawal = {
          userId: merchant.userId,
          assetId: settlement.assetId,
          amount: settlement.net,
          rail: adapter.id,
          withdrawalId: `${settlement.id}:${settlement.payoutAttempts}`,
        };

        // Ledger first: outbound. The merchant's net leaves `available` and
        // waits in `hold` while the rail works.
        await this.ledger.post(recipes.withdrawHold(withdrawal));

        const result = await withRailSpan(adapter.id, 'payout', async () =>
          adapter.payout({
            settlementId: settlement.id,
            merchantId: settlement.merchantId,
            amount: settlement.net,
            assetId: settlement.assetId,
            window: settlement.window,
            destination: input.destination,
          }),
        );

        if (!result.ok) {
          await this.ledger.post(recipes.withdrawReverse(withdrawal));
          await this.sql`
            UPDATE pay.settlements
               SET status = 'failed', payout_attempts = payout_attempts + 1, updated_at = now()
             WHERE id = ${settlement.id}
          `;
          throw new PayError(result.failureReason ?? 'Rail refused the payout', 'pay.rail_failed', {
            failureCode: result.failureCode,
            settlementId: settlement.id,
          });
        }

        await this.ledger.post(recipes.withdrawSettle(withdrawal));
        await this.sql`
          UPDATE pay.settlements
             SET status = 'paid_out', payout_method = ${adapter.id}, payout_ref = ${result.railRef}, updated_at = now()
           WHERE id = ${settlement.id}
        `;

        return { ...settlement, status: 'paid_out', payoutMethod: adapter.id, payoutRef: result.railRef };
      },
    );
  }

  async getSettlement(settlementId: string): Promise<SettlementRecord> {
    const rows = await this.sql<SettlementRow[]>`
      SELECT id, merchant_id, "window", asset_id, gross, fees, net, payout_method, payout_ref, payout_attempts, status
        FROM pay.settlements WHERE id = ${settlementId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Settlement ${settlementId} not found`, 'pay.settlement_not_found');
    return toSettlement(row);
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getPayment(paymentId: string): Promise<PaymentView> {
    const rows = await this.sql<PaymentRow[]>`
      SELECT id, merchant_id, profile_id, amount, currency, method, rail_adapter, rail_ref, status, created_at
        FROM pay.payments WHERE id = ${paymentId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Payment ${paymentId} not found`, 'pay.payment_not_found');
    return this.view(this.sql, row);
  }

  /** The append-only state history for one payment, oldest first (§6.1). */
  async history(paymentId: string): Promise<PaymentEventRecord[]> {
    const rows = await this.sql<
      Array<{ id: string; event: string; payload: Record<string, unknown>; rail_event_id: string | null; ts: Date }>
    >`
      SELECT id, event, payload, rail_event_id, ts
        FROM pay.payment_events WHERE payment_id = ${paymentId} ORDER BY seq ASC
    `;
    return rows.map((r) => ({ id: r.id, event: r.event, payload: r.payload, railEventId: r.rail_event_id, ts: r.ts }));
  }

  /**
   * What svc-pay currently owes a merchant but has not settled.
   *
   * Read from the LEDGER, not from these tables. Doctrine §0.6 means the
   * clearing account is the answer, and asking the ledger keeps the two
   * independent — which is the entire property a reconciliation job needs.
   */
  async clearingBalance(merchantId: string, assetId: string): Promise<Amount> {
    return (await this.ledger.balance(merchantClearing(merchantId, assetId))).amount;
  }

  /** What a merchant can actually spend — the balance they trade from. */
  async merchantBalance(merchantId: string, assetId: string): Promise<Amount> {
    const merchant = await this.getMerchant(merchantId);
    return (await this.ledger.balance(userAvailable(merchant.userId, assetId))).amount;
  }

  private async view(sql: Sql, row: PaymentRow): Promise<PaymentView> {
    const totals = await totalsFor(sql, row.id);
    return { ...toPayment(row), capturedAmount: totals.captured, refundedAmount: totals.refunded };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function lockPayment(tx: Sql, paymentId: string): Promise<PaymentRow> {
  const rows = await tx<PaymentRow[]>`
    SELECT id, merchant_id, profile_id, amount, currency, method, rail_adapter, rail_ref, status, created_at
      FROM pay.payments WHERE id = ${paymentId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new PayError(`Payment ${paymentId} not found`, 'pay.payment_not_found');
  return row;
}

function assertTransition(row: PaymentRow, next: PaymentStatus): void {
  if (!TRANSITIONS[row.status].includes(next)) {
    throw new PayError(`Payment ${row.id} cannot go from ${row.status} to ${next}`, 'pay.invalid_transition', {
      from: row.status,
      to: next,
    });
  }
}

/**
 * Captured and refunded totals, summed from the append-only log.
 *
 * Deliberately not columns. A running total on the payment row would be a
 * second source of truth for money, and the day it disagrees with the event log
 * is the day nobody can say which one was right.
 */
async function totalsFor(sql: Sql, paymentId: string): Promise<{ captured: Amount; refunded: Amount }> {
  const rows = await sql<Array<{ captured: string; refunded: string }>>`
    SELECT
      COALESCE(SUM(CASE WHEN event = 'captured' THEN (payload->>'amount')::numeric END), 0) AS captured,
      COALESCE(SUM(CASE WHEN event = 'refunded' THEN (payload->>'amount')::numeric END), 0) AS refunded
      FROM pay.payment_events WHERE payment_id = ${paymentId}
  `;
  const row = rows[0];
  return { captured: parseAmount(row?.captured ?? '0'), refunded: parseAmount(row?.refunded ?? '0') };
}

async function countEvents(sql: Sql, paymentId: string, event: string): Promise<number> {
  const rows = await sql<Array<{ n: string }>>`
    SELECT COUNT(*)::text AS n FROM pay.payment_events WHERE payment_id = ${paymentId} AND event = ${event}
  `;
  return Number.parseInt(rows[0]?.n ?? '0', 10);
}

async function appendEvent(sql: Sql, paymentId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  await sql`
    INSERT INTO pay.payment_events (payment_id, event, payload)
    VALUES (${paymentId}, ${event}, ${sql.json(payload as never)})
  `;
}

/** The instrument the payment was created with, read back off the `created` event. */
async function instrumentFor(sql: Sql, paymentId: string): Promise<PaymentIntent['instrument']> {
  const rows = await sql<Array<{ payload: Record<string, unknown> }>>`
    SELECT payload FROM pay.payment_events WHERE payment_id = ${paymentId} AND event = 'created' LIMIT 1
  `;
  const instrument = rows[0]?.payload?.instrument;
  if (typeof instrument !== 'object' || instrument === null) return undefined;
  const i = instrument as Record<string, unknown>;
  if (typeof i.kind !== 'string') return undefined;
  return {
    kind: i.kind,
    token: typeof i.token === 'string' ? i.token : undefined,
    address: typeof i.address === 'string' ? i.address : undefined,
  };
}

function railPayload(result: RailResult): Record<string, unknown> {
  return {
    ok: result.ok,
    status: result.status,
    railRef: result.railRef,
    // Decimal string. A bigint does not survive JSON and a number does not
    // survive 18 decimal places.
    amount: formatAmount(result.amount),
    assetId: result.assetId,
    at: result.at.toISOString(),
    failureCode: result.failureCode ?? null,
    failureReason: result.failureReason ?? null,
  };
}

function toMerchant(row: MerchantRow): MerchantRecord {
  const feeBps = row.pricing?.feeBps;
  if (feeBps !== undefined && (typeof feeBps !== 'number' || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000)) {
    throw new PayError(`Merchant ${row.id} has malformed pricing`, 'pay.merchant_pricing_invalid', { pricing: row.pricing });
  }
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    tier: Number(row.tier),
    kybStatus: row.kyb_status,
    status: row.status,
    pricing: { feeBps: typeof feeBps === 'number' ? feeBps : undefined },
    settlementPrefs: row.settlement_prefs ?? {},
  };
}

function toPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    profileId: row.profile_id,
    amount: parseAmount(row.amount),
    assetId: row.currency,
    method: row.method,
    railAdapter: row.rail_adapter,
    railRef: row.rail_ref,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toSettlement(row: SettlementRow): SettlementRecord {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    window: row.window,
    assetId: row.asset_id,
    gross: parseAmount(row.gross),
    fees: parseAmount(row.fees),
    net: parseAmount(row.net),
    payoutMethod: row.payout_method,
    payoutRef: row.payout_ref,
    payoutAttempts: Number(row.payout_attempts),
    status: row.status,
  };
}

function assertFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new PayError(`Fee must be an integer between 0 and 10000 bps, got ${feeBps}`, 'pay.merchant_pricing_invalid');
  }
}

/** `'2026-07-27'` → that UTC day, half-open. Explicit bounds win. */
function windowBounds(window: string, from?: Date, to?: Date): { from: Date; to: Date } {
  if (from && to) return { from, to };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(window) ? new Date(`${window}T00:00:00.000Z`) : null;
  if (!day || Number.isNaN(day.getTime())) {
    throw new PayError(
      `Window "${window}" is not a YYYY-MM-DD date; pass explicit from/to bounds for a custom window`,
      'pay.invalid_window',
    );
  }
  return { from: day, to: new Date(day.getTime() + 24 * 60 * 60 * 1000) };
}
