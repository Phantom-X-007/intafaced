import { createHash } from 'node:crypto';
import { formatAmount, type Amount } from './money.js';
import { accountKey, assertValidPost, signedDelta, type LedgerClient } from './client.js';
import {
  InsufficientFundsError,
  LedgerError,
  type Account,
  type AccountRef,
  type Balance,
  type LedgerTx,
  type PostRequest,
  type PostedEntry,
} from './types.js';

/**
 * Reference ledger implementation, in memory.
 *
 * This is not a toy. It is the executable specification of §4.2 that
 * svc-ledger's Postgres implementation must match entry for entry:
 *
 *   1. Sum-to-zero per asset, checked before anything is written.
 *   2. `available` never negative (except `treasury`, the external boundary).
 *   3. Locks funded from the owner's own available balance.
 *   4. Idempotency: the same key returns the original transaction, never a second one.
 *   5. Hash chain: hash = SHA-256(previousHash ‖ canonical(tx)).
 *
 * The invariant suite in ledger.test.ts runs against this. When svc-ledger
 * lands, the same suite runs against both — that is the Phase 1 exit gate.
 */
export class MemoryLedger implements LedgerClient {
  private readonly accounts = new Map<string, Account>();
  private readonly balancesByAccountId = new Map<string, Amount>();
  private readonly txs = new Map<string, LedgerTx>();
  private readonly txByKey = new Map<string, string>();
  private readonly txOrder: string[] = [];
  private tip: string | null = null;

  /**
   * Owner types permitted to hold a negative `available` balance.
   *
   * `treasury` is the boundary with the outside world: when a user deposits,
   * value enters the book from here, so this account runs negative by exactly
   * the platform's total custody obligation. Every other owner — users,
   * sub-accounts, modules, house — is hard non-negative.
   */
  private static readonly NEGATIVE_ALLOWED = new Set(['treasury']);

  async post(request: PostRequest): Promise<LedgerTx> {
    // Idempotency first: a retry must never re-run the invariant checks against
    // a book that already contains its effects.
    const existingId = this.txByKey.get(request.idempotencyKey);
    if (existingId) {
      const existing = this.txs.get(existingId);
      if (!existing) throw new LedgerError('Idempotency index corrupted', 'ledger.corrupt_index');
      return existing;
    }

    assertValidPost(request);

    // Stage every mutation, validate, then commit — nothing half-applied.
    const staged = new Map<string, Amount>();
    const postedEntries: PostedEntry[] = [];
    const txId = crypto.randomUUID();

    for (const entry of request.entries) {
      const account = this.ensureAccount(entry.account);
      const current = staged.get(account.id) ?? this.balancesByAccountId.get(account.id) ?? 0n;
      const next = current + signedDelta(entry);

      if (next < 0n && !this.canGoNegative(entry.account)) {
        throw new InsufficientFundsError(account.id, entry.account.assetId, formatAmount(entry.amount), formatAmount(current));
      }

      staged.set(account.id, next);
      postedEntries.push({
        id: crypto.randomUUID(),
        txId,
        accountId: account.id,
        assetId: entry.account.assetId,
        direction: entry.direction,
        amount: entry.amount,
        balanceAfter: next,
      });
    }

    const postedAt = new Date();
    const previousHash = this.tip;
    const tx: LedgerTx = {
      id: txId,
      idempotencyKey: request.idempotencyKey,
      module: request.module,
      reason: request.reason,
      meta: request.meta ?? {},
      postedAt,
      previousHash,
      hash: hashTx({ id: txId, module: request.module, reason: request.reason, postedAt, entries: postedEntries }, previousHash),
      entries: postedEntries,
    };

    // Commit.
    for (const [accountId, balance] of staged) this.balancesByAccountId.set(accountId, balance);
    this.txs.set(tx.id, tx);
    this.txByKey.set(tx.idempotencyKey, tx.id);
    this.txOrder.push(tx.id);
    this.tip = tx.hash;

    return tx;
  }

  async balance(ref: AccountRef): Promise<Balance> {
    const account = this.ensureAccount(ref);
    return { account: ref, accountId: account.id, amount: this.balancesByAccountId.get(account.id) ?? 0n };
  }

  async balances(ownerType: AccountRef['ownerType'], ownerId: string): Promise<Balance[]> {
    const out: Balance[] = [];
    for (const account of this.accounts.values()) {
      if (account.ownerType !== ownerType || account.ownerId !== ownerId) continue;
      out.push({
        account,
        accountId: account.id,
        amount: this.balancesByAccountId.get(account.id) ?? 0n,
      });
    }
    return out;
  }

  async getTx(txId: string): Promise<LedgerTx | null> {
    return this.txs.get(txId) ?? null;
  }

  async getTxByKey(idempotencyKey: string): Promise<LedgerTx | null> {
    const id = this.txByKey.get(idempotencyKey);
    return id ? (this.txs.get(id) ?? null) : null;
  }

  // ── Reconciliation surface (§4.2) ──────────────────────────────────────────

  /** Every transaction in commit order — the replay source. */
  journal(): LedgerTx[] {
    return this.txOrder.map((id) => this.txs.get(id)!).filter(Boolean);
  }

  /**
   * Replay the journal from zero and compare to live balances.
   * Any mismatch is the condition that pages the operator and freezes a module.
   */
  reconcile(): { ok: true } | { ok: false; drift: Array<{ accountId: string; live: string; replayed: string }> } {
    const replayed = new Map<string, Amount>();
    for (const tx of this.journal()) {
      for (const entry of tx.entries) {
        const delta = entry.direction === 'debit' ? entry.amount : -entry.amount;
        replayed.set(entry.accountId, (replayed.get(entry.accountId) ?? 0n) + delta);
      }
    }

    const drift: Array<{ accountId: string; live: string; replayed: string }> = [];
    const ids = new Set([...this.balancesByAccountId.keys(), ...replayed.keys()]);
    for (const id of ids) {
      const live = this.balancesByAccountId.get(id) ?? 0n;
      const rep = replayed.get(id) ?? 0n;
      if (live !== rep) drift.push({ accountId: id, live: formatAmount(live), replayed: formatAmount(rep) });
    }

    return drift.length === 0 ? { ok: true } : { ok: false, drift };
  }

  /** Verify the hash chain end to end — tamper evidence. */
  verifyChain(): { ok: true } | { ok: false; brokenAt: string } {
    let previous: string | null = null;
    for (const tx of this.journal()) {
      const expected = hashTx({ id: tx.id, module: tx.module, reason: tx.reason, postedAt: tx.postedAt, entries: tx.entries }, previous);
      if (tx.previousHash !== previous || tx.hash !== expected) return { ok: false, brokenAt: tx.id };
      previous = tx.hash;
    }
    return { ok: true };
  }

  /**
   * The books must close: every asset nets to zero across all accounts.
   * A non-zero total means value was created or destroyed.
   */
  totalsByAsset(): Record<string, string> {
    const totals = new Map<string, Amount>();
    for (const account of this.accounts.values()) {
      const balance = this.balancesByAccountId.get(account.id) ?? 0n;
      totals.set(account.assetId, (totals.get(account.assetId) ?? 0n) + balance);
    }
    return Object.fromEntries([...totals].map(([asset, total]) => [asset, formatAmount(total)]));
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private canGoNegative(ref: AccountRef): boolean {
    return MemoryLedger.NEGATIVE_ALLOWED.has(ref.ownerType);
  }

  private ensureAccount(ref: AccountRef): Account {
    const key = accountKey(ref);
    const existing = this.accounts.get(key);
    if (existing) return existing;

    const account: Account = { ...ref, id: crypto.randomUUID(), createdAt: new Date() };
    this.accounts.set(key, account);
    this.balancesByAccountId.set(account.id, 0n);
    return account;
  }
}

interface HashableTx {
  id: string;
  module: string;
  reason: string;
  postedAt: Date;
  entries: readonly PostedEntry[];
}

/**
 * Canonical transaction hash. Field order is fixed and amounts are canonical
 * decimal strings, so the same transaction hashes identically in TypeScript,
 * in Postgres, and in any future Rust port.
 */
export function hashTx(tx: HashableTx, previousHash: string | null): string {
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
    .update(' ')
    .update(canonical)
    .digest('hex');
}
