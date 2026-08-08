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
  /**
   * `changed_at` at the column's own precision, as Postgres renders it.
   *
   * STOP §4.2b #7: the freeze event keyed its idempotency id off
   * `changedAt.toISOString()`, and a JavaScript `Date` holds MILLISECONDS while
   * `timestamptz` holds microseconds. A freeze and the thaw that followed it
   * inside the same millisecond produced the same `msgID`, and JetStream drops
   * the duplicate — which is the THAW. The platform then stays halted in every
   * consumer's view of the world while the database says it is open.
   *
   * Reading the timestamp back through a `Date` cannot fix this: the precision
   * is already gone by then. So the identity travels as the text the database
   * itself produced, and never round-trips through a JS clock type.
   */
  readonly changedAtPrecise: string;
}

interface FreezeRow {
  frozen: boolean;
  reason: string | null;
  actor: string | null;
  changed_at: Date;
  changed_at_precise: string;
}

const MISSING = 'posting_freeze row is missing — run migrations (0002_durable_freeze) before starting svc-ledger';

function toState(row: FreezeRow): FreezeState {
  return {
    frozen: row.frozen,
    reason: row.reason,
    actor: row.actor,
    changedAt: row.changed_at,
    changedAtPrecise: row.changed_at_precise,
  };
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
    SELECT frozen, reason, actor, changed_at, changed_at::text AS changed_at_precise
      FROM posting_freeze WHERE id = true
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
 *
 * STOP §4.2b #3: a second freeze MUST NOT silently overwrite a prior freeze's
 * reason/actor (recon hourly used to clobber an operator freeze). Same
 * attribution is a no-op; different attribution is refused. Unfreeze still
 * clears for a named actor.
 */
export async function writeFreeze(
  sql: Sql,
  next: { frozen: true; reason: string; actor: string } | { frozen: false; actor: string },
): Promise<FreezeState> {
  if (next.frozen) {
    // Claim freeze only when currently thawed, or when attribution is identical
    // (idempotent re-freeze). Different attribution while already frozen → refuse.
    const rows = await sql<FreezeRow[]>`
      UPDATE posting_freeze
         SET frozen = true,
             reason = ${next.reason},
             actor = ${next.actor},
             changed_at = now()
       WHERE id = true
         AND (
           frozen = false
           OR (reason = ${next.reason} AND actor = ${next.actor})
         )
      RETURNING frozen, reason, actor, changed_at, changed_at::text AS changed_at_precise
    `;
    if (rows[0]) return toState(rows[0]);

    // Nothing matched. `readFreeze` throws `ledger.uninitialised` if the row is
    // absent, which is the honest answer for that case. If the row is present
    // and thawed the UPDATE above would have taken it, so reaching here with
    // `frozen = false` means another writer thawed it between the two
    // statements — a lost race, not a missing migration. Say so.
    const current = await readFreeze(sql);
    if (!current.frozen) {
      throw new LedgerError(
        `Freeze lost a race: the ledger was thawed by ${current.actor ?? 'unknown'} while ${next.actor} was freezing it. Retry.`,
        'ledger.freeze_raced',
      );
    }
    throw new LedgerError(
      `Ledger already frozen by ${current.actor ?? 'unknown'}: ${current.reason ?? 'no reason'} — ` +
        `refusing to overwrite with ${next.actor}: ${next.reason} (STOP §4.2b #3)`,
      'ledger.freeze_attributed',
    );
  }

  const rows = await sql<FreezeRow[]>`
    UPDATE posting_freeze
       SET frozen = false, reason = null, actor = ${next.actor}, changed_at = now()
     WHERE id = true
    RETURNING frozen, reason, actor, changed_at, changed_at::text AS changed_at_precise
  `;

  const row = rows[0];
  if (!row) throw new LedgerError(MISSING, 'ledger.uninitialised');
  return toState(row);
}

/**
 * The bus idempotency key for one freeze state change.
 *
 * A function rather than an inline template because the defect it fixes lives
 * entirely in the choice of input (STOP §4.2b #7), and that choice is worth a
 * test that does not need a database to run. `changedAtPrecise` is the column's
 * own text; `changedAt` is a JS `Date` and has already lost the microseconds
 * that separate a freeze from the thaw that followed it.
 */
export function freezeEventKey(state: Pick<FreezeState, 'changedAtPrecise'>): string {
  return `ledger.freeze:${state.changedAtPrecise}`;
}

/** The message `post()` refuses with. One phrasing, so callers can match on it. */
export function frozenMessage(reason: string | null): string {
  return `Ledger posting is frozen${reason ? `: ${reason}` : ''}`;
}
