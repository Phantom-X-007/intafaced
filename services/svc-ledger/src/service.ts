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
import { freezeEventKey, readFreeze, writeFreeze, type FreezeState } from './ledger/freeze.js';
import type { HistoryEntry, HistoryRange } from './ledger/history.js';
import { runReconciliation, type ReconciliationReport } from './ledger/reconcile.js';
import { withMoneySpan, withSpan } from './tracing.js';

/**
 * The service layer: the ledger engine plus the three things wrapping every
 * post — the freeze switch, tracing, and the event emission that lets the rest
 * of the OS react to money moving.
 *
 * The freeze switch OWNS no state. It reads and writes `posting_freeze`, and
 * `post()` is gated inside the engine's chain-tip transaction rather than here
 * (see postgres-ledger.ts). This class holds no cached copy on purpose: a cache
 * would be right until the moment a second replica moved the switch, which is
 * exactly the moment it matters.
 */
export class LedgerService implements LedgerClient {
  private readonly engine: PostgresLedger;
  private readonly bootPostingEnabled: boolean;

  constructor(
    private readonly sql: Sql,
    private readonly bus: EventBus,
    options: { postingEnabled?: boolean } = {},
  ) {
    this.engine = new PostgresLedger(sql);
    this.bootPostingEnabled = options.postingEnabled ?? true;
  }

  async post(request: PostRequest): Promise<LedgerTx> {
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

  /**
   * Entry history for one account in one window — a READ, and nothing else.
   *
   * Deliberately NOT on the `LedgerClient` interface, for the same reason
   * `freeze` is not: `LedgerClient` is what every calling service codes against
   * and what the conformance suite pins, and this is one caller's projection
   * source rather than a capability every ledger implementation must offer.
   *
   * No span wrapper, matching `balance`/`balances`. `withMoneySpan` exists to
   * keep MOVEMENTS at 100% through the tail sampler; nothing moves here, and
   * tagging a read `money_path=true` would dilute the one signal that decides
   * what the collector keeps.
   */
  history(ref: AccountRef, range: HistoryRange): Promise<HistoryEntry[]> {
    return this.engine.history(ref, range);
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
  //
  // Deliberately NOT on the `LedgerClient` interface, and so not in the
  // conformance suite. `LedgerClient` is the contract every calling service
  // codes against; widening it would give svc-trade a method to halt the
  // platform, and the in-memory reference a durability guarantee it cannot
  // honour. Freezing is an operator action against THE ledger, not a thing a
  // ledger client does.

  /**
   * Halt posting, durably.
   *
   * `actor` is required and unvalidated on purpose: an operator's principal id,
   * `reconciliation`, or `env:LEDGER_POSTING_ENABLED`. The database refuses a
   * freeze with neither reason nor actor (`posting_freeze_attributed_ck`) —
   * whoever finds the platform halted must be able to find out why and by whom.
   */
  async freeze(reason: string, actor: string): Promise<FreezeState> {
    try {
      const { state, switched } = await writeFreeze(this.sql, { frozen: true, reason, actor });
      // Same-attribution re-freeze is a true no-op (hourly recon). Do not
      // re-publish — consumers would re-alarm under a stable key or a new one.
      if (switched) await this.publishFreeze(state);
      return state;
    } catch (err) {
      // Already frozen under different attribution — keep the first reason
      // standing (STOP §4.2b #3). Recon must not erase an operator freeze, and
      // the caller still sees the durable halt.
      if (err instanceof LedgerError && err.code === 'ledger.freeze_attributed') {
        return this.freezeState();
      }
      throw err;
    }
  }

  async unfreeze(actor: string): Promise<FreezeState> {
    const { state, switched } = await writeFreeze(this.sql, { frozen: false, actor });
    if (switched) await this.publishFreeze(state);
    return state;
  }

  /**
   * What the DATABASE says, every time — no cached field.
   *
   * A round trip per `/health` and `/ready` call, accepted: a single-row
   * primary-key read is cheap, and the alternative is a replica reporting
   * itself ready while the book it writes to is frozen. That is the exact
   * failure this change exists to remove.
   */
  async status(): Promise<{ postingEnabled: boolean; frozenReason: string | null; frozenBy: string | null }> {
    const state = await readFreeze(this.sql);
    return { postingEnabled: !state.frozen, frozenReason: state.reason, frozenBy: state.actor };
  }

  /**
   * The whole freeze row, for the operator surface.
   *
   * `status()` reshapes it for health checks and drops `changedAt`. An operator
   * deciding whether to thaw needs to know WHEN the platform was halted as much
   * as by whom — a freeze from four minutes ago and one from yesterday call for
   * different actions — so the operator read returns the row rather than the
   * health projection of it.
   */
  async freezeState(): Promise<FreezeState> {
    return readFreeze(this.sql);
  }

  /**
   * Reconcile `LEDGER_POSTING_ENABLED` with the database at boot. Call once,
   * before serving traffic.
   *
   * THE DATABASE WINS — but only in one direction, and the asymmetry is the
   * whole safety property:
   *
   *   · `LEDGER_POSTING_ENABLED=false` FREEZES. The flag is a legitimate way to
   *     bring the platform up halted, and making it durable means that decision
   *     also reaches the replica whose config nobody edited.
   *
   *   · `LEDGER_POSTING_ENABLED=true` NEVER THAWS. It defaults to true, so
   *     honouring it would mean any restart of any replica — a deploy, an OOM
   *     kill, an autoscaler — silently resumes posting on a book that
   *     reconciliation halted. That is precisely the bug this change removes,
   *     and it would come straight back through the front door.
   *
   * An unfreeze is a deliberate act with a named actor. A default-valued
   * environment variable is not one, and must never be able to impersonate one.
   */
  async applyStartupPolicy(): Promise<FreezeState> {
    const state = await readFreeze(this.sql);
    if (this.bootPostingEnabled || state.frozen) return state;

    return this.freeze('LEDGER_POSTING_ENABLED=false at startup', 'env:LEDGER_POSTING_ENABLED');
  }

  private async publishFreeze(state: FreezeState): Promise<void> {
    // After the durable write, like `tx.posted` after commit. If this publish
    // throws, the switch has still moved — the caller learns the notification
    // failed, never that the freeze did.
    await this.bus.publish(
      'ledgerFreezeUpdated',
      {
        frozen: state.frozen,
        reason: state.reason,
        actor: state.actor ?? 'unknown',
        changedAt: state.changedAt.toISOString(),
      },
      // STOP §4.2b #7 — see `freezeEventKey`. This used to key off
      // `changedAt.toISOString()`, which is millisecond-precision, so a freeze
      // and the thaw right after it inside one millisecond shared a msgID and
      // JetStream dropped the second: the THAW. Every consumer then believed
      // the platform was still halted while the database said it was open.
      { idempotencyKey: freezeEventKey(state) },
    );
  }

  /**
   * Run reconciliation. On failure the ledger freezes itself and emits the
   * alarm — §4.2: "mismatch = page the operator, freeze the module that
   * diverged". Freezing is automatic because a book we cannot verify must not
   * accept more writes while someone decides what to do about it.
   *
   * The freeze is written BEFORE either publish, and awaited. If the bus is
   * down, the alarm fails to send and this throws — with the book already
   * halted. An alarm nobody receives is bad; a book still accepting writes
   * because the alarm failed would be the actual disaster.
   */
  async reconcile(): Promise<ReconciliationReport> {
    return withSpan('ledger.reconcile', async () => {
      const report = await runReconciliation(this.sql);

      if (!report.ok) {
        await this.freeze('reconciliation mismatch', 'reconciliation');

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
