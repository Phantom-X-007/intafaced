import { describe, expect, it, beforeEach } from 'vitest';
import { formatAmount, parseAmount as amt } from '../money.js';
import {
  houseFees,
  raiseContributionAccount,
  raiseSupplyAccount,
  railBoundary,
  userAvailable,
  userEscrow,
  userHold,
  userStake,
  vestingEscrow,
} from '../accounts.js';
import { InsufficientFundsError, InvalidEntryError, type LedgerTx } from '../types.js';
import { recipes } from '../recipes/index.js';
import type { LedgerClient } from '../client.js';

/**
 * THE LEDGER CONFORMANCE SUITE.
 *
 * §4.4 exit criteria. Every implementation of `LedgerClient` runs this file
 * unmodified — the in-memory reference and svc-ledger's Postgres engine alike.
 * If the two disagree about anything in here, one of them is wrong, and the
 * suite says which behaviour is correct.
 *
 * Optional capabilities (journal, reconcile, verifyChain, totalsByAsset) are
 * skipped when a harness does not provide them, so a partial implementation can
 * still prove the parts it does support.
 */

export interface LedgerHarness {
  readonly ledger: LedgerClient;
  /** Return the book to empty between tests. */
  reset(): Promise<void>;
  /** Commit order. Enables the hash-chain and reconciliation sections. */
  journal?(): Promise<LedgerTx[]>;
  reconcile?(): Promise<{ ok: boolean }>;
  verifyChain?(): Promise<{ ok: boolean }>;
  totalsByAsset?(): Promise<Record<string, string>>;
  /** Called once when the suite finishes. */
  teardown?(): Promise<void>;
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
/** A third party — a raise needs an issuer as well as two contributors (§8.4). */
const USER_C = '33333333-3333-4333-8333-333333333333';

export function runLedgerConformance(name: string, createHarness: () => Promise<LedgerHarness>): void {
  describe(`ledger conformance — ${name}`, () => {
    let harness: LedgerHarness;
    let ledger: LedgerClient;

    beforeEach(async () => {
      harness ??= await createHarness();
      await harness.reset();
      ledger = harness.ledger;
    });

    const fund = (userId: string, assetId: string, amount: string) =>
      ledger.post(
        recipes.deposit({
          userId,
          assetId,
          amount: amt(amount),
          rail: 'test',
          railRef: `${userId}:${assetId}:${amount}`,
        }),
      );

    // `purpose` is required for `hold` (P0-3) — there is no such thing as "the"
    // hold balance any more, only the balance held for a named reason.
    const balanceOf = async (
      userId: string,
      assetId: string,
      kind: 'available' | 'hold' | 'escrow' | 'stake' = 'available',
      purpose = 'test',
    ) => {
      const ref =
        kind === 'available'
          ? userAvailable(userId, assetId)
          : kind === 'hold'
            ? userHold(userId, assetId, purpose)
            : kind === 'escrow'
              ? userEscrow(userId, assetId, purpose)
              : userStake(userId, assetId, purpose);
      return formatAmount((await ledger.balance(ref)).amount);
    };

    /**
     * Total held for a user in an asset, summed across purposes (P0-3).
     *
     * Part of the conformance contract: an implementation that ignores
     * `purpose` and keeps one hold row per (user, asset) still passes the
     * per-purpose reads, but fails here the moment two purposes coexist.
     */
    const heldTotal = async (userId: string, assetId: string) => {
      const all = await ledger.balances('user', userId);
      const total = all.filter((b) => b.account.kind === 'hold' && b.account.assetId === assetId).reduce((acc, b) => acc + b.amount, 0n);
      return formatAmount(total);
    };

    // ── INVARIANT 1 · sum to zero ─────────────────────────────────────────────

    describe('sum-to-zero per asset', () => {
      it('refuses an unbalanced transaction', async () => {
        await expect(
          ledger.post({
            idempotencyKey: 'unbalanced-test-1',
            module: 'test',
            reason: 'test',
            entries: [
              { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('100') },
              { account: railBoundary('test', 'USDT'), direction: 'credit', amount: amt('99') },
            ],
          }),
        ).rejects.toThrow();
      });

      it('refuses a single-entry transaction', async () => {
        await expect(
          ledger.post({
            idempotencyKey: 'single-entry-test',
            module: 'test',
            reason: 'test',
            entries: [{ account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('1') }],
          }),
        ).rejects.toThrow(InvalidEntryError);
      });

      it('refuses to net one asset against another', async () => {
        await expect(
          ledger.post({
            idempotencyKey: 'cross-asset-net-test',
            module: 'test',
            reason: 'test',
            entries: [
              { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('100') },
              { account: userAvailable(USER_B, 'BTC'), direction: 'credit', amount: amt('100') },
            ],
          }),
        ).rejects.toThrow();
      });
    });

    // ── INVARIANT 2 · available never negative ────────────────────────────────

    describe('available never goes negative', () => {
      it('refuses to overdraw', async () => {
        await fund(USER_A, 'USDT', '100');
        await expect(
          ledger.post(
            recipes.withdrawHold({
              userId: USER_A,
              assetId: 'USDT',
              amount: amt('100.000000000000000001'),
              rail: 'test',
              withdrawalId: 'overdraw-1',
            }),
          ),
        ).rejects.toThrow(InsufficientFundsError);
        expect(await balanceOf(USER_A, 'USDT')).toBe('100');
      });

      it('allows spending to exactly zero', async () => {
        await fund(USER_A, 'USDT', '100');
        await ledger.post(
          recipes.withdrawHold({ userId: USER_A, assetId: 'USDT', amount: amt('100'), rail: 'test', withdrawalId: 'exact-1' }),
        );
        expect(await balanceOf(USER_A, 'USDT')).toBe('0');
        expect(await heldTotal(USER_A, 'USDT')).toBe('100');
      });

      it('leaves the book untouched when a post is rejected', async () => {
        await fund(USER_A, 'USDT', '10');
        await expect(
          ledger.post(
            recipes.withdrawHold({ userId: USER_A, assetId: 'USDT', amount: amt('999'), rail: 'test', withdrawalId: 'reject-1' }),
          ),
        ).rejects.toThrow(InsufficientFundsError);
        expect(await balanceOf(USER_A, 'USDT')).toBe('10');
      });

      it('lets only the treasury boundary run negative', async () => {
        await fund(USER_A, 'USDT', '100');
        const boundary = await ledger.balance(railBoundary('test', 'USDT'));
        expect(formatAmount(boundary.amount)).toBe('-100');
      });
    });

    // ── INVARIANT 3 · locks are funded ────────────────────────────────────────

    describe('locks are funded from the owner’s own available balance', () => {
      it('refuses collateral conjured from elsewhere', async () => {
        await fund(USER_A, 'BTC', '1');
        await expect(
          ledger.post({
            idempotencyKey: 'unfunded-lock-test',
            module: 'test',
            reason: 'test',
            entries: [
              { account: houseFees('bank', 'BTC'), direction: 'credit', amount: amt('1') },
              { account: userHold(USER_A, 'BTC', 'order:unfunded'), direction: 'debit', amount: amt('1') },
            ],
          }),
        ).rejects.toThrow(InvalidEntryError);
      });
    });

    // ── INVARIANT 4 · idempotency ─────────────────────────────────────────────

    describe('idempotency', () => {
      it('returns the original transaction and does not double the money', async () => {
        const request = recipes.deposit({
          userId: USER_A,
          assetId: 'USDT',
          amount: amt('50'),
          rail: 'crypto-native',
          railRef: '0xidem',
        });

        const first = await ledger.post(request);
        const second = await ledger.post(request);

        expect(second.id).toBe(first.id);
        expect(await balanceOf(USER_A, 'USDT')).toBe('50');
      });

      it('survives a burst of concurrent retries of the same post', async () => {
        const request = recipes.deposit({
          userId: USER_A,
          assetId: 'USDT',
          amount: amt('50'),
          rail: 'crypto-native',
          railRef: '0xburst',
        });

        const results = await Promise.all(Array.from({ length: 25 }, () => ledger.post(request)));

        expect(new Set(results.map((r) => r.id)).size).toBe(1);
        expect(await balanceOf(USER_A, 'USDT')).toBe('50');
      });

      it('requires a meaningful idempotency key', async () => {
        await expect(
          ledger.post({
            idempotencyKey: 'short',
            module: 'test',
            reason: 'test',
            entries: [
              { account: userAvailable(USER_A, 'USDT'), direction: 'debit', amount: amt('1') },
              { account: railBoundary('test', 'USDT'), direction: 'credit', amount: amt('1') },
            ],
          }),
        ).rejects.toThrow(InvalidEntryError);
      });

      it('finds a posted transaction by its key', async () => {
        const tx = await fund(USER_A, 'USDT', '25');
        const found = await ledger.getTxByKey(tx.idempotencyKey);
        expect(found?.id).toBe(tx.id);
      });
    });

    // ── Money paths ───────────────────────────────────────────────────────────

    describe('recipes', () => {
      it('trade fill: six entries, fees to house, books closed', async () => {
        await fund(USER_A, 'USDT', '1000');
        await fund(USER_B, 'BTC', '2');
        await ledger.post(recipes.orderHold({ orderId: 'taker-1', userId: USER_A, assetId: 'USDT', amount: amt('900') }));
        await ledger.post(recipes.orderHold({ orderId: 'maker-1', userId: USER_B, assetId: 'BTC', amount: amt('1') }));

        const tx = await ledger.post(
          recipes.tradeFill({
            fillId: 'conformance-f1',
            makerId: USER_B,
            takerId: USER_A,
            makerOrderId: 'maker-1',
            takerOrderId: 'taker-1',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            qty: amt('1'),
            quoteAmount: amt('900'),
            takerSide: 'buy',
            makerFeeBps: 10,
            takerFeeBps: 20,
          }),
        );

        expect(tx.entries).toHaveLength(6);
        expect(await balanceOf(USER_B, 'USDT')).toBe('899.1');
        expect(await balanceOf(USER_A, 'BTC')).toBe('0.998');
        expect(formatAmount((await ledger.balance(houseFees('trade', 'USDT'))).amount)).toBe('0.9');
        expect(formatAmount((await ledger.balance(houseFees('trade', 'BTC'))).amount)).toBe('0.002');
        expect(await heldTotal(USER_A, 'USDT')).toBe('0');
        expect(await heldTotal(USER_B, 'BTC')).toBe('0');
      });

      it('p2p escrow: lock → release strands nothing', async () => {
        await fund(USER_A, 'USDT', '500');
        await ledger.post(recipes.escrowLock({ tradeId: 'c-t1', sellerId: USER_A, buyerId: USER_B, assetId: 'USDT', amount: amt('500') }));
        expect(await balanceOf(USER_A, 'USDT', 'escrow', 'trade:c-t1')).toBe('500');

        await ledger.post(
          recipes.escrowRelease({
            tradeId: 'c-t1',
            sellerId: USER_A,
            buyerId: USER_B,
            assetId: 'USDT',
            amount: amt('500'),
            feeBps: 20,
          }),
        );

        expect(await balanceOf(USER_A, 'USDT', 'escrow', 'trade:c-t1')).toBe('0');
        expect(await balanceOf(USER_B, 'USDT')).toBe('499');
        expect(formatAmount((await ledger.balance(houseFees('p2p', 'USDT'))).amount)).toBe('1');
      });

      it('withdrawal: hold → settle removes value only once', async () => {
        await fund(USER_A, 'BTC', '1');
        const w = { userId: USER_A, assetId: 'BTC', amount: amt('0.5'), rail: 'crypto-native', withdrawalId: 'c-wd-1' };

        await ledger.post(recipes.withdrawHold(w));
        await ledger.post(recipes.withdrawSettle(w));
        await ledger.post(recipes.withdrawSettle(w)); // retry

        expect(await balanceOf(USER_A, 'BTC')).toBe('0.5');
        expect(await heldTotal(USER_A, 'BTC')).toBe('0');
      });

      it('fee charge: the IFC discount branch charges less', async () => {
        await fund(USER_A, 'IFC', '1000');
        await ledger.post(
          recipes.feeCharge({
            chargeId: 'c-c1',
            userId: USER_A,
            module: 'trade',
            mode: 'token',
            tokenAssetId: 'IFC',
            grossTokenAmount: amt('100'),
            discountBps: 2500,
          }),
        );
        expect(await balanceOf(USER_A, 'IFC')).toBe('925');
        expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('75');
      });

      it('staking round-trips exactly', async () => {
        await fund(USER_A, 'IFC', '10000');
        await ledger.post(recipes.stake({ stakeId: 'c-s1', userId: USER_A, assetId: 'IFC', amount: amt('4000'), tier: 'm12' }));
        expect(await balanceOf(USER_A, 'IFC', 'stake', 'token:stake:c-s1')).toBe('4000');
        await ledger.post(recipes.unstake({ stakeId: 'c-s1', userId: USER_A, assetId: 'IFC', amount: amt('4000'), tier: 'm12' }));
        expect(await balanceOf(USER_A, 'IFC')).toBe('10000');
      });
    });

    // ── Launchpad (§8.4) ──────────────────────────────────────────────────────
    //
    // A raise is an ESCROWED SALE, and these are the expectations that make it
    // one rather than a promise: the issuer's supply leaves their spendable
    // balance before the raise may open, each contributor's payment escrows
    // under its own key, and settlement drains both escrows in the same
    // transaction as the payout — so there is no instant at which a
    // contributor's money has gone and their tokens have not arrived.

    describe('launchpad raises', () => {
      /** USER_C issues, USER_A and USER_B contribute. Sale IFC, priced in USDT. */
      const RAISE = 'c-raise-1';
      const supplyOf = () => balanceOf(USER_C, 'IFC', 'escrow', `launch:supply:${RAISE}`);
      const contributionOf = (userId: string) => balanceOf(userId, 'USDT', 'escrow', `launch:raise:${RAISE}`);

      const openRaise = async () => {
        await fund(USER_C, 'IFC', '1000');
        await ledger.post(
          recipes.raiseSupplyLock({ raiseId: RAISE, issuerId: USER_C, saleAssetId: 'IFC', amount: amt('1000') }),
        );
      };

      it('locks the sale supply out of the issuer’s spendable balance', async () => {
        await openRaise();
        expect(await balanceOf(USER_C, 'IFC')).toBe('0');
        expect(await supplyOf()).toBe('1000');
      });

      /**
       * An issuer cannot sell supply they do not hold. The lock is a real
       * movement out of `available`, so the ledger refuses it outright — the
       * raise never opens rather than opening undeliverable.
       */
      it('refuses to open a raise the issuer cannot cover', async () => {
        await fund(USER_C, 'IFC', '10');
        await expect(
          ledger.post(recipes.raiseSupplyLock({ raiseId: 'c-raise-broke', issuerId: USER_C, saleAssetId: 'IFC', amount: amt('1000') })),
        ).rejects.toThrow(InsufficientFundsError);
      });

      /**
       * THE COMMINGLING EXPECTATION (P0-3 / L3-4 applied to raises).
       *
       * Contributions escrow PER CONTRIBUTOR. An implementation that pooled
       * them into one raise account would pass every balance read below except
       * this one, and would let one contributor's refund be paid out of
       * another's stake.
       */
      it('escrows each contributor separately, and tops up in place', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '500');
        await fund(USER_B, 'USDT', '300');

        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('200'), sequence: 0 }),
        );
        // A second commitment from the same contributor lands in the same pot
        // under its own key — the pot cannot dedupe them, the sequence does.
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('300'), sequence: 1 }),
        );
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_B, paymentAssetId: 'USDT', amount: amt('300'), sequence: 0 }),
        );

        expect(await contributionOf(USER_A)).toBe('500');
        expect(await contributionOf(USER_B)).toBe('300');
        expect(await balanceOf(USER_A, 'USDT')).toBe('0');
      });

      it('replays a retried contribution without doubling it', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '500');
        const contribution = recipes.raiseContribute({
          raiseId: RAISE,
          userId: USER_A,
          paymentAssetId: 'USDT',
          amount: amt('200'),
          sequence: 0,
        });

        const first = await ledger.post(contribution);
        const second = await ledger.post(contribution);

        expect(second.id).toBe(first.id);
        expect(await contributionOf(USER_A)).toBe('200');
      });

      /**
       * Settlement, end to end: the oversubscribed remainder is refunded, the
       * house takes its commission off what was actually spent, the issuer gets
       * the rest, and the contributor gets their allocation — all atomically.
       */
      it('settles one contributor: refund, fee, proceeds and allocation in one transaction', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '500');
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('500'), sequence: 0 }),
        );

        await ledger.post(
          recipes.raiseSettleContributor({
            raiseId: RAISE,
            issuerId: USER_C,
            userId: USER_A,
            paymentAssetId: 'USDT',
            contributed: amt('500'),
            refund: amt('100'),
            feeBps: 200,
            saleAssetId: 'IFC',
            saleAmount: amt('400'),
          }),
        );

        // 400 spent · 2% fee = 8 to house · 392 to the issuer · 100 back.
        expect(await contributionOf(USER_A)).toBe('0');
        expect(await balanceOf(USER_A, 'USDT')).toBe('100');
        expect(await balanceOf(USER_A, 'IFC')).toBe('400');
        expect(await balanceOf(USER_C, 'USDT')).toBe('392');
        expect(formatAmount((await ledger.balance(houseFees('launch', 'USDT'))).amount)).toBe('8');
        expect(await supplyOf()).toBe('600');
      });

      it('returns unsold supply to the issuer and strands nothing', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '500');
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('500'), sequence: 0 }),
        );
        await ledger.post(
          recipes.raiseSettleContributor({
            raiseId: RAISE,
            issuerId: USER_C,
            userId: USER_A,
            paymentAssetId: 'USDT',
            contributed: amt('500'),
            refund: 0n,
            feeBps: 0,
            saleAssetId: 'IFC',
            saleAmount: amt('400'),
          }),
        );
        await ledger.post(
          recipes.raiseSupplyReturn({ raiseId: RAISE, issuerId: USER_C, saleAssetId: 'IFC', amount: amt('600'), reason: 'unsold' }),
        );

        expect(await supplyOf()).toBe('0');
        expect(await balanceOf(USER_C, 'IFC')).toBe('600');
      });

      /** A raise that did not clear returns everything, and takes no fee for it. */
      it('refunds a failed raise in full, with no fee taken', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '500');
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('500'), sequence: 0 }),
        );

        await ledger.post(recipes.raiseRefund({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('500') }));
        await ledger.post(
          recipes.raiseSupplyReturn({ raiseId: RAISE, issuerId: USER_C, saleAssetId: 'IFC', amount: amt('1000'), reason: 'failed' }),
        );

        expect(await balanceOf(USER_A, 'USDT')).toBe('500');
        expect(await contributionOf(USER_A)).toBe('0');
        expect(await balanceOf(USER_C, 'IFC')).toBe('1000');
        expect(formatAmount((await ledger.balance(houseFees('launch', 'USDT'))).amount)).toBe('0');
      });

      /**
       * One contributor's refund may not be paid out of another's escrow.
       *
       * This is the failure the per-contributor pots exist to make impossible,
       * and it is asserted rather than assumed: USER_B has escrowed nothing, so
       * refunding them must fail even though the raise as a whole holds plenty.
       */
      it('cannot refund a contributor out of another contributor’s escrow', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '500');
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('500'), sequence: 0 }),
        );

        await expect(
          ledger.post(recipes.raiseRefund({ raiseId: RAISE, userId: USER_B, paymentAssetId: 'USDT', amount: amt('500') })),
        ).rejects.toThrow(InsufficientFundsError);
        expect(await contributionOf(USER_A)).toBe('500');
      });

      /**
       * Vested allocations never touch the beneficiary's spendable balance on
       * the way through — that is the whole point of a vesting schedule, and
       * the books are what enforce it.
       */
      it('routes a vested allocation into platform escrow, then releases it', async () => {
        await openRaise();
        await fund(USER_A, 'USDT', '400');
        await ledger.post(
          recipes.raiseContribute({ raiseId: RAISE, userId: USER_A, paymentAssetId: 'USDT', amount: amt('400'), sequence: 0 }),
        );
        await ledger.post(
          recipes.raiseSettleContributor({
            raiseId: RAISE,
            issuerId: USER_C,
            userId: USER_A,
            paymentAssetId: 'USDT',
            contributed: amt('400'),
            refund: 0n,
            feeBps: 0,
            saleAssetId: 'IFC',
            saleAmount: amt('400'),
            vestingScheduleId: 'c-vest-1',
          }),
        );

        // Bought, but not yet theirs to spend.
        expect(await balanceOf(USER_A, 'IFC')).toBe('0');
        expect(formatAmount((await ledger.balance(vestingEscrow('c-vest-1', 'IFC'))).amount)).toBe('400');

        await ledger.post(
          recipes.vestingRelease({ scheduleId: 'c-vest-1', beneficiaryId: USER_A, assetId: 'IFC', amount: amt('100'), sequence: 0 }),
        );

        expect(await balanceOf(USER_A, 'IFC')).toBe('100');
        expect(formatAmount((await ledger.balance(vestingEscrow('c-vest-1', 'IFC'))).amount)).toBe('300');
      });

      /**
       * A schedule can only release what was actually funded into it. Module
       * accounts are hard non-negative, so one schedule cannot release out of
       * another's escrow — the books refuse rather than silently borrowing.
       */
      it('cannot release more than a schedule holds', async () => {
        await fund(USER_C, 'IFC', '100');
        await ledger.post(recipes.vestingFund({ scheduleId: 'c-vest-2', grantorId: USER_C, assetId: 'IFC', amount: amt('100') }));

        await expect(
          ledger.post(
            recipes.vestingRelease({ scheduleId: 'c-vest-2', beneficiaryId: USER_B, assetId: 'IFC', amount: amt('101'), sequence: 0 }),
          ),
        ).rejects.toThrow(InsufficientFundsError);
        expect(formatAmount((await ledger.balance(vestingEscrow('c-vest-2', 'IFC'))).amount)).toBe('100');
      });

      /** A team grant is funded from the grantor's own balance, never conjured. */
      it('funds a standalone vesting grant out of the grantor’s balance', async () => {
        await fund(USER_C, 'IFC', '500');
        await ledger.post(recipes.vestingFund({ scheduleId: 'c-vest-3', grantorId: USER_C, assetId: 'IFC', amount: amt('500') }));

        expect(await balanceOf(USER_C, 'IFC')).toBe('0');
        expect(formatAmount((await ledger.balance(vestingEscrow('c-vest-3', 'IFC'))).amount)).toBe('500');
      });

      /** The books must still close across a full raise — nothing created, nothing lost. */
      it('closes the books across a whole raise', async () => {
        if (!harness.totalsByAsset) return;

        await openRaise();
        await fund(USER_A, 'USDT', '500');
        await fund(USER_B, 'USDT', '300');
        for (const [userId, amount] of [
          [USER_A, '500'],
          [USER_B, '300'],
        ] as const) {
          await ledger.post(
            recipes.raiseContribute({ raiseId: RAISE, userId, paymentAssetId: 'USDT', amount: amt(amount), sequence: 0 }),
          );
        }
        await ledger.post(
          recipes.raiseSettleContributor({
            raiseId: RAISE,
            issuerId: USER_C,
            userId: USER_A,
            paymentAssetId: 'USDT',
            contributed: amt('500'),
            refund: amt('100'),
            feeBps: 150,
            saleAssetId: 'IFC',
            saleAmount: amt('400'),
          }),
        );
        await ledger.post(recipes.raiseRefund({ raiseId: RAISE, userId: USER_B, paymentAssetId: 'USDT', amount: amt('300') }));
        await ledger.post(
          recipes.raiseSupplyReturn({ raiseId: RAISE, issuerId: USER_C, saleAssetId: 'IFC', amount: amt('600'), reason: 'unsold' }),
        );

        const totals = await harness.totalsByAsset();
        expect(totals.USDT).toBe('0');
        expect(totals.IFC).toBe('0');
      });
    });

    // ── Balance projection ────────────────────────────────────────────────────

    describe('balances', () => {
      it('lists every balance an owner holds', async () => {
        await fund(USER_A, 'USDT', '100');
        await fund(USER_A, 'BTC', '1');
        await ledger.post(recipes.orderHold({ orderId: 'c-o1', userId: USER_A, assetId: 'USDT', amount: amt('40') }));

        const balances = await ledger.balances('user', USER_A);
        const view = Object.fromEntries(balances.map((b) => [`${b.account.assetId}:${b.account.kind}`, formatAmount(b.amount)]));

        expect(view['USDT:available']).toBe('60');
        expect(view['USDT:hold']).toBe('40');
        expect(view['BTC:available']).toBe('1');
      });

      it('reports zero for an account that has never been touched', async () => {
        expect(await balanceOf(USER_B, 'DOGE')).toBe('0');
      });
    });

    // ── Optional capabilities ─────────────────────────────────────────────────

    describe('journal and hash chain', () => {
      it('chains every transaction to its predecessor', async () => {
        if (!harness.journal || !harness.verifyChain) return;

        await fund(USER_A, 'USDT', '100');
        await fund(USER_B, 'USDT', '200');

        const journal = await harness.journal();
        expect(journal[0]?.previousHash).toBeNull();
        expect(journal[1]?.previousHash).toBe(journal[0]?.hash);
        expect(await harness.verifyChain()).toMatchObject({ ok: true });
      });
    });

    describe('reconciliation', () => {
      it('agrees with a full replay after a mixed run', async () => {
        if (!harness.reconcile) return;

        await fund(USER_A, 'USDT', '10000');
        for (let i = 0; i < 25; i++) {
          await ledger.post(recipes.orderHold({ orderId: `c-r${i}`, userId: USER_A, assetId: 'USDT', amount: amt('10') }));
          await ledger.post(recipes.orderHoldRelease({ orderId: `c-r${i}`, userId: USER_A, assetId: 'USDT', amount: amt('10') }));
        }

        expect(await harness.reconcile()).toMatchObject({ ok: true });
        expect(await balanceOf(USER_A, 'USDT')).toBe('10000');
      });

      it('closes the books — every asset nets to zero', async () => {
        if (!harness.totalsByAsset) return;

        await fund(USER_A, 'USDT', '1000');
        await fund(USER_B, 'BTC', '2');
        await ledger.post(recipes.orderHold({ orderId: 'c-h1', userId: USER_A, assetId: 'USDT', amount: amt('250') }));

        const totals = await harness.totalsByAsset();
        expect(totals.USDT).toBe('0');
        expect(totals.BTC).toBe('0');
      });
    });

    // ── Concurrency ───────────────────────────────────────────────────────────

    describe('concurrency', () => {
      it('never lets parallel spending exceed the balance', async () => {
        await fund(USER_A, 'USDT', '100');

        const attempts = Array.from({ length: 20 }, (_, i) =>
          ledger
            .post(recipes.orderHold({ orderId: `c-race-${i}`, userId: USER_A, assetId: 'USDT', amount: amt('10') }))
            .then(() => 'ok' as const)
            .catch(() => 'rejected' as const),
        );
        const results = await Promise.all(attempts);

        expect(results.filter((r) => r === 'ok')).toHaveLength(10);
        expect(await balanceOf(USER_A, 'USDT')).toBe('0');
        expect(await heldTotal(USER_A, 'USDT')).toBe('100');
      });
    });
  });
}
