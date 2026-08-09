import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { PayError } from '../payment-service.js';
import { CADENCES, occurrenceStart, planDue, type Cadence } from './schedule.js';

/**
 * SUBSCRIPTION LIFECYCLE (SPEC §4) — create / cancel / re-consent refuse.
 *
 * No charge runner here. No ledger posts. Crypto path never pulls.
 *
 * Done bar slice: mandate exists, cancel is immediate, price raise without a
 * new mandate is refused by code (`pay.subscription_reconsent_required`).
 */

export type MandateStatus = 'active' | 'cancelled' | 'expired';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'completed';

export interface MandateRecord {
  id: string;
  merchantId: string;
  customerId: string;
  assetId: string;
  amount: Amount;
  ceiling: Amount | null;
  cadence: Cadence;
  startsAt: Date;
  endsAt: Date | null;
  railAdapter: string | null;
  railMandateRef: string | null;
  status: MandateStatus;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface SubscriptionRecord {
  id: string;
  mandateId: string;
  merchantId: string;
  customerId: string;
  nextRunAt: Date;
  status: SubscriptionStatus;
  cancelledAt: Date | null;
  path: string;
  createdAt: Date;
}

interface MandateRow {
  id: string;
  merchant_id: string;
  customer_id: string;
  asset_id: string;
  amount: string;
  ceiling: string | null;
  cadence: Cadence;
  starts_at: Date;
  ends_at: Date | null;
  rail_adapter: string | null;
  rail_mandate_ref: string | null;
  status: MandateStatus;
  cancelled_at: Date | null;
  created_at: Date;
}

interface SubRow {
  id: string;
  mandate_id: string;
  merchant_id: string;
  customer_id: string;
  next_run_at: Date;
  status: SubscriptionStatus;
  cancelled_at: Date | null;
  path: string;
  created_at: Date;
}

function toMandate(r: MandateRow): MandateRecord {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    customerId: r.customer_id,
    assetId: r.asset_id,
    amount: parseAmount(r.amount),
    ceiling: r.ceiling === null ? null : parseAmount(r.ceiling),
    cadence: r.cadence,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    railAdapter: r.rail_adapter,
    railMandateRef: r.rail_mandate_ref,
    status: r.status,
    cancelledAt: r.cancelled_at,
    createdAt: r.created_at,
  };
}

function toSub(r: SubRow): SubscriptionRecord {
  return {
    id: r.id,
    mandateId: r.mandate_id,
    merchantId: r.merchant_id,
    customerId: r.customer_id,
    nextRunAt: r.next_run_at,
    status: r.status,
    cancelledAt: r.cancelled_at,
    path: r.path,
    createdAt: r.created_at,
  };
}

/**
 * Raising amount or ceiling requires a NEW mandate (re-consent). Equality or
 * lowering is allowed only by creating a new mandate too — this helper is the
 * refuse path when a caller tries to mutate an existing mandate's money terms.
 */
export function assertMandateTermsUnchanged(
  existing: { amount: Amount; ceiling: Amount | null },
  proposed: { amount: Amount; ceiling: Amount | null },
): void {
  if (proposed.amount !== existing.amount) {
    throw new PayError(
      'Raising or changing the authorised amount requires a new mandate (re-consent)',
      'pay.subscription_reconsent_required',
    );
  }
  if (proposed.ceiling !== existing.ceiling) {
    throw new PayError('Changing the authorised ceiling requires a new mandate (re-consent)', 'pay.subscription_reconsent_required');
  }
}

/**
 * Opens a payment/invoice for one occurrence. Crypto path uses this (never pull).
 * Injected so the runner does not hard-wire PayService and tests stay light.
 */
export type SubscriptionInvoiceOpener = (input: {
  merchantId: string;
  customerId: string;
  amount: Amount;
  assetId: string;
  subscriptionId: string;
  occurrence: number;
}) => Promise<{ paymentId: string }>;

export type FiringOutcome = 'invoiced' | 'rejected' | 'already-fired' | 'skipped';

export interface RunReport {
  examined: number;
  fired: number;
  outcomes: Array<{ subscriptionId: string; occurrence: number; outcome: FiringOutcome; rejectionCode?: string }>;
}

export class SubscriptionService {
  constructor(
    private readonly sql: Sql,
    private readonly now: () => Date = () => new Date(),
    /**
     * Opens invoices for `crypto_invoice` path. Absent → refuse-closed on fire
     * (`pay.subscription_driver_absent`), never silent skip.
     */
    private readonly openInvoice?: SubscriptionInvoiceOpener,
  ) {}

  async createMandate(input: {
    merchantId: string;
    customerId: string;
    assetId: string;
    amount: Amount;
    ceiling?: Amount | null;
    cadence: Cadence;
    startsAt: Date;
    endsAt?: Date | null;
    railAdapter?: string | null;
    railMandateRef?: string | null;
    path?: string;
  }): Promise<MandateRecord> {
    if (input.amount <= 0n) throw new PayError('Mandate amount must be positive', 'pay.invalid_amount');
    if (!CADENCES.includes(input.cadence)) {
      throw new PayError(`Unknown cadence ${input.cadence}`, 'pay.subscription_invalid');
    }
    const ceiling = input.ceiling ?? null;
    if (ceiling !== null && ceiling < input.amount) {
      throw new PayError('Mandate ceiling must be >= amount', 'pay.subscription_invalid');
    }
    const endsAt = input.endsAt ?? null;
    if (endsAt !== null && endsAt.getTime() <= input.startsAt.getTime()) {
      throw new PayError('Mandate endsAt must be after startsAt', 'pay.subscription_invalid');
    }

    const m = await this.requireMerchant(input.merchantId);
    if (m.status !== 'active') {
      throw new PayError(`Merchant ${m.id} is ${m.status}`, 'pay.merchant_inactive');
    }

    const rows = await this.sql<MandateRow[]>`
      INSERT INTO pay.subscription_mandates (
        merchant_id, customer_id, asset_id, amount, ceiling, cadence,
        starts_at, ends_at, rail_adapter, rail_mandate_ref, status
      ) VALUES (
        ${input.merchantId}, ${input.customerId}, ${input.assetId},
        ${formatAmount(input.amount)}::numeric,
        ${ceiling === null ? null : formatAmount(ceiling)}::numeric,
        ${input.cadence},
        ${input.startsAt}, ${endsAt},
        ${input.railAdapter ?? null}, ${input.railMandateRef ?? null},
        'active'
      )
      RETURNING id, merchant_id, customer_id, asset_id, amount::text, ceiling::text,
                cadence, starts_at, ends_at, rail_adapter, rail_mandate_ref,
                status, cancelled_at, created_at
    `;
    return toMandate(rows[0]!);
  }

  async getMandate(mandateId: string): Promise<MandateRecord> {
    const rows = await this.sql<MandateRow[]>`
      SELECT id, merchant_id, customer_id, asset_id, amount::text, ceiling::text,
             cadence, starts_at, ends_at, rail_adapter, rail_mandate_ref,
             status, cancelled_at, created_at
        FROM pay.subscription_mandates WHERE id = ${mandateId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Mandate ${mandateId} not found`, 'pay.mandate_not_found');
    return toMandate(row);
  }

  /**
   * Create a subscription from an active mandate. nextRunAt = occurrence 0
   * start (or startsAt itself).
   */
  async createSubscription(input: { mandateId: string; path?: string }): Promise<SubscriptionRecord> {
    const mandate = await this.getMandate(input.mandateId);
    if (mandate.status !== 'active') {
      throw new PayError(`Mandate ${mandate.id} is ${mandate.status}`, 'pay.mandate_inactive');
    }
    await this.requireMerchant(mandate.merchantId);

    const nextRunAt = occurrenceStart(mandate.startsAt, mandate.cadence, 0);
    const path = input.path ?? 'crypto_invoice';

    const rows = await this.sql<SubRow[]>`
      INSERT INTO pay.subscriptions (
        mandate_id, merchant_id, customer_id, next_run_at, status, path
      ) VALUES (
        ${mandate.id}, ${mandate.merchantId}, ${mandate.customerId},
        ${nextRunAt}, 'active', ${path}
      )
      RETURNING id, mandate_id, merchant_id, customer_id, next_run_at, status,
                cancelled_at, path, created_at
    `;
    return toSub(rows[0]!);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const rows = await this.sql<SubRow[]>`
      SELECT id, mandate_id, merchant_id, customer_id, next_run_at, status,
             cancelled_at, path, created_at
        FROM pay.subscriptions WHERE id = ${subscriptionId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Subscription ${subscriptionId} not found`, 'pay.subscription_not_found');
    return toSub(row);
  }

  /**
   * Cancel takes effect at once (SPEC §4). Does not reverse settled executions.
   */
  async cancelSubscription(subscriptionId: string): Promise<SubscriptionRecord> {
    const existing = await this.getSubscription(subscriptionId);
    if (existing.status === 'cancelled') return existing;

    const at = this.now();
    const rows = await this.sql<SubRow[]>`
      UPDATE pay.subscriptions
         SET status = 'cancelled', cancelled_at = ${at}, updated_at = ${at}
       WHERE id = ${subscriptionId}
      RETURNING id, mandate_id, merchant_id, customer_id, next_run_at, status,
                cancelled_at, path, created_at
    `;
    return toSub(rows[0]!);
  }

  /**
   * Refuse-in-code for "raise price on an existing mandate." Callers must
   * create a new mandate and re-bind; this method only exists so the refuse
   * path is named and tested.
   */
  proposeMandateAmountChange(mandate: MandateRecord, proposed: { amount: Amount; ceiling?: Amount | null }): never {
    assertMandateTermsUnchanged(
      { amount: mandate.amount, ceiling: mandate.ceiling },
      { amount: proposed.amount, ceiling: proposed.ceiling ?? null },
    );
    // Unreachable if amounts match — if they match, there is nothing to propose.
    throw new PayError('Mandate terms are unchanged; nothing to re-consent', 'pay.subscription_invalid');
  }

  /**
   * Due pass — external cron, not setInterval (bank transplant law).
   *
   * Claims each occurrence once (`unique(subscription_id, occurrence)`), opens
   * an invoice for crypto_invoice path, never pulls on-chain. Double-run safe.
   */
  async runDueSubscriptions(options: { now?: Date; limit?: number; maxCatchUp?: number } = {}): Promise<RunReport> {
    const now = options.now ?? this.now();
    const limit = options.limit ?? 50;
    const maxCatchUp = options.maxCatchUp;

    const due = await this.sql<SubRow[]>`
      SELECT id, mandate_id, merchant_id, customer_id, next_run_at, status,
             cancelled_at, path, created_at
        FROM pay.subscriptions
       WHERE status = 'active' AND next_run_at <= ${now}
       ORDER BY next_run_at ASC
       LIMIT ${limit}
    `;

    const report: RunReport = { examined: due.length, fired: 0, outcomes: [] };

    for (const row of due) {
      const sub = toSub(row);
      const mandate = await this.getMandate(sub.mandateId);
      if (mandate.status !== 'active') {
        await this.sql`
          UPDATE pay.subscriptions SET status = 'cancelled', cancelled_at = ${now}, updated_at = ${now}
           WHERE id = ${sub.id} AND status = 'active'
        `;
        continue;
      }

      const lastFired = await this.maxFiredOccurrence(sub.id);
      const plan = planDue({
        startsAt: mandate.startsAt,
        cadence: mandate.cadence,
        endsAt: mandate.endsAt,
        lastFired,
        now,
        maxCatchUp,
      });

      for (const occurrence of plan.occurrences) {
        const outcome = await this.fireOccurrence(sub, mandate, occurrence);
        report.outcomes.push({
          subscriptionId: sub.id,
          occurrence,
          outcome: outcome.kind,
          rejectionCode: outcome.rejectionCode,
        });
        if (outcome.kind === 'invoiced') report.fired += 1;
      }

      if (plan.completed) {
        await this.sql`
          UPDATE pay.subscriptions
             SET status = 'completed', next_run_at = ${plan.nextRunAt}, updated_at = ${now}
           WHERE id = ${sub.id}
        `;
      } else {
        await this.sql`
          UPDATE pay.subscriptions
             SET next_run_at = ${plan.nextRunAt}, updated_at = ${now}
           WHERE id = ${sub.id} AND status = 'active'
        `;
      }
    }

    return report;
  }

  /**
   * Claim occurrence then open invoice (crypto_invoice) or refuse by name.
   * Ledger business key reserved: `pay.subscription:<subId>:<occurrence>`.
   */
  async fireOccurrence(
    sub: SubscriptionRecord,
    mandate: MandateRecord,
    occurrence: number,
  ): Promise<{ kind: FiringOutcome; rejectionCode?: string }> {
    if (sub.status !== 'active') return { kind: 'skipped' };

    return transaction(
      this.sql,
      async (tx) => {
        const claimed = await tx<Array<{ id: string }>>`
          INSERT INTO pay.subscription_executions (
            subscription_id, occurrence, amount, status
          ) VALUES (
            ${sub.id}, ${occurrence}, ${formatAmount(mandate.amount)}::numeric, 'pending'
          )
          ON CONFLICT (subscription_id, occurrence) DO NOTHING
          RETURNING id
        `;

        let executionId: string;
        if (claimed.length === 0) {
          const existing = await tx<Array<{ id: string; status: string }>>`
            SELECT id, status FROM pay.subscription_executions
             WHERE subscription_id = ${sub.id} AND occurrence = ${occurrence}
             FOR UPDATE
          `;
          const row = existing[0];
          if (!row) return { kind: 'already-fired' as const };
          if (row.status !== 'pending') return { kind: 'already-fired' as const };
          executionId = row.id;
        } else {
          executionId = claimed[0]!.id;
        }

        // Card mandate rail not wired yet — refuse by name, leave execution rejected.
        if (sub.path === 'card') {
          await tx`
            UPDATE pay.subscription_executions
               SET status = 'rejected', rejection_code = 'pay.mandate_rail_absent'
             WHERE id = ${executionId}
          `;
          return { kind: 'rejected' as const, rejectionCode: 'pay.mandate_rail_absent' };
        }

        // crypto_invoice (default): open a payment, never pull.
        if (!this.openInvoice) {
          await tx`
            UPDATE pay.subscription_executions
               SET status = 'rejected', rejection_code = 'pay.subscription_driver_absent'
             WHERE id = ${executionId}
          `;
          return { kind: 'rejected' as const, rejectionCode: 'pay.subscription_driver_absent' };
        }

        try {
          const { paymentId } = await this.openInvoice({
            merchantId: sub.merchantId,
            customerId: sub.customerId,
            amount: mandate.amount,
            assetId: mandate.assetId,
            subscriptionId: sub.id,
            occurrence,
          });
          await tx`
            UPDATE pay.subscription_executions
               SET status = 'invoiced', payment_id = ${paymentId}, settled_at = now()
             WHERE id = ${executionId}
          `;
          return { kind: 'invoiced' as const };
        } catch (err) {
          const code = err instanceof PayError ? err.code : err instanceof Error ? err.message.slice(0, 120) : 'invoice.failed';
          await tx`
            UPDATE pay.subscription_executions
               SET status = 'rejected', rejection_code = ${code}
             WHERE id = ${executionId}
          `;
          return { kind: 'rejected' as const, rejectionCode: code };
        }
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );
  }

  private async maxFiredOccurrence(subscriptionId: string): Promise<number | null> {
    const rows = await this.sql<Array<{ m: number | null }>>`
      SELECT MAX(occurrence) AS m FROM pay.subscription_executions
       WHERE subscription_id = ${subscriptionId}
         AND status IN ('pending', 'settled', 'invoiced', 'rejected')
    `;
    const m = rows[0]?.m;
    return m === null || m === undefined ? null : Number(m);
  }

  private async requireMerchant(merchantId: string): Promise<{ id: string; status: string }> {
    const rows = await this.sql<Array<{ id: string; status: string }>>`
      SELECT id, status FROM pay.merchants WHERE id = ${merchantId}
    `;
    const row = rows[0];
    if (!row) throw new PayError(`Merchant ${merchantId} not found`, 'pay.merchant_not_found');
    return row;
  }
}
