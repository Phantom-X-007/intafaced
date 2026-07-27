import { formatAmount, isNegative, isZero, sum, type Amount } from './money.js';
import {
  UnbalancedTransactionError,
  InvalidEntryError,
  type AccountRef,
  type Balance,
  type EntryInput,
  type LedgerTx,
  type PostRequest,
} from './types.js';

/**
 * THE LEDGER CLIENT.
 *
 * Doctrine §0.6: "No module holds its own balance. Every value movement
 * anywhere in the OS is a double-entry ledger transaction in the Core."
 *
 * §2: "Balance mutations go through packages/ledger-client only."
 *
 * Services depend on this interface, not on svc-ledger's implementation or —
 * ever — its tables. `custody-scan` (Doctrine 10) asserts that no Protocol
 * Plane service imports the write half of this module.
 */
export interface LedgerClient {
  /**
   * Post a double-entry transaction. Atomic, idempotent, and invariant-checked.
   * Re-posting the same `idempotencyKey` returns the original transaction.
   */
  post(request: PostRequest): Promise<LedgerTx>;

  /** Current balance of one account. Creates nothing. */
  balance(ref: AccountRef): Promise<Balance>;

  /** Every balance an owner holds, across assets and account kinds. */
  balances(ownerType: AccountRef['ownerType'], ownerId: string): Promise<Balance[]>;

  /** Fetch a posted transaction. */
  getTx(txId: string): Promise<LedgerTx | null>;

  /** Look a transaction up by its idempotency key. */
  getTxByKey(idempotencyKey: string): Promise<LedgerTx | null>;
}

/** Read-only view — what Protocol Plane services and dashboards may hold. */
export type ReadOnlyLedgerClient = Pick<LedgerClient, 'balance' | 'balances' | 'getTx' | 'getTxByKey'>;

export function readOnly(client: LedgerClient): ReadOnlyLedgerClient {
  return {
    balance: client.balance.bind(client),
    balances: client.balances.bind(client),
    getTx: client.getTx.bind(client),
    getTxByKey: client.getTxByKey.bind(client),
  };
}

// ── Invariants ───────────────────────────────────────────────────────────────

export function accountKey(ref: AccountRef): string {
  return `${ref.ownerType}:${ref.ownerId}:${ref.assetId}:${ref.kind}`;
}

/** Signed delta an entry applies to its account: debit adds, credit subtracts. */
export function signedDelta(entry: EntryInput): Amount {
  return entry.direction === 'debit' ? entry.amount : -entry.amount;
}

/**
 * INVARIANT 1 — every transaction sums to zero per asset.
 *
 * Enforced here so it holds identically in every implementation: the Postgres
 * one, the in-memory one, and any future port. A transaction that fails this
 * never reaches a database.
 */
export function assertBalanced(entries: readonly EntryInput[]): void {
  if (entries.length < 2) {
    throw new InvalidEntryError('A ledger transaction needs at least two entries — value moves between accounts, never from nowhere');
  }

  const perAsset = new Map<string, Amount>();

  for (const e of entries) {
    if (isNegative(e.amount)) {
      throw new InvalidEntryError(
        `Entry amounts are unsigned; direction carries the sign. Got ${formatAmount(e.amount)} on ${accountKey(e.account)}`,
      );
    }
    if (isZero(e.amount)) {
      throw new InvalidEntryError(`Zero-amount entry on ${accountKey(e.account)} — a movement of nothing is not a movement`);
    }
    perAsset.set(e.account.assetId, (perAsset.get(e.account.assetId) ?? 0n) + signedDelta(e));
  }

  const offenders: Record<string, string> = {};
  for (const [assetId, delta] of perAsset) {
    if (delta !== 0n) offenders[assetId] = formatAmount(delta);
  }

  if (Object.keys(offenders).length > 0) throw new UnbalancedTransactionError(offenders);
}

export const LOCK_KINDS: ReadonlySet<string> = new Set(['hold', 'escrow', 'stake', 'collateral']);

/**
 * INVARIANT 2 — locked funds are always funded from the owner's own available
 * balance, in the same transaction.
 *
 * hold / escrow / stake / collateral may only *increase* by what the same
 * owner's `available` account for that asset gives up. This is what makes
 * "locked" funds provably still the user's, and what stops a module inventing
 * collateral out of another account.
 *
 * Releasing a lock is unconstrained here — sum-to-zero already governs where
 * released value lands (back to available, to a counterparty, to house fees).
 */
export function assertPairedLocks(entries: readonly EntryInput[]): void {
  // Per (owner, asset): how much locked value was created, and how much
  // available balance the same owner gave up in this transaction.
  const lockGain = new Map<string, Amount>();
  const availableGiven = new Map<string, Amount>();

  for (const e of entries) {
    const key = `${e.account.ownerType}:${e.account.ownerId}:${e.account.assetId}`;
    const delta = signedDelta(e);

    if (LOCK_KINDS.has(e.account.kind)) {
      if (delta > 0n) lockGain.set(key, (lockGain.get(key) ?? 0n) + delta);
    } else if (delta < 0n) {
      availableGiven.set(key, (availableGiven.get(key) ?? 0n) - delta);
    }
  }

  for (const [key, gained] of lockGain) {
    const given = availableGiven.get(key) ?? 0n;
    if (given < gained) {
      throw new InvalidEntryError(
        `Unfunded lock for ${key}: ${formatAmount(gained)} moved into a locked account but only ` +
          `${formatAmount(given)} left the same owner's available balance — locks must be paired with an ` +
          `available counter-entry (§4.2)`,
      );
    }
  }
}

export function assertValidPost(request: PostRequest): void {
  if (!request.idempotencyKey || request.idempotencyKey.length < 8) {
    throw new InvalidEntryError('An idempotency key of at least 8 characters is required on every post');
  }
  assertBalanced(request.entries);
  assertPairedLocks(request.entries);
}

/** Total absolute value moved, per asset — used for metrics and fee reporting. */
export function volumeByAsset(entries: readonly EntryInput[]): Record<string, string> {
  const out: Record<string, Amount> = {};
  for (const e of entries) {
    if (e.direction !== 'debit') continue;
    out[e.account.assetId] = (out[e.account.assetId] ?? 0n) + e.amount;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, formatAmount(v)]));
}

export function totalDebits(entries: readonly EntryInput[]): Amount {
  return sum(entries.filter((e) => e.direction === 'debit').map((e) => e.amount));
}
