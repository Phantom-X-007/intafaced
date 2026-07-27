import type { Sql } from 'postgres';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { hashTx } from './postgres-ledger.js';

/**
 * RECONCILIATION (§4.2).
 *
 *   "Reconciliation job: snapshots vs. entry replay must match to 18 decimals;
 *    mismatch = page the operator, freeze the module that diverged."
 *
 * Three independent checks, each capable of catching a class of failure the
 * others cannot:
 *
 *   · `reconcileBalances` — the cached `accounts.balance` against a full replay
 *     of `ledger_entries`. Catches a bug in the posting path.
 *   · `verifyChain` — every hash recomputed from its predecessor. Catches
 *     tampering, including by someone with database access.
 *   · `totalsByAsset` — every asset must net to zero across all accounts.
 *     Catches value being created or destroyed by any means at all.
 */

export interface Drift {
  readonly accountId: string;
  readonly assetId: string;
  readonly cached: string;
  readonly replayed: string;
  readonly difference: string;
}

export type ReconcileResult = { ok: true; accountsChecked: number } | { ok: false; drift: Drift[]; accountsChecked: number };

export async function reconcileBalances(sql: Sql): Promise<ReconcileResult> {
  // One pass, in the database: replaying millions of entries in Node would be
  // both slower and a memory problem.
  const rows = await sql<Array<{ account_id: string; asset_id: string; cached: string; replayed: string }>>`
    SELECT a.id                                        AS account_id,
           a.asset_id                                  AS asset_id,
           a.balance                                   AS cached,
           COALESCE(SUM(
             CASE WHEN e.direction = 'debit' THEN e.amount ELSE -e.amount END
           ), 0)                                       AS replayed
      FROM ledger.accounts a
      LEFT JOIN ledger.ledger_entries e ON e.account_id = a.id
     GROUP BY a.id, a.asset_id, a.balance
  `;

  const drift: Drift[] = [];
  for (const row of rows) {
    const cached = parseAmount(row.cached);
    const replayed = parseAmount(row.replayed);
    if (cached !== replayed) {
      drift.push({
        accountId: row.account_id,
        assetId: row.asset_id,
        cached: formatAmount(cached),
        replayed: formatAmount(replayed),
        difference: formatAmount(cached - replayed),
      });
    }
  }

  return drift.length === 0 ? { ok: true, accountsChecked: rows.length } : { ok: false, drift, accountsChecked: rows.length };
}

export type ChainResult = { ok: true; length: number } | { ok: false; brokenAt: string; length: number };

export async function verifyChain(sql: Sql, batchSize = 1000): Promise<ChainResult> {
  let previous: string | null = null;
  let afterSeq = '0';
  let length = 0;

  for (;;) {
    const txs = await sql<
      Array<{ id: string; seq: string; module: string; reason: string; posted_at: Date; hash: string; previous_hash: string | null }>
    >`
      SELECT id, seq, module, reason, posted_at, hash, previous_hash
        FROM ledger.ledger_tx WHERE seq > ${afterSeq} ORDER BY seq ASC LIMIT ${batchSize}
    `;
    if (txs.length === 0) break;

    for (const tx of txs) {
      const entries = await sql<
        Array<{ account_id: string; asset_id: string; direction: 'debit' | 'credit'; amount: string; balance_after: string }>
      >`
        SELECT account_id, asset_id, direction, amount, balance_after
          FROM ledger.ledger_entries WHERE tx_id = ${tx.id} ORDER BY id ASC
      `;

      const expected = hashTx(
        {
          id: tx.id,
          module: tx.module,
          reason: tx.reason,
          postedAt: tx.posted_at,
          entries: entries.map((e) => ({
            id: '',
            txId: tx.id,
            accountId: e.account_id,
            assetId: e.asset_id,
            direction: e.direction,
            amount: parseAmount(e.amount),
            balanceAfter: parseAmount(e.balance_after),
          })),
        },
        previous,
      );

      if (tx.previous_hash !== previous || tx.hash !== expected) {
        return { ok: false, brokenAt: tx.id, length };
      }

      previous = tx.hash;
      afterSeq = tx.seq;
      length++;
    }
  }

  return { ok: true, length };
}

/** Every asset must sum to exactly zero across every account. */
export async function totalsByAsset(sql: Sql): Promise<Record<string, string>> {
  const rows = await sql<Array<{ asset_id: string; total: string }>>`
    SELECT asset_id, COALESCE(SUM(balance), 0) AS total FROM ledger.accounts GROUP BY asset_id
  `;
  return Object.fromEntries(rows.map((r) => [r.asset_id, formatAmount(parseAmount(r.total))]));
}

/** Hourly anchor so a future replay does not have to start from genesis. */
export async function writeSnapshots(sql: Sql, asOf: Date = new Date()): Promise<number> {
  const result = await sql`
    INSERT INTO ledger.balance_snapshots (account_id, as_of, balance)
    SELECT id, ${asOf}, balance FROM ledger.accounts
  `;
  return result.count;
}

export interface ReconciliationReport {
  readonly ok: boolean;
  readonly ranAt: Date;
  readonly balances: ReconcileResult;
  readonly chain: ChainResult;
  readonly totals: Record<string, string>;
  /** Assets that do not net to zero — the most serious failure possible. */
  readonly unbalancedAssets: string[];
}

/**
 * The full run. Scheduled hourly; also runnable on demand from apps/admin when
 * an operator wants to prove the book is intact before, say, a treasury move.
 */
export async function runReconciliation(sql: Sql): Promise<ReconciliationReport> {
  const [balances, chain, totals] = await Promise.all([reconcileBalances(sql), verifyChain(sql), totalsByAsset(sql)]);
  const unbalancedAssets = Object.entries(totals)
    .filter(([, total]) => total !== '0')
    .map(([asset]) => asset);

  return {
    ok: balances.ok && chain.ok && unbalancedAssets.length === 0,
    ranAt: new Date(),
    balances,
    chain,
    totals,
    unbalancedAssets,
  };
}
