import { sum, type Amount } from '../money.js';
import type { AccountRef, EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { accountKey } from '../client.js';
import { earnPoolReserve, earnStakeAccount, houseFees, userAvailable } from '../accounts.js';

/**
 * BANK RECIPES (§8.1).
 *
 * ⚠ SHARED-PACKAGE CHANGE — flagged deliberately.
 *
 * §15.2 normally wants a `packages/ledger-client` change as its own PR ahead of
 * the service that uses it. These five recipes arrived with svc-bank because
 * §8.1's "views + rails" has no rails without them: an internal transfer, an
 * earn deposit and withdrawal, funding a pool's yield reserve, and paying a
 * day's interest are five value movements no existing recipe expresses. They
 * are kept in their own file so the shared-package diff is reviewable — and
 * revertable — on its own.
 *
 * Native staking is NOT here: svc-token owns it via `stake` / `unstake` and
 * svc-bank does not duplicate it.
 *
 * Loans are not here either — and the claim this comment used to make, that they
 * "already existed" as `collateralLock` / `collateralRelease` / `liquidate`, was
 * wrong. Those three were unreachable stubs with no principal release, no debt
 * for a repayment to reduce and no liquidation ladder. §8.1's lending money paths
 * now live in `./loans.ts`, whose header sets out what each of them got wrong.
 */

const debit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'debit', amount });
const credit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'credit', amount });

function requirePositive(name: string, value: Amount): void {
  if (value <= 0n) throw new InvalidEntryError(`${name} must be positive`);
}

// ── Internal transfer (spaces) ───────────────────────────────────────────────

export interface BankTransferInput {
  /** Business identity of the movement — a schedule id, or a one-off transfer id. */
  transferId: string;
  /**
   * Which firing of `transferId` this is. A standing order is `transferId` +
   * occurrence index; a one-off transfer is occurrence 0.
   *
   * This is the whole idempotency story for the scheduler: the key is derived
   * from the schedule and the period, never from a clock reading or a UUID, so
   * two workers that both decide the same period is due produce the same key
   * and the ledger collapses them into one transfer.
   */
  occurrence: number;
  /** Source account. A space resolves to one of these; svc-bank owns the mapping. */
  from: AccountRef;
  to: AccountRef;
  amount: Amount;
  /** Machine-readable reason suffix, e.g. 'scheduled' or 'manual'. */
  kind: 'manual' | 'scheduled';
}

/**
 * Move value between two accounts inside the book.
 *
 * This recipe takes `AccountRef`s rather than user ids because a "space" is not
 * one shape of account: a user's primary space IS their `userAvailable`
 * account, and every named space is a `subaccount` available account. Resolving
 * that mapping is svc-bank's job (it owns the `spaces` table); asserting the
 * movement is well-formed is this recipe's.
 *
 * Cross-asset transfers are rejected outright rather than silently priced —
 * converting between assets is a trade, and a trade has an execution price this
 * function has no business inventing.
 */
export function bankTransfer(input: BankTransferInput): PostRequest {
  requirePositive('transfer amount', input.amount);

  if (input.from.assetId !== input.to.assetId) {
    throw new InvalidEntryError(
      `A transfer cannot change asset (${input.from.assetId} → ${input.to.assetId}); route it through a conversion instead`,
    );
  }
  if (accountKey(input.from) === accountKey(input.to)) {
    throw new InvalidEntryError('A transfer must have two different accounts');
  }
  if (input.from.kind !== 'available' || input.to.kind !== 'available') {
    // A transfer that could target `hold`/`escrow`/`stake` would be a way to
    // create a locked position without the lock's own recipe and its rules.
    throw new InvalidEntryError('Transfers move between available accounts only — locks have their own recipes');
  }
  if (!Number.isInteger(input.occurrence) || input.occurrence < 0) {
    throw new InvalidEntryError(`Occurrence must be a non-negative integer, got ${input.occurrence}`);
  }

  return {
    idempotencyKey: `bank.transfer:${input.transferId}:${input.occurrence}`,
    module: 'bank',
    reason: input.kind === 'scheduled' ? 'bank.transfer.scheduled' : 'bank.transfer.manual',
    meta: { transferId: input.transferId, occurrence: input.occurrence },
    entries: [credit(input.from, input.amount), debit(input.to, input.amount)],
  };
}

// ── Earn (§8.1) ──────────────────────────────────────────────────────────────

export interface EarnPositionInput {
  positionId: string;
  poolId: string;
  userId: string;
  assetId: string;
  amount: Amount;
}

/**
 * Open an earn position: value moves from the user's available balance into
 * their own `stake` account.
 *
 * It stays the user's the entire time — `stake` is an account kind the user
 * owns, and `assertPairedLocks` proves the value came from that same user's
 * available balance in the same transaction. A pool that took custody into a
 * house account would look identical to a user until the day it did not.
 */
export function earnDeposit(input: EarnPositionInput): PostRequest {
  requirePositive('earn deposit amount', input.amount);
  return {
    idempotencyKey: `bank.earn.deposit:${input.positionId}`,
    module: 'bank',
    reason: 'bank.earn.deposited',
    meta: { positionId: input.positionId, poolId: input.poolId },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(earnStakeAccount(input.userId, input.assetId, input.positionId), input.amount),
    ],
  };
}

/** Close an earn position — the principal returns to available. */
export function earnWithdraw(input: EarnPositionInput): PostRequest {
  requirePositive('earn withdrawal amount', input.amount);
  return {
    idempotencyKey: `bank.earn.withdraw:${input.positionId}`,
    module: 'bank',
    reason: 'bank.earn.withdrawn',
    meta: { positionId: input.positionId, poolId: input.poolId },
    entries: [
      credit(earnStakeAccount(input.userId, input.assetId, input.positionId), input.amount),
      debit(userAvailable(input.userId, input.assetId), input.amount),
    ],
  };
}

export interface EarnPoolFundInput {
  poolId: string;
  /** Identifies this funding event — a treasury transfer reference, a window id. */
  fundingId: string;
  assetId: string;
  amount: Amount;
  /** Defaults to the bank's own fee revenue. */
  from?: AccountRef;
}

/**
 * Put yield into a pool's reserve before it can be paid out.
 *
 * Interest is not minted. `earnInterest` debits users out of this reserve, so
 * an under-funded pool fails to accrue rather than paying out of thin air —
 * which is the correct failure, loudly, on the day the yield stops being real.
 */
export function earnPoolFund(input: EarnPoolFundInput): PostRequest {
  requirePositive('pool funding amount', input.amount);
  return {
    idempotencyKey: `bank.earn.fund:${input.poolId}:${input.fundingId}`,
    module: 'bank',
    reason: 'bank.earn.pool.funded',
    meta: { poolId: input.poolId, fundingId: input.fundingId },
    entries: [
      credit(input.from ?? houseFees('bank', input.assetId), input.amount),
      debit(earnPoolReserve(input.poolId, input.assetId), input.amount),
    ],
  };
}

export interface EarnInterestInput {
  poolId: string;
  /** The accrual day, `YYYY-MM-DD`. One accrual per pool per day, forever. */
  date: string;
  assetId: string;
  /** One entry per user. Zero-amount payouts must be filtered out by the caller. */
  payouts: ReadonlyArray<{ userId: string; amount: Amount }>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One day's interest for one pool, as a single atomic transaction.
 *
 * The key is `bank.interest:<poolId>:<date>` — a business key, per §5 of the
 * agent protocol. A scheduler that fires twice at midnight produces the same
 * key twice and the second post returns the first one's transaction.
 *
 * One transaction for the whole pool rather than one per user is a deliberate
 * trade: it makes "did this pool accrue on the 3rd" a single unambiguous fact,
 * at the cost of an entry list that grows with the pool. svc-token splits its
 * yield distribution per recipient for the opposite reason (resumability across
 * thousands of stakers); here the day is the unit of truth, and a partially
 * accrued day would be worse than a retried one.
 *
 * §13 socket: when a pool outgrows one transaction, the key gains a deterministic
 * chunk index — `bank.interest:<poolId>:<date>:<chunk>` — which keeps the same
 * property per chunk. The shape is chosen so that change is additive.
 */
export function earnInterest(input: EarnInterestInput): PostRequest {
  if (!ISO_DATE.test(input.date)) {
    throw new InvalidEntryError(`Accrual date must be YYYY-MM-DD, got "${input.date}"`);
  }
  if (input.payouts.length === 0) {
    throw new InvalidEntryError('An interest accrual with no recipients is not a transaction');
  }
  for (const payout of input.payouts) requirePositive(`interest for ${payout.userId}`, payout.amount);

  const total = sum(input.payouts.map((p) => p.amount));

  return {
    idempotencyKey: `bank.interest:${input.poolId}:${input.date}`,
    module: 'bank',
    reason: 'bank.earn.interest',
    meta: { poolId: input.poolId, date: input.date, recipients: input.payouts.length },
    entries: [
      credit(earnPoolReserve(input.poolId, input.assetId), total),
      ...input.payouts.map((p) => debit(userAvailable(p.userId, input.assetId), p.amount)),
    ],
  };
}
