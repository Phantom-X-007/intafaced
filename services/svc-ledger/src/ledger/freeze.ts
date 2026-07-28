import type { Sql } from 'postgres';
import { LedgerError } from '@intafaced/ledger-client';

/**
 * THE KILL-SWITCH, in the database.
 *
 * §4.2 requires that a book we cannot verify stops accepting writes. That
 * requirement was previously met by a `boolean` field on LedgerService, which
 * met it only for as long as the process lived and only for that one process.
 * A freeze is a fact about the LEDGER, not about a server, so it lives with the
 * ledger.
 *
 * The row is a singleton, like `chain_tip`, and for the same reason: the state
 * is global, and two rows would raise the question of which one is true.
 */

export interface FreezeState {
  readonly frozen: boolean;
  /** Why it is frozen. Null exactly when `frozen` is false. */
  readonly reason: string | null;
  /**
   * Who last moved the switch — in either direction. An operator's principal
   * id, `reconciliation` for the automatic self-freeze, or
   * `env:LEDGER_POSTING_ENABLED` for a boot-time freeze.
   */
  readonly actor: string | null;
  readonly changedAt: Date;
}

interface FreezeRow {
  frozen: boolean;
  reason: string | null;
  actor: string | null;
  changed_at: Date;
}

const MISSING = 'posting_freeze row is missing — run migrations (0002_durable_freeze) before starting svc-ledger';

function toState(row: FreezeRow): FreezeState {
  return { frozen: row.frozen, reason: row.reason, actor: row.actor, changedAt: row.changed_at };
}

/**
 * Current freeze state.
 *
 * NOT the read that gates `post()` — that one happens inside the transaction
 * that already holds the chain-tip lock (see postgres-ledger.ts). This is for
 * health, readiness, and the operator surface, where a lock would buy nothing.
 */
export async function readFreeze(sql: Sql): Promise<FreezeState> {
  const rows = await sql<FreezeRow[]>`
    SELECT frozen, reason, actor, changed_at FROM posting_freeze WHERE id = true
  `;
  const row = rows[0];
  if (!row) throw new LedgerError(MISSING, 'ledger.uninitialised');
  return toState(row);
}

/**
 * Move the switch and return what the database now says.
 *
 * `changed_at` comes from `now()`, not from the calling process. Two replicas
 * disagreeing about the wall clock must not be able to disagree about the order
 * in which the platform was halted and resumed.
 *
 * A freeze always carries a reason and an actor; a thaw carries only the actor
 * and clears the reason, because "why it is frozen" is meaningless once it is
 * not. The database enforces the first half (`posting_freeze_attributed_ck`).
 */
export async function writeFreeze(
  sql: Sql,
  next: { frozen: true; reason: string; actor: string } | { frozen: false; actor: string },
): Promise<FreezeState> {
  const reason = next.frozen ? next.reason : null;

  const rows = await sql<FreezeRow[]>`
    UPDATE posting_freeze
       SET frozen = ${next.frozen}, reason = ${reason}, actor = ${next.actor}, changed_at = now()
     WHERE id = true
    RETURNING frozen, reason, actor, changed_at
  `;

  const row = rows[0];
  if (!row) throw new LedgerError(MISSING, 'ledger.uninitialised');
  return toState(row);
}

/** The message `post()` refuses with. One phrasing, so callers can match on it. */
export function frozenMessage(reason: string | null): string {
  return `Ledger posting is frozen${reason ? `: ${reason}` : ''}`;
}
