import { mulBps, sub, type Amount } from '../money.js';
import type { AccountRef, EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { houseFees, raiseContributionAccount, raiseSupplyAccount, userAvailable, vestingEscrow } from '../accounts.js';

/**
 * LAUNCHPAD RECIPES (§8.4).
 *
 * ⚠ SHARED-PACKAGE CHANGE — flagged deliberately, same as `./bank.ts`.
 *
 * §15.2 normally wants a `packages/ledger-client` change as its own PR ahead of
 * the service that uses it. These six arrived with svc-launch because §8.4's
 * "presale/fair-launch configs, vesting schedules enforced by … platform
 * escrow" describes six value movements no existing recipe expresses, and a
 * raise that cannot escrow is not a raise. They are kept in their own file so
 * the shared-package diff is reviewable — and revertable — on its own.
 *
 * ── The shape of a raise, in the books ──────────────────────────────────────
 *
 *   supplyLock       issuer available → issuer escrow      (before it opens)
 *   contribute       buyer available  → buyer escrow       (one per top-up)
 *   settleContributor  both escrows   → buyer, issuer, house   (on success)
 *   refund           buyer escrow     → buyer available     (on failure)
 *   supplyReturn     issuer escrow    → issuer available    (unsold / cancelled)
 *   vestingRelease   platform escrow  → beneficiary available
 *
 * Every one of them is a movement between accounts that already exist in §4.2's
 * balance graph. svc-launch stores raise terms, tiers and schedules; it stores
 * no amount that anyone can spend, and it holds no balance of its own
 * (Doctrine §0.6).
 */

const debit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'debit', amount });
const credit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'credit', amount });

function requirePositive(name: string, value: Amount): void {
  if (value <= 0n) throw new InvalidEntryError(`${name} must be positive`);
}

function requireNonNegative(name: string, value: Amount): void {
  if (value < 0n) throw new InvalidEntryError(`${name} must not be negative`);
}

/**
 * A raise priced in the asset it is selling is not a raise, it is a shuffle.
 *
 * Checked here rather than only in the service because the entries would still
 * sum to zero: the payment leg and the sale leg would net against each other on
 * one asset and the transaction would post, describing a movement nobody could
 * later read. A recipe that can express an incoherent business fact is a recipe
 * that will eventually be asked to.
 */
function requireDistinctAssets(saleAssetId: string, paymentAssetId: string): void {
  if (saleAssetId === paymentAssetId) {
    throw new InvalidEntryError(`A raise cannot sell ${saleAssetId} priced in ${paymentAssetId} — the two must differ`);
  }
}

// ── Supply ───────────────────────────────────────────────────────────────────

export interface RaiseSupplyInput {
  raiseId: string;
  issuerId: string;
  saleAssetId: string;
  amount: Amount;
}

/**
 * Lock the sale supply. The raise may not open until this has posted.
 *
 * Keyed on the raise alone: supply is locked once, and a retried "open" must
 * find the original transaction rather than double-locking an issuer who then
 * cannot cover a second raise.
 */
export function raiseSupplyLock(input: RaiseSupplyInput): PostRequest {
  requirePositive('sale supply', input.amount);
  return {
    idempotencyKey: `launch.supply.lock:${input.raiseId}`,
    module: 'launch',
    reason: 'launch.supply.locked',
    meta: { raiseId: input.raiseId },
    entries: [
      credit(userAvailable(input.issuerId, input.saleAssetId), input.amount),
      debit(raiseSupplyAccount(input.issuerId, input.saleAssetId, input.raiseId), input.amount),
    ],
  };
}

/**
 * Unsold or cancelled supply goes home.
 *
 * One key per raise, because unsold supply is returned exactly once — at the
 * end of settlement, or when the raise is cancelled or fails. A raise cannot do
 * both, so the two callers cannot collide.
 */
export function raiseSupplyReturn(input: RaiseSupplyInput & { reason?: 'unsold' | 'failed' | 'cancelled' }): PostRequest {
  requirePositive('returned supply', input.amount);
  return {
    idempotencyKey: `launch.supply.return:${input.raiseId}`,
    module: 'launch',
    reason: 'launch.supply.returned',
    meta: { raiseId: input.raiseId, outcome: input.reason ?? 'unsold' },
    entries: [
      credit(raiseSupplyAccount(input.issuerId, input.saleAssetId, input.raiseId), input.amount),
      debit(userAvailable(input.issuerId, input.saleAssetId), input.amount),
    ],
  };
}

// ── Contribution ─────────────────────────────────────────────────────────────

export interface RaiseContributeInput {
  raiseId: string;
  userId: string;
  paymentAssetId: string;
  amount: Amount;
  /**
   * Which top-up this is for this contributor, from 0.
   *
   * A contributor may commit more than once, and every commitment lands in the
   * same escrow pot — so the pot alone cannot dedupe them. The sequence comes
   * from the contributor's own row in svc-launch, incremented under a row lock,
   * which makes the key a business fact rather than a clock reading: two workers
   * that both process the same commitment produce the same key and the ledger
   * collapses them into one.
   */
  sequence: number;
}

export function raiseContribute(input: RaiseContributeInput): PostRequest {
  requirePositive('contribution', input.amount);
  if (!Number.isInteger(input.sequence) || input.sequence < 0) {
    throw new InvalidEntryError(`Contribution sequence must be a non-negative integer, got ${input.sequence}`);
  }

  return {
    idempotencyKey: `launch.contribute:${input.raiseId}:${input.userId}:${input.sequence}`,
    module: 'launch',
    reason: 'launch.contributed',
    meta: { raiseId: input.raiseId, sequence: input.sequence },
    entries: [
      credit(userAvailable(input.userId, input.paymentAssetId), input.amount),
      debit(raiseContributionAccount(input.userId, input.paymentAssetId, input.raiseId), input.amount),
    ],
  };
}

export interface RaiseRefundInput {
  raiseId: string;
  userId: string;
  paymentAssetId: string;
  amount: Amount;
}

/**
 * The raise did not clear its soft cap, or was cancelled. Everything committed
 * comes back, untouched — no fee is taken on a raise that did not happen.
 */
export function raiseRefund(input: RaiseRefundInput): PostRequest {
  requirePositive('refund', input.amount);
  return {
    idempotencyKey: `launch.refund:${input.raiseId}:${input.userId}`,
    module: 'launch',
    reason: 'launch.refunded',
    meta: { raiseId: input.raiseId },
    entries: [
      credit(raiseContributionAccount(input.userId, input.paymentAssetId, input.raiseId), input.amount),
      debit(userAvailable(input.userId, input.paymentAssetId), input.amount),
    ],
  };
}

// ── Settlement ───────────────────────────────────────────────────────────────

export interface RaiseSettleInput {
  raiseId: string;
  issuerId: string;
  userId: string;
  paymentAssetId: string;
  /** Everything this contributor escrowed. Leaves the escrow in full. */
  contributed: Amount;
  /** The part of it that bought nothing — oversubscription, or price dust. */
  refund: Amount;
  /** House commission on what was actually spent. */
  feeBps: number;
  saleAssetId: string;
  /** What the contributor bought. Leaves the issuer's supply escrow. */
  saleAmount: Amount;
  /**
   * When set, the purchased tokens land in platform vesting escrow instead of
   * the contributor's available balance, and are released by `vestingRelease`.
   */
  vestingScheduleId?: string;
}

/**
 * ONE contributor's settlement, as a single atomic transaction.
 *
 * Per contributor rather than one transaction for the whole raise, and that is
 * the opposite of `earnInterest`'s choice for a reason: a raise can have far
 * more participants than a pool has stakers, and the unit of truth here is "did
 * *this person* get their allocation", not "did the raise settle on this day".
 * Per-contributor keys also make settlement resumable — a raise that fails
 * halfway through resumes at the contributor it stopped on, and every one
 * already settled is a no-op.
 *
 * Both escrows drain in the same transaction as the payout, so there is no
 * instant at which the contributor's money has left escrow but their tokens
 * have not arrived.
 */
export function raiseSettleContributor(input: RaiseSettleInput): PostRequest {
  requireDistinctAssets(input.saleAssetId, input.paymentAssetId);
  requirePositive('contributed amount', input.contributed);
  requireNonNegative('refund', input.refund);
  requirePositive('allocation', input.saleAmount);

  if (input.refund > input.contributed) {
    throw new InvalidEntryError('A settlement cannot refund more than was contributed');
  }

  const spent = sub(input.contributed, input.refund);
  if (spent <= 0n) {
    // Nothing was bought. That is a refund, and `raiseRefund` is the recipe that
    // says so — settling a zero purchase would post an allocation the books
    // could not explain.
    throw new InvalidEntryError('A settlement that spends nothing is a refund — use raiseRefund');
  }

  if (input.feeBps < 0 || input.feeBps >= 10_000) {
    throw new InvalidEntryError(`Launch fee must be between 0 and 9999 bps, got ${input.feeBps}`);
  }

  const fee = mulBps(spent, input.feeBps);
  const proceeds = sub(spent, fee);
  requirePositive('issuer proceeds', proceeds);

  const saleDestination = input.vestingScheduleId
    ? vestingEscrow(input.vestingScheduleId, input.saleAssetId)
    : userAvailable(input.userId, input.saleAssetId);

  return {
    idempotencyKey: `launch.settle:${input.raiseId}:${input.userId}`,
    module: 'launch',
    reason: 'launch.settled',
    meta: {
      raiseId: input.raiseId,
      feeBps: input.feeBps,
      vested: input.vestingScheduleId !== undefined,
      ...(input.vestingScheduleId ? { vestingScheduleId: input.vestingScheduleId } : {}),
    },
    entries: [
      credit(raiseContributionAccount(input.userId, input.paymentAssetId, input.raiseId), input.contributed),
      ...(input.refund > 0n ? [debit(userAvailable(input.userId, input.paymentAssetId), input.refund)] : []),
      debit(userAvailable(input.issuerId, input.paymentAssetId), proceeds),
      ...(fee > 0n ? [debit(houseFees('launch', input.paymentAssetId), fee)] : []),
      credit(raiseSupplyAccount(input.issuerId, input.saleAssetId, input.raiseId), input.saleAmount),
      debit(saleDestination, input.saleAmount),
    ],
  };
}

// ── Vesting ──────────────────────────────────────────────────────────────────

export interface VestingReleaseInput {
  scheduleId: string;
  beneficiaryId: string;
  assetId: string;
  amount: Amount;
  /**
   * Which release of this schedule this is, from 0.
   *
   * Not a date and not a clock reading. A schedule vests continuously, so "how
   * much is claimable" depends on the instant you ask — and two workers asking
   * microseconds apart would compute different amounts under the same date key,
   * which is the one thing an idempotency key must never allow. svc-launch
   * increments this under a row lock alongside `released`, so the key names a
   * release that has a single, already-decided amount.
   */
  sequence: number;
}

/** Vested tokens leave platform escrow for the beneficiary's own balance. */
export function vestingRelease(input: VestingReleaseInput): PostRequest {
  requirePositive('vesting release', input.amount);
  if (!Number.isInteger(input.sequence) || input.sequence < 0) {
    throw new InvalidEntryError(`Vesting release sequence must be a non-negative integer, got ${input.sequence}`);
  }

  return {
    idempotencyKey: `launch.vesting.release:${input.scheduleId}:${input.sequence}`,
    module: 'launch',
    reason: 'launch.vesting.released',
    meta: { scheduleId: input.scheduleId, sequence: input.sequence },
    entries: [
      credit(vestingEscrow(input.scheduleId, input.assetId), input.amount),
      debit(userAvailable(input.beneficiaryId, input.assetId), input.amount),
    ],
  };
}

/**
 * Fund a vesting schedule that is NOT the output of a raise settlement — a team
 * allocation, an advisor grant.
 *
 * The grantor's own available balance is the only source: platform escrow is
 * where a grant sits, never where it comes from. Without this, a team schedule
 * could only be created by a settlement that never happened, and the vesting
 * proofs §35 renders on every token page would be backed by nothing.
 */
export function vestingFund(input: {
  scheduleId: string;
  grantorId: string;
  assetId: string;
  amount: Amount;
}): PostRequest {
  requirePositive('vesting grant', input.amount);
  return {
    idempotencyKey: `launch.vesting.fund:${input.scheduleId}`,
    module: 'launch',
    reason: 'launch.vesting.funded',
    meta: { scheduleId: input.scheduleId },
    entries: [
      credit(userAvailable(input.grantorId, input.assetId), input.amount),
      debit(vestingEscrow(input.scheduleId, input.assetId), input.amount),
    ],
  };
}
