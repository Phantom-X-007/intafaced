import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  accountKey,
  assertValidPost,
  formatAmount,
  parseAmount,
  signedDelta,
  InsufficientFundsError,
  LedgerError,
  type AccountRef,
  type Balance,
  type LedgerClient,
  type LedgerTx,
  type PostRequest,
  type PostedEntry,
} from '@intafaced/ledger-client';

/**
 * THE LEDGER, on Postgres.
 *
 * Every invariant in §4.2 holds here, and holds in three places on purpose:
 *
 *   1. `assertValidPost` — shared with the reference implementation, so the
 *      rules cannot diverge between them.
 *   2. This transaction — balance checks against locked rows.
 *   3. Database CHECK constraints — a bug in this file still cannot create money.
 *
 * Concurrency: every post takes `FOR UPDATE` on the singleton chain-tip row
 * before reading anything it will write. That lock — not the isolation level —
 * is what totally orders posts, makes the hash chain a chain, and makes
 * concurrent spends impossible to interleave into an overdraft. See the
 * isolation note at the end of `post()` for why READ COMMITTED is correct here.
 */
export class PostgresLedger implements LedgerClient {
  constructor(private readonly sql: Sql) {}

  async post(request: PostRequest): Promise<LedgerTx> {
    // Pure validation first: sum-to-zero, funded locks, key length. No point
    // opening a transaction for a request that can never be legal.
    assertValidPost(request);

    // Fast path — a retry that has already committed needs no lock at all.
    const existing = await this.getTxByKey(request.idempotencyKey);
    if (existing) return existing;

    return transaction(
      this.sql,
      async (tx) => {
        // THE LOCK. Everything after this line runs single-file, platform-wide.
        //
        // Taken first, before any read this transaction will later write, so it
        // establishes a total order over posts by itself — which is exactly why
        // READ COMMITTED is sufficient here (see the isolation note below) and
        // why the hash chain can be a chain at all.
        const tipRows = await tx<Array<{ hash: string | null; seq: string }>>`
          SELECT hash, seq FROM ledger.chain_tip WHERE id = true FOR UPDATE
        `;

        // Re-check inside the lock: two retries of the same key can both get
        // past the fast path above.
        const inTx = await this.loadTxByKey(tx, request.idempotencyKey);
        if (inTx) return inTx;

        const tip = tipRows[0];
        if (!tip) throw new LedgerError('chain_tip row is missing — the ledger is not initialised', 'ledger.uninitialised');

        const previousHash = tip.hash;

        // Lock accounts in a deterministic order. The chain-tip lock already
        // prevents deadlock, but ordering keeps that true if the tip lock is ever
        // sharded away (§13 socket).
        const ordered = [...request.entries].sort((a, b) => accountKey(a.account).localeCompare(accountKey(b.account)));

        const balances = new Map<string, { id: string; balance: bigint }>();
        for (const entry of ordered) {
          const key = accountKey(entry.account);
          if (balances.has(key)) continue;
          balances.set(key, await this.upsertAccount(tx, entry.account));
        }

        // Apply every entry, checking as we go.
        const txId = crypto.randomUUID();
        const postedAt = new Date();
        const postedEntries: PostedEntry[] = [];

        for (const entry of request.entries) {
          const key = accountKey(entry.account);
          const account = balances.get(key)!;
          const next = account.balance + signedDelta(entry);

          if (next < 0n && entry.account.ownerType !== 'treasury') {
            throw new InsufficientFundsError(account.id, entry.account.assetId, formatAmount(entry.amount), formatAmount(account.balance));
          }

          account.balance = next;
          postedEntries.push({
            id: '', // assigned by the database
            txId,
            accountId: account.id,
            assetId: entry.account.assetId,
            direction: entry.direction,
            amount: entry.amount,
            balanceAfter: next,
          });
        }

        const hash = hashTx({ id: txId, module: request.module, reason: request.reason, postedAt, entries: postedEntries }, previousHash);

        const insertedTx = await tx<Array<{ id: string; seq: string; posted_at: Date }>>`
        INSERT INTO ledger.ledger_tx (id, idempotency_key, module, reason, meta, posted_at, hash, previous_hash)
        VALUES (
          ${txId}, ${request.idempotencyKey}, ${request.module}, ${request.reason},
          ${tx.json((request.meta ?? {}) as never)}, ${postedAt}, ${hash}, ${previousHash}
        )
        RETURNING id, seq, posted_at
      `;
        const seq = insertedTx[0]!.seq;

        for (const entry of postedEntries) {
          const inserted = await tx<Array<{ id: string }>>`
          INSERT INTO ledger.ledger_entries (tx_id, account_id, asset_id, direction, amount, balance_after)
          VALUES (
            ${txId}, ${entry.accountId}, ${entry.assetId}, ${entry.direction},
            ${formatAmount(entry.amount)}::numeric, ${formatAmount(entry.balanceAfter)}::numeric
          )
          RETURNING id
        `;
          (entry as { id: string }).id = String(inserted[0]!.id);
        }

        for (const [, account] of balances) {
          await tx`
          UPDATE ledger.accounts
             SET balance = ${formatAmount(account.balance)}::numeric
           WHERE id = ${account.id}
        `;
        }

        await tx`
        UPDATE ledger.chain_tip
           SET hash = ${hash}, seq = ${seq}, updated_at = now()
         WHERE id = true
      `;

        return {
          id: txId,
          idempotencyKey: request.idempotencyKey,
          module: request.module,
          reason: request.reason,
          meta: request.meta ?? {},
          postedAt,
          hash,
          previousHash,
          entries: postedEntries,
        } satisfies LedgerTx;
      },
      {
        // READ COMMITTED, deliberately — see the chain-tip lock above.
        //
        // The `FOR UPDATE` on the singleton tip row is taken before this
        // transaction reads any balance it will write, so no two posts can ever
        // interleave: they queue. That is a stronger guarantee than SERIALIZABLE
        // would give us here, and it does not abort.
        //
        // Under SERIALIZABLE the same lock produced a retry storm — 50
        // concurrent posts aborted each other faster than the retry budget
        // could absorb. Queuing is both correct and predictable.
        //
        // The database CHECK constraints remain the final backstop either way.
        isolation: 'read committed',
        maxAttempts: 10,
      },
    );
  }

  async balance(ref: AccountRef): Promise<Balance> {
    const rows = await this.sql<Array<{ id: string; balance: string }>>`
      SELECT id, balance FROM ledger.accounts
       WHERE owner_type = ${ref.ownerType}::ledger.owner_type
         AND owner_id   = ${ref.ownerId}
         AND asset_id   = ${ref.assetId}
         AND kind       = ${ref.kind}::ledger.account_kind
    `;

    const row = rows[0];
    // An account that has never been touched holds zero. Reading a balance must
    // never have the side effect of creating a row.
    return { account: ref, accountId: row?.id ?? '', amount: row ? parseAmount(row.balance) : 0n };
  }

  async balances(ownerType: AccountRef['ownerType'], ownerId: string): Promise<Balance[]> {
    const rows = await this.sql<
      Array<{ id: string; owner_type: string; owner_id: string; asset_id: string; kind: string; balance: string }>
    >`
      SELECT id, owner_type, owner_id, asset_id, kind, balance
        FROM ledger.accounts
       WHERE owner_type = ${ownerType}::ledger.owner_type AND owner_id = ${ownerId}
       ORDER BY asset_id, kind
    `;

    return rows.map((r) => ({
      account: {
        ownerType: r.owner_type as AccountRef['ownerType'],
        ownerId: r.owner_id,
        assetId: r.asset_id,
        kind: r.kind as AccountRef['kind'],
      },
      accountId: r.id,
      amount: parseAmount(r.balance),
    }));
  }

  async getTx(txId: string): Promise<LedgerTx | null> {
    const rows = await this.sql<TxRow[]>`SELECT * FROM ledger.ledger_tx WHERE id = ${txId}`;
    return rows[0] ? this.hydrate(this.sql, rows[0]) : null;
  }

  async getTxByKey(idempotencyKey: string): Promise<LedgerTx | null> {
    const rows = await this.sql<TxRow[]>`SELECT * FROM ledger.ledger_tx WHERE idempotency_key = ${idempotencyKey}`;
    return rows[0] ? this.hydrate(this.sql, rows[0]) : null;
  }

  /** Every transaction in commit order — the replay source (§4.2). */
  async journal(limit = 10_000, afterSeq = 0n): Promise<LedgerTx[]> {
    const rows = await this.sql<TxRow[]>`
      SELECT * FROM ledger.ledger_tx WHERE seq > ${String(afterSeq)} ORDER BY seq ASC LIMIT ${limit}
    `;
    return Promise.all(rows.map((row) => this.hydrate(this.sql, row)));
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async upsertAccount(tx: Sql, ref: AccountRef): Promise<{ id: string; balance: bigint }> {
    // ON CONFLICT DO UPDATE (rather than DO NOTHING) so RETURNING always yields
    // a row, and so the row is locked for this transaction either way.
    const rows = await tx<Array<{ id: string; balance: string }>>`
      INSERT INTO ledger.accounts (owner_type, owner_id, asset_id, kind)
      VALUES (
        ${ref.ownerType}::ledger.owner_type, ${ref.ownerId},
        ${ref.assetId}, ${ref.kind}::ledger.account_kind
      )
      ON CONFLICT (owner_type, owner_id, asset_id, kind)
      DO UPDATE SET owner_id = EXCLUDED.owner_id
      RETURNING id, balance
    `;

    const row = rows[0]!;
    return { id: row.id, balance: parseAmount(row.balance) };
  }

  private async loadTxByKey(tx: Sql, key: string): Promise<LedgerTx | null> {
    const rows = await tx<TxRow[]>`SELECT * FROM ledger.ledger_tx WHERE idempotency_key = ${key}`;
    return rows[0] ? this.hydrate(tx, rows[0]) : null;
  }

  private async hydrate(sql: Sql, row: TxRow): Promise<LedgerTx> {
    const entries = await sql<EntryRow[]>`
      SELECT id, tx_id, account_id, asset_id, direction, amount, balance_after
        FROM ledger.ledger_entries WHERE tx_id = ${row.id} ORDER BY id ASC
    `;

    return {
      id: row.id,
      idempotencyKey: row.idempotency_key,
      module: row.module,
      reason: row.reason,
      meta: row.meta ?? {},
      postedAt: row.posted_at,
      hash: row.hash,
      previousHash: row.previous_hash,
      entries: entries.map((e) => ({
        id: String(e.id),
        txId: e.tx_id,
        accountId: e.account_id,
        assetId: e.asset_id,
        direction: e.direction,
        amount: parseAmount(e.amount),
        balanceAfter: parseAmount(e.balance_after),
      })),
    };
  }
}

interface TxRow {
  id: string;
  seq: string;
  idempotency_key: string;
  module: string;
  reason: string;
  meta: Record<string, unknown> | null;
  posted_at: Date;
  hash: string;
  previous_hash: string | null;
}

interface EntryRow {
  id: string;
  tx_id: string;
  account_id: string;
  asset_id: string;
  direction: 'debit' | 'credit';
  amount: string;
  balance_after: string;
}

/**
 * Canonical transaction hash — byte-identical to the reference implementation's.
 * That equality is the point: the same transaction must hash the same in
 * TypeScript, in Postgres, and in any future Rust port.
 */
export function hashTx(
  tx: { id: string; module: string; reason: string; postedAt: Date; entries: readonly PostedEntry[] },
  previousHash: string | null,
): string {
  const canonical = JSON.stringify({
    id: tx.id,
    module: tx.module,
    reason: tx.reason,
    postedAt: tx.postedAt.toISOString(),
    entries: tx.entries.map((e) => ({
      accountId: e.accountId,
      assetId: e.assetId,
      direction: e.direction,
      amount: formatAmount(e.amount),
    })),
  });

  return createHash('sha256')
    .update(previousHash ?? '')
    .update(' ')
    .update(canonical)
    .digest('hex');
}
