import type { Sql } from 'postgres';
import { InsufficientFundsError, formatAmount, parseAmount, userAvailable, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import type { EarnService } from '../earn/earn-service.js';
import type { SpaceService } from '../spaces/space-service.js';
import { withMoneySpan } from '../tracing.js';
import type { Cadence } from '../transfers/schedule.js';

/**
 * AUTO-INVEST (§31:805 / bank.auto-invest) — F-plane half.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Rules that move a user's own value on a schedule or a threshold, only through
 * existing ledger recipes. A rule is an instruction, never a balance. §0.6
 * applies without exception.
 *
 *   threshold_sweep  primary available of asset > threshold → excess into an
 *                    earn pool of the SAME asset via `earn.deposit`
 *   dca              scheduled buy of another asset — REQUIRES a convert port
 *                    that supplies a real rate. Absent the port, create and run
 *                    both refuse `bank.auto_invest_rate_unset`. No §8 invent.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT HERE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   · Card round-ups — need the capture path to emit spare change; partial later.
 *   · Sovereign / session-key allowance plane — protocol.smart-accounts (Shehzad).
 *   · Any rate, APR, or convert quote invented in this service.
 */

/**
 * Future convert counterparty. Not implemented here — when a deployment has a
 * real convert (trade.convert over HTTP or an injected test double), DCA can
 * fire. Until then every DCA path refuses by name rather than inventing a price.
 */
export interface ConvertPort {
  /**
   * Spend `fromAmount` of `fromAsset` to receive some amount of `toAsset`.
   * Must refuse internally when no rate is available — this service does not
   * invent one on the caller's behalf.
   */
  convert(input: {
    userId: string;
    fromAsset: string;
    toAsset: string;
    fromAmount: Amount;
    clientConvertId: string;
  }): Promise<{ toAmount: Amount; ledgerTxId: string }>;
}

export type AutoInvestKind = 'threshold_sweep' | 'dca';
export type AutoInvestRuleStatus = 'active' | 'paused' | 'cancelled';
export type AutoInvestRunStatus = 'pending' | 'settled' | 'rejected' | 'skipped';

export interface AutoInvestRule {
  id: string;
  userId: string;
  kind: AutoInvestKind;
  assetId: string;
  threshold: Amount | null;
  targetPoolId: string | null;
  buyAssetId: string | null;
  amount: Amount | null;
  cadence: Cadence | null;
  nextRunAt: Date | null;
  status: AutoInvestRuleStatus;
  createdAt: Date;
}

export interface AutoInvestRun {
  id: string;
  ruleId: string;
  clientRunId: string;
  status: AutoInvestRunStatus;
  amount: Amount | null;
  ledgerTxId: string | null;
  positionId: string | null;
  rejectionCode: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

export interface AutoInvestRunReport {
  considered: number;
  settled: number;
  skipped: number;
  rejected: number;
  failures: Array<{ ruleId: string; code: string }>;
}

interface RuleRow {
  id: string;
  user_id: string;
  kind: AutoInvestKind;
  asset_id: string;
  threshold: string | null;
  target_pool_id: string | null;
  buy_asset_id: string | null;
  amount: string | null;
  cadence: Cadence | null;
  next_run_at: Date | null;
  status: AutoInvestRuleStatus;
  created_at: Date;
}

interface RunRow {
  id: string;
  rule_id: string;
  client_run_id: string;
  status: AutoInvestRunStatus;
  amount: string | null;
  ledger_tx_id: string | null;
  position_id: string | null;
  rejection_code: string | null;
  created_at: Date;
  settled_at: Date | null;
}

function toRule(row: RuleRow): AutoInvestRule {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    assetId: row.asset_id,
    threshold: row.threshold === null ? null : parseAmount(row.threshold),
    targetPoolId: row.target_pool_id,
    buyAssetId: row.buy_asset_id,
    amount: row.amount === null ? null : parseAmount(row.amount),
    cadence: row.cadence,
    nextRunAt: row.next_run_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toRun(row: RunRow): AutoInvestRun {
  return {
    id: row.id,
    ruleId: row.rule_id,
    clientRunId: row.client_run_id,
    status: row.status,
    amount: row.amount === null ? null : parseAmount(row.amount),
    ledgerTxId: row.ledger_tx_id,
    positionId: row.position_id,
    rejectionCode: row.rejection_code,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}

export interface AutoInvestServiceOptions {
  /**
   * Cross-asset convert. Absent = every DCA path refuses
   * `bank.auto_invest_rate_unset`. Never defaulted to a fake rate source.
   */
  convert?: ConvertPort;
  /** Max rules one runner pass claims. Bounds blast radius of a bad pass. */
  batchSize?: number;
}

export class AutoInvestService {
  private readonly convert: ConvertPort | null;
  private readonly batchSize: number;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly earn: EarnService,
    private readonly spaces: SpaceService,
    options: AutoInvestServiceOptions = {},
  ) {
    this.convert = options.convert ?? null;
    this.batchSize = options.batchSize ?? 200;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Same-asset threshold sweep into an earn pool.
   *
   * Pool asset must match the watched asset. No rate is consulted — this is a
   * pure ledger move of the user's own value into their own stake pot.
   */
  async createThresholdSweep(input: { userId: string; assetId: string; threshold: Amount; targetPoolId: string }): Promise<AutoInvestRule> {
    if (input.threshold <= 0n) {
      throw new BankError('A threshold sweep needs a positive keep-amount', 'bank.auto_invest_invalid_threshold');
    }
    const pool = await this.earn.pool(input.targetPoolId);
    if (pool.status !== 'open') {
      throw new BankError(`Pool "${pool.name}" is closed`, 'bank.pool_closed');
    }
    if (pool.assetId !== input.assetId) {
      throw new BankError(`Threshold sweep asset ${input.assetId} does not match pool asset ${pool.assetId}`, 'bank.asset_mismatch');
    }
    // Ensure the primary exists so a first run does not invent a space under
    // the runner's feet — and so the user can see the source balance in UI.
    await this.spaces.ensurePrimary(input.userId, input.assetId);

    const rows = await this.sql<RuleRow[]>`
      INSERT INTO bank.auto_invest_rules
        (user_id, kind, asset_id, threshold, target_pool_id, status)
      VALUES (
        ${input.userId}, 'threshold_sweep', ${input.assetId},
        ${formatAmount(input.threshold)}::numeric, ${input.targetPoolId}::uuid, 'active'
      )
      RETURNING id, user_id, kind, asset_id, threshold, target_pool_id, buy_asset_id,
                amount, cadence, next_run_at, status, created_at
    `;
    return toRule(rows[0]!);
  }

  /**
   * DCA schedule — refuse-closed without a convert port.
   *
   * The Done bar for rates: if this deployment has no convert counterparty, we
   * do not create a dormant schedule that looks live and invents a price later.
   * Named refusal today; wire `ConvertPort` when trade.convert is injectable.
   */
  async createDca(input: {
    userId: string;
    spendAssetId: string;
    buyAssetId: string;
    amount: Amount;
    cadence: Cadence;
    startsAt: Date;
  }): Promise<AutoInvestRule> {
    if (!this.convert) {
      throw new BankError(
        'Auto-invest DCA needs a convert rate counterparty — rates are not invented here (§8 / bank.auto_invest_rate_unset)',
        'bank.auto_invest_rate_unset',
      );
    }
    if (input.amount <= 0n) {
      throw new BankError('A DCA schedule needs a positive amount', 'bank.below_minimum');
    }
    if (input.spendAssetId === input.buyAssetId) {
      throw new BankError('DCA needs two different assets — same-asset use a threshold sweep or standing order', 'bank.same_space');
    }
    await this.spaces.ensurePrimary(input.userId, input.spendAssetId);

    const rows = await this.sql<RuleRow[]>`
      INSERT INTO bank.auto_invest_rules
        (user_id, kind, asset_id, buy_asset_id, amount, cadence, next_run_at, status)
      VALUES (
        ${input.userId}, 'dca', ${input.spendAssetId}, ${input.buyAssetId},
        ${formatAmount(input.amount)}::numeric, ${input.cadence}, ${input.startsAt}, 'active'
      )
      RETURNING id, user_id, kind, asset_id, threshold, target_pool_id, buy_asset_id,
                amount, cadence, next_run_at, status, created_at
    `;
    return toRule(rows[0]!);
  }

  async listRules(userId: string): Promise<AutoInvestRule[]> {
    const rows = await this.sql<RuleRow[]>`
      SELECT id, user_id, kind, asset_id, threshold, target_pool_id, buy_asset_id,
             amount, cadence, next_run_at, status, created_at
        FROM bank.auto_invest_rules
       WHERE user_id = ${userId}
       ORDER BY created_at DESC
    `;
    return rows.map(toRule);
  }

  async getRule(ruleId: string): Promise<AutoInvestRule> {
    const rows = await this.sql<RuleRow[]>`
      SELECT id, user_id, kind, asset_id, threshold, target_pool_id, buy_asset_id,
             amount, cadence, next_run_at, status, created_at
        FROM bank.auto_invest_rules WHERE id = ${ruleId}
    `;
    const row = rows[0];
    if (!row) throw new BankError(`Auto-invest rule ${ruleId} not found`, 'bank.auto_invest_not_found');
    return toRule(row);
  }

  async cancelRule(ruleId: string): Promise<void> {
    const updated = await this.sql`
      UPDATE bank.auto_invest_rules SET status = 'cancelled', updated_at = now()
       WHERE id = ${ruleId} AND status IN ('active', 'paused')
       RETURNING id
    `;
    if (updated.length === 0) {
      throw new BankError(`Auto-invest rule ${ruleId} is not cancellable`, 'bank.auto_invest_inactive');
    }
  }

  // ── Runner ─────────────────────────────────────────────────────────────────

  /**
   * Fire every active rule that is due (or every threshold sweep once per pass).
   *
   * Isolation: one rule's throw is recorded; other rules continue. Same shape as
   * standing-order / earn-accrual isolation (#1491).
   */
  async runDue(input: { now?: Date; limit?: number } = {}): Promise<AutoInvestRunReport> {
    const now = input.now ?? new Date();
    const limit = input.limit ?? this.batchSize;
    const report: AutoInvestRunReport = { considered: 0, settled: 0, skipped: 0, rejected: 0, failures: [] };

    const rules = await this.sql<RuleRow[]>`
      SELECT id, user_id, kind, asset_id, threshold, target_pool_id, buy_asset_id,
             amount, cadence, next_run_at, status, created_at
        FROM bank.auto_invest_rules
       WHERE status = 'active'
         AND (
           kind = 'threshold_sweep'
           OR (kind = 'dca' AND next_run_at IS NOT NULL AND next_run_at <= ${now})
         )
       ORDER BY created_at ASC
       LIMIT ${limit}
    `;

    for (const row of rules) {
      report.considered += 1;
      const rule = toRule(row);
      try {
        const outcome = await this.driveRule(rule, now);
        if (outcome === 'settled') report.settled += 1;
        else if (outcome === 'skipped') report.skipped += 1;
        else if (outcome === 'rejected') report.rejected += 1;
      } catch (err) {
        const code = err instanceof BankError ? err.code : 'bank.auto_invest_run_failed';
        report.failures.push({ ruleId: rule.id, code });
      }
    }

    return report;
  }

  private async driveRule(rule: AutoInvestRule, now: Date): Promise<'settled' | 'skipped' | 'rejected'> {
    if (rule.kind === 'threshold_sweep') {
      return this.driveThresholdSweep(rule, now);
    }
    return this.driveDca(rule, now);
  }

  private async driveThresholdSweep(rule: AutoInvestRule, now: Date): Promise<'settled' | 'skipped' | 'rejected'> {
    return withMoneySpan(
      'bank.auto_invest.threshold_sweep',
      { operation: 'auto-invest-threshold-sweep', ruleId: rule.id, userId: rule.userId, assetId: rule.assetId },
      async () => {
        // One run id per attempt; re-drive uses the same client_run_id only if
        // the caller supplies it — the scheduled runner uses a fresh id so a
        // later excess after a successful sweep can move again.
        const clientRunId = `sweep:${rule.id}:${now.toISOString()}`;
        const threshold = rule.threshold!;
        const poolId = rule.targetPoolId!;

        const bal = (await this.ledger.balance(userAvailable(rule.userId, rule.assetId))).amount;
        if (bal <= threshold) {
          await this.recordSkipped(rule.id, clientRunId, null, 'bank.auto_invest_below_threshold');
          return 'skipped';
        }
        const excess = bal - threshold;

        const claimed = await this.sql<Array<{ id: string }>>`
          INSERT INTO bank.auto_invest_runs (rule_id, client_run_id, status, amount)
          VALUES (
            ${rule.id}::uuid, ${clientRunId}, 'pending',
            ${formatAmount(excess)}::numeric
          )
          ON CONFLICT (rule_id, client_run_id) DO NOTHING
          RETURNING id
        `;
        if (claimed.length === 0) {
          // Same client_run_id already finished or in flight — treat as settled.
          return 'settled';
        }
        const runId = claimed[0]!.id;
        const positionId = runId; // earn deposit idempotency key = run id

        try {
          const position = await this.earn.deposit({
            poolId,
            userId: rule.userId,
            amount: excess,
            positionId,
            now,
          });
          await this.sql`
            UPDATE bank.auto_invest_runs
               SET status = 'settled',
                   position_id = ${position.id},
                   settled_at = ${now},
                   amount = ${formatAmount(excess)}::numeric
             WHERE id = ${runId}::uuid
          `;
          return 'settled';
        } catch (err) {
          const code =
            err instanceof BankError
              ? err.code
              : err instanceof InsufficientFundsError
                ? 'ledger.insufficient_funds'
                : 'bank.auto_invest_run_failed';
          await this.sql`
            UPDATE bank.auto_invest_runs
               SET status = 'rejected', rejection_code = ${code}, settled_at = ${now}
             WHERE id = ${runId}::uuid AND status = 'pending'
          `;
          if (err instanceof BankError || err instanceof InsufficientFundsError) return 'rejected';
          throw err;
        }
      },
    );
  }

  private async driveDca(rule: AutoInvestRule, now: Date): Promise<'settled' | 'skipped' | 'rejected'> {
    if (!this.convert) {
      // Defence in depth: create already refuses, but a rule from a previous
      // deploy that lost its convert port must not invent a rate on fire.
      throw new BankError(
        'Auto-invest DCA needs a convert rate counterparty — rates are not invented here (§8 / bank.auto_invest_rate_unset)',
        'bank.auto_invest_rate_unset',
      );
    }
    // Convert-backed DCA body lands with the port. Until then create refuses,
    // so this path is only reachable in tests that inject a ConvertPort.
    const clientRunId = `dca:${rule.id}:${rule.nextRunAt?.toISOString() ?? now.toISOString()}`;
    const amount = rule.amount!;
    const buyAssetId = rule.buyAssetId!;

    const claimed = await this.sql<Array<{ id: string }>>`
      INSERT INTO bank.auto_invest_runs (rule_id, client_run_id, status, amount)
      VALUES (
        ${rule.id}::uuid, ${clientRunId}, 'pending',
        ${formatAmount(amount)}::numeric
      )
      ON CONFLICT (rule_id, client_run_id) DO NOTHING
      RETURNING id
    `;
    if (claimed.length === 0) return 'settled';
    const runId = claimed[0]!.id;

    try {
      const result = await this.convert.convert({
        userId: rule.userId,
        fromAsset: rule.assetId,
        toAsset: buyAssetId,
        fromAmount: amount,
        clientConvertId: clientRunId,
      });
      await this.sql`
        UPDATE bank.auto_invest_runs
           SET status = 'settled',
               ledger_tx_id = ${result.ledgerTxId},
               amount = ${formatAmount(amount)}::numeric,
               settled_at = ${now}
         WHERE id = ${runId}::uuid
      `;
      // Advance next_run_at by one cadence step (simple daily/weekly/monthly).
      const next = advanceCadence(rule.nextRunAt ?? now, rule.cadence!);
      await this.sql`
        UPDATE bank.auto_invest_rules SET next_run_at = ${next}, updated_at = now()
         WHERE id = ${rule.id}::uuid
      `;
      return 'settled';
    } catch (err) {
      const code =
        err instanceof BankError
          ? err.code
          : err instanceof InsufficientFundsError
            ? 'ledger.insufficient_funds'
            : 'bank.auto_invest_run_failed';
      await this.sql`
        UPDATE bank.auto_invest_runs
           SET status = 'rejected', rejection_code = ${code}, settled_at = ${now}
         WHERE id = ${runId}::uuid AND status = 'pending'
      `;
      if (err instanceof BankError || err instanceof InsufficientFundsError) return 'rejected';
      throw err;
    }
  }

  private async recordSkipped(ruleId: string, clientRunId: string, amount: Amount | null, reason: string): Promise<void> {
    await this.sql`
      INSERT INTO bank.auto_invest_runs (rule_id, client_run_id, status, amount, rejection_code, settled_at)
      VALUES (
        ${ruleId}::uuid, ${clientRunId}, 'skipped',
        ${amount === null ? null : formatAmount(amount)}::numeric,
        ${reason}, now()
      )
      ON CONFLICT (rule_id, client_run_id) DO NOTHING
    `;
  }

  async runsOf(ruleId: string): Promise<AutoInvestRun[]> {
    const rows = await this.sql<RunRow[]>`
      SELECT id, rule_id, client_run_id, status, amount, ledger_tx_id, position_id,
             rejection_code, created_at, settled_at
        FROM bank.auto_invest_runs
       WHERE rule_id = ${ruleId}
       ORDER BY created_at DESC
    `;
    return rows.map(toRun);
  }
}

function advanceCadence(from: Date, cadence: Cadence): Date {
  const DAY_MS = 24 * 60 * 60 * 1000;
  switch (cadence) {
    case 'daily':
      return new Date(from.getTime() + DAY_MS);
    case 'weekly':
      return new Date(from.getTime() + 7 * DAY_MS);
    case 'monthly': {
      const year = from.getUTCFullYear();
      const month = from.getUTCMonth() + 1;
      const day = from.getUTCDate();
      const targetYear = year + Math.floor(month / 12);
      const targetMonth = month % 12;
      const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      return new Date(
        Date.UTC(
          targetYear,
          targetMonth,
          Math.min(day, daysInMonth),
          from.getUTCHours(),
          from.getUTCMinutes(),
          from.getUTCSeconds(),
          from.getUTCMilliseconds(),
        ),
      );
    }
  }
}
