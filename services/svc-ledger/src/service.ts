import type { Sql } from 'postgres';
import {
  formatAmount,
  LedgerError,
  type AccountRef,
  type Balance,
  type LedgerClient,
  type LedgerTx,
  type PostRequest,
} from '@intafaced/ledger-client';
import type { EventBus } from '@intafaced/events';
import { PostgresLedger } from './ledger/postgres-ledger.js';
import { runReconciliation, type ReconciliationReport } from './ledger/reconcile.js';
import { withMoneySpan, withSpan } from './tracing.js';

/**
 * The service layer: the ledger engine plus the three things wrapping every
 * post — the freeze switch, tracing, and the event emission that lets the rest
 * of the OS react to money moving.
 */
export class LedgerService implements LedgerClient {
  private readonly engine: PostgresLedger;
  private postingEnabled: boolean;
  private frozenReason: string | null = null;

  constructor(
    private readonly sql: Sql,
    private readonly bus: EventBus,
    options: { postingEnabled?: boolean } = {},
  ) {
    this.engine = new PostgresLedger(sql);
    this.postingEnabled = options.postingEnabled ?? true;
  }

  async post(request: PostRequest): Promise<LedgerTx> {
    if (!this.postingEnabled) {
      throw new LedgerError(`Ledger posting is frozen${this.frozenReason ? `: ${this.frozenReason}` : ''}`, 'ledger.frozen');
    }

    return withMoneySpan(
      'ledger.post',
      {
        module: request.module,
        reason: request.reason,
        idempotencyKey: request.idempotencyKey,
        entryCount: request.entries.length,
      },
      async (span) => {
        const tx = await this.engine.post(request);
        span.setAttribute('intafaced.tx_id', tx.id);

        // Emitted AFTER commit. A consumer must never see a transaction that
        // could still roll back — at-least-once delivery of a fact that
        // happened beats at-most-once delivery of one that might not have.
        await this.bus.publish(
          'ledgerTxPosted',
          {
            txId: tx.id,
            module: tx.module,
            reason: tx.reason,
            hash: tx.hash,
            previousHash: tx.previousHash,
            entries: tx.entries.map((e) => ({
              accountId: e.accountId,
              assetId: e.assetId,
              direction: e.direction,
              amount: formatAmount(e.amount),
            })),
            postedAt: tx.postedAt.toISOString(),
          },
          { idempotencyKey: `ledger.tx:${tx.id}`, correlationId: request.correlationId ?? tx.id },
        );

        return tx;
      },
    );
  }

  balance(ref: AccountRef): Promise<Balance> {
    return this.engine.balance(ref);
  }

  balances(ownerType: AccountRef['ownerType'], ownerId: string): Promise<Balance[]> {
    return this.engine.balances(ownerType, ownerId);
  }

  getTx(txId: string): Promise<LedgerTx | null> {
    return this.engine.getTx(txId);
  }

  getTxByKey(idempotencyKey: string): Promise<LedgerTx | null> {
    return this.engine.getTxByKey(idempotencyKey);
  }

  journal(limit?: number, afterSeq?: bigint): Promise<LedgerTx[]> {
    return this.engine.journal(limit, afterSeq);
  }

  // ── Operator controls (§14 admin) ──────────────────────────────────────────

  freeze(reason: string): void {
    this.postingEnabled = false;
    this.frozenReason = reason;
  }

  unfreeze(): void {
    this.postingEnabled = true;
    this.frozenReason = null;
  }

  status(): { postingEnabled: boolean; frozenReason: string | null } {
    return { postingEnabled: this.postingEnabled, frozenReason: this.frozenReason };
  }

  /**
   * Run reconciliation. On failure the ledger freezes itself and emits the
   * alarm — §4.2: "mismatch = page the operator, freeze the module that
   * diverged". Freezing is automatic because a book we cannot verify must not
   * accept more writes while someone decides what to do about it.
   */
  async reconcile(): Promise<ReconciliationReport> {
    return withSpan('ledger.reconcile', async () => {
      const report = await runReconciliation(this.sql);

      if (!report.ok) {
        this.freeze('reconciliation mismatch');

        const firstDrift = report.balances.ok ? null : report.balances.drift[0];
        await this.bus.publish('ledgerReconciliationFailed', {
          accountId: firstDrift?.accountId ?? '00000000-0000-4000-8000-000000000000',
          assetId: firstDrift?.assetId ?? report.unbalancedAssets[0] ?? 'UNKNOWN',
          snapshotBalance: firstDrift?.cached ?? '0',
          replayBalance: firstDrift?.replayed ?? '0',
          drift: firstDrift?.difference ?? '0',
          module: 'ledger',
        });
      }

      return report;
    });
  }
}
