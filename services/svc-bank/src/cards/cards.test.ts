import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  MemoryLedger,
  formatAmount,
  parseAmount as amt,
  recipes,
  rewardsEngine,
  railBoundary,
  userAvailable,
  withdrawalHoldAccount,
} from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import { CardService } from './card-service.js';
import { cardSim, cashbackOn, noCardIssuer, type CardIssuerAdapter } from './issuer.js';

/**
 * CARDS (§8.1) — the LEDGER half.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE IS ACTUALLY PROVING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Not "the simulator works". The simulator does nothing — that is the point of
 * it, and `issuer.ts` says so at length. What is under test is the MONEY PATH,
 * which is production code: every posting below is a real transaction in a real
 * ledger, and the only thing standing in for a counterparty is the thing that
 * cannot be built without a licence.
 *
 * Three properties carry the file:
 *
 *   1. Value is conserved. `ledger.totalsByAsset()` is zero after every path,
 *      including the ones that fail halfway.
 *   2. A hold belongs to ONE authorisation, and ends at exactly zero once that
 *      authorisation is settled — asserted on the ACCOUNT, not by adding up our
 *      own rows, because the ledger is the one that has to be right.
 *   3. Every refusal is NAMED. No default, no silent zero, no approval on
 *      behalf of a ledger that never answered.
 *
 * Own database per run, for the same reason `loans.test.ts` takes one: this file
 * and `bank-service.test.ts` would otherwise race each other's truncates across
 * worktrees.
 */

const here = dirname(fileURLToPath(import.meta.url));
const BANK_INIT = readFileSync(join(here, '..', '..', 'drizzle', '0000_bank_init.sql'), 'utf8');
const POSITION_PENDING = readFileSync(join(here, '..', '..', 'drizzle', '0001_position_pending.sql'), 'utf8');
const LOANS_MIGRATION = readFileSync(join(here, '..', '..', 'drizzle', '0002_bank_loans.sql'), 'utf8');
const CARDS_MIGRATION = readFileSync(join(here, '..', '..', 'drizzle', '0003_bank_cards.sql'), 'utf8');

const CARDS_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';

const HOLDER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FEE_PAYER = '99999999-9999-4999-8999-999999999999';

// ═══════════════════════════════════════════════════════════════════════════════
// 1 · ARITHMETIC AND THE PORT — no database, no ledger.
// ═══════════════════════════════════════════════════════════════════════════════

describe('cashback is integer arithmetic, and rounds against the platform’s optimism', () => {
  it('computes basis points exactly, with no float in the path', () => {
    expect(formatAmount(cashbackOn(amt('100'), 100))).toBe('1'); // 1%
    expect(formatAmount(cashbackOn(amt('250'), 50))).toBe('1.25'); // 0.5%
    expect(formatAmount(cashbackOn(amt('1'), 10_000))).toBe('1'); // 100%
  });

  /**
   * Floor, and deliberately.
   *
   * A rounding unit invented in the user's favour is value the rewards pot never
   * earned, paid out of a pot that has to balance. Under-paying by one atomic
   * unit is visible and correctable; over-paying is a slow leak nobody notices.
   */
  it('rounds DOWN, so a reward is never larger than the fees behind it', () => {
    // 1 attounit at 1% is 0.01 of an attounit, which does not exist.
    expect(cashbackOn(1n, 100)).toBe(0n);
    expect(formatAmount(cashbackOn(amt('0.000000000000000199'), 100))).toBe('0.000000000000000001');
  });

  it('treats a zero or absent rate as no reward rather than as an error', () => {
    expect(cashbackOn(amt('1000'), 0)).toBe(0n);
    expect(cashbackOn(amt('1000'), -1)).toBe(0n);
  });
});

describe('the simulator says what it is on every surface it has', () => {
  it('declares itself simulated, and names itself so in the display string', () => {
    const programme = cardSim().programme;
    expect(programme.simulated).toBe(true);
    expect(programme.id).toBe('card-sim');
    expect(programme.displayName.toLowerCase()).toContain('simulated');
  });

  it('derives a stable four-digit tail from the card id, and it is not a card number', async () => {
    const cardId = '7b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a40';
    const first = await cardSim().issue({ cardId, userId: HOLDER, assetId: 'USDT' });
    const second = await cardSim().issue({ cardId, userId: HOLDER, assetId: 'USDT' });

    // Re-issuing the same card id is the same card, not two.
    expect(first).toEqual(second);
    expect(first.panTail).toMatch(/^\d{4}$/);
    // A tail derived from a uuid corresponds to no card anybody has issued.
    expect(cardId).not.toContain(first.panTail);
  });
});

describe('no issuer configured means no card programme, and it refuses by name', () => {
  /**
   * THE MISSING-COUNTERPARTY REFUSAL, and the sibling of
   * `bank.no_liquidation_counterparty`.
   *
   * The dangerous default here is the plausible one — fall back to the simulator
   * and an environment somebody believes is live starts approving authorisations
   * against a counterparty that does not exist. Choosing `cardSim()` has to be an
   * act somebody performed.
   */
  it('refuses to issue, respond or set status', async () => {
    await expect(noCardIssuer.issue({ cardId: randomUUID(), userId: HOLDER, assetId: 'USDT' })).rejects.toMatchObject({
      code: 'bank.no_card_issuer',
    });
    await expect(
      noCardIssuer.respondToAuthorization({
        cardId: randomUUID(),
        issuerRef: 'x',
        authorizationRef: 'y',
        outcome: { decision: 'declined', reason: 'nope' },
      }),
    ).rejects.toMatchObject({ code: 'bank.no_card_issuer' });
    await expect(noCardIssuer.setStatus({ cardId: randomUUID(), issuerRef: 'x', status: 'frozen' })).rejects.toMatchObject({
      code: 'bank.no_card_issuer',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2 · THE MONEY PATH — real Postgres, real ledger postings.
// ═══════════════════════════════════════════════════════════════════════════════

const available = await postgresAvailable(CARDS_DB_URL);

if (!available) {
  describe.skip('svc-bank cards (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({
    service: 'bank',
    url: CARDS_DB_URL,
    migrations: [BANK_INIT, POSITION_PENDING, LOANS_MIGRATION, CARDS_MIGRATION],
  });
  const sql = db.sql;

  /** 30s: dropping a database is heavier than closing a pool. See bank-service.test.ts. */
  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('CardService', () => {
    let ledger: MemoryLedger;
    let cards: CardService;

    beforeEach(async () => {
      await sql`TRUNCATE bank.card_cashback, bank.card_settlements, bank.card_authorizations, bank.cards RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
      cards = new CardService(sql, ledger, { issuer: cardSim() });
    });

    async function fund(userId: string, assetId: string, value: string) {
      await ledger.post(
        recipes.deposit({ userId, assetId, amount: amt(value), rail: 'test', railRef: `${userId}:${assetId}:${Math.random()}` }),
      );
    }

    /** Real bank revenue, then swept into the pot cashback is paid from. */
    async function fundCashbackPot(assetId: string, value: string) {
      await fund(FEE_PAYER, assetId, value);
      await ledger.post(
        recipes.feeCharge({
          chargeId: `bank:${Math.random()}`,
          userId: FEE_PAYER,
          module: 'bank',
          mode: 'asset',
          assetId,
          amount: amt(value),
        }),
      );
      await cards.fundCashbackPot({ windowId: `w:${Math.random()}`, assetId, amount: amt(value) });
    }

    const availableOf = async (userId: string, assetId: string) =>
      formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);

    const heldOn = async (authorizationId: string, userId = HOLDER, assetId = 'USDT') =>
      formatAmount((await ledger.balance(withdrawalHoldAccount(userId, assetId, authorizationId))).amount);

    async function issueCard(options: { cashbackBps?: number; limit?: string; userId?: string } = {}) {
      return cards.issue({
        cardId: randomUUID(),
        userId: options.userId ?? HOLDER,
        assetId: 'USDT',
        ...(options.cashbackBps === undefined ? {} : { cashbackBps: options.cashbackBps }),
        perAuthorizationLimit: amt(options.limit ?? '1000'),
      });
    }

    // ── Issue ────────────────────────────────────────────────────────────────

    it('issues a card that says it is simulated, and no card number exists anywhere', async () => {
      const card = await issueCard();

      expect(card.simulated).toBe(true);
      expect(card.issuer).toBe('card-sim');
      expect(card.panTail).toMatch(/^\d{4}$/);

      // The schema has no column a PAN could be stored in, and the guard in
      // bank-service.test.ts would fail the build on a money column; this is the
      // narrower claim that nothing card-number-shaped is persisted here.
      const columns = await sql<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns WHERE table_schema = 'bank' AND table_name = 'cards'
      `;
      const names = columns.map((c) => c.column_name);
      expect(names).not.toContain('pan');
      expect(names).not.toContain('card_number');
      expect(names.filter((n) => /balance|spendable|available/i.test(n))).toEqual([]);
    });

    it('is idempotent on the card id — a retried issue is one card, not two on one balance', async () => {
      const cardId = randomUUID();
      const first = await cards.issue({ cardId, userId: HOLDER, assetId: 'USDT', perAuthorizationLimit: amt('500') });
      const second = await cards.issue({ cardId, userId: HOLDER, assetId: 'USDT', perAuthorizationLimit: amt('500') });

      expect(second.id).toBe(first.id);
      const rows = await sql`SELECT id FROM bank.cards WHERE user_id = ${HOLDER}`;
      expect(rows).toHaveLength(1);
    });

    it('refuses to issue at all when the deployment has no issuer', async () => {
      const unconfigured = new CardService(sql, ledger);
      await expect(
        unconfigured.issue({ cardId: randomUUID(), userId: HOLDER, assetId: 'USDT', perAuthorizationLimit: amt('100') }),
      ).rejects.toMatchObject({ code: 'bank.no_card_issuer' });

      // And nothing was written on the way to refusing.
      const rows = await sql`SELECT id FROM bank.cards`;
      expect(rows).toHaveLength(0);
    });

    // ── Authorise ────────────────────────────────────────────────────────────

    it('approves against a real ledger balance and holds the funds in this authorisation’s own account', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();

      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120'), merchantCategory: 'grocery' });

      expect(auth.decision).toBe('approved');
      expect(auth.status).toBe('settled');
      expect(auth.holdLedgerTxId).not.toBeNull();

      // The user's spendable balance fell, and the value is in a hold keyed to
      // THIS authorisation — not a shared per-user pot a second authorisation
      // could spend out from under it.
      expect(await availableOf(HOLDER, 'USDT')).toBe('380');
      expect(await heldOn(auth.id)).toBe('120');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('gives every authorisation a hold account of its own', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();

      const first = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('100') });
      const second = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-2', amount: amt('50') });

      expect(await heldOn(first.id)).toBe('100');
      expect(await heldOn(second.id)).toBe('50');
      expect(await availableOf(HOLDER, 'USDT')).toBe('350');

      // Settling the first must not touch the second's reservation.
      await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('100') });
      expect(await heldOn(first.id)).toBe('0');
      expect(await heldOn(second.id)).toBe('50');
    });

    it('returns the FIRST decision when the issuer redelivers, and does not hold twice', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();

      const first = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });
      const redelivered = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      expect(redelivered.id).toBe(first.id);
      expect(await availableOf(HOLDER, 'USDT')).toBe('380');
      expect(await heldOn(first.id)).toBe('120');

      const rows = await sql`SELECT id FROM bank.card_authorizations WHERE card_id = ${card.id}`;
      expect(rows).toHaveLength(1);
    });

    /**
     * THE FOUR DECLINES, EACH BY NAME.
     *
     * A decline is an answer a user will ask about days later, so it is a row
     * with a reason on it rather than an exception that vanishes. There is no
     * fifth reason and no score — risk modelling belongs to a rail this
     * deployment does not have.
     */
    it('declines an insufficient balance without moving anything, and records why', async () => {
      await fund(HOLDER, 'USDT', '50');
      const card = await issueCard();

      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      expect(auth.decision).toBe('declined');
      expect(auth.declineCode).toBe('ledger.insufficient_funds');
      expect(auth.holdLedgerTxId).toBeNull();
      expect(await availableOf(HOLDER, 'USDT')).toBe('50');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('declines on a frozen card, and the freeze is what a user reaches for first', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();
      await cards.setStatus(card.id, 'frozen');

      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('10') });
      expect(auth.decision).toBe('declined');
      expect(auth.declineCode).toBe('bank.card_not_active');
      expect(await availableOf(HOLDER, 'USDT')).toBe('500');
    });

    it('declines above the per-authorisation ceiling', async () => {
      await fund(HOLDER, 'USDT', '5000');
      const card = await issueCard({ limit: '200' });

      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200.000000000000000001') });
      expect(auth.declineCode).toBe('bank.card_limit_exceeded');

      // Exactly on the ceiling is under it, not over.
      const onTheLine = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-2', amount: amt('200') });
      expect(onTheLine.decision).toBe('approved');
    });

    it('refuses to reopen a closed card', async () => {
      const card = await issueCard();
      await cards.setStatus(card.id, 'closed');
      await expect(cards.setStatus(card.id, 'active')).rejects.toMatchObject({ code: 'bank.card_not_active' });
    });

    /**
     * A LEDGER THAT NEVER ANSWERED IS NOT A DECLINE.
     *
     * Turning an unreachable svc-ledger into "declined" would be answering no on
     * behalf of a system that never spoke — a lie the user pays for at the till.
     * The row stays claimed and a redelivery re-drives it.
     */
    it('does not manufacture a decline when the ledger itself is unavailable', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();

      const broken = new CardService(
        sql,
        {
          ...ledger,
          balance: ledger.balance.bind(ledger),
          post: async () => {
            throw new Error('svc-ledger unreachable');
          },
        } as unknown as MemoryLedger,
        { issuer: cardSim() },
      );

      await expect(broken.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('10') })).rejects.toThrow(
        'svc-ledger unreachable',
      );

      const rows = await sql<Array<{ decision: string; status: string }>>`
        SELECT decision, status FROM bank.card_authorizations WHERE card_id = ${card.id}
      `;
      expect(rows[0]).toMatchObject({ decision: 'approved', status: 'pending' });

      // And re-driving completes it, because the hold post is idempotent on the
      // authorisation's own uuid.
      const redriven = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('10') });
      expect(redriven.status).toBe('pending');
    });

    // ── Capture, reversal, and the hold that must end at zero ────────────────

    it('captures the full amount: value leaves the book at the rail boundary and the hold reads zero', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();
      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      expect(formatAmount(result.captured)).toBe('120');
      expect(formatAmount(result.returned)).toBe('0');
      expect(result.reversalLedgerTxId).toBeNull();

      expect(await heldOn(auth.id)).toBe('0');
      expect(await availableOf(HOLDER, 'USDT')).toBe('380');
      expect(formatAmount((await ledger.balance(railBoundary('card-sim', 'USDT'))).amount)).toBe('120');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    /**
     * THE PARTIAL CAPTURE, WHICH IS WHY THIS IS TWO POSTINGS.
     *
     * The merchant takes what they charged and the unspent remainder of the hold
     * goes back to the user in the same pass. Two facts, two rows, two ledger
     * transactions — and the invariant is checked on the hold ACCOUNT rather
     * than by adding up our own rows, because the ledger is the one that has to
     * be right.
     */
    it('captures part of an authorisation and returns the remainder in the same pass', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();
      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('75.5') });

      expect(formatAmount(result.captured)).toBe('75.5');
      expect(formatAmount(result.returned)).toBe('44.5');
      expect(result.reversalLedgerTxId).not.toBeNull();

      expect(await heldOn(auth.id)).toBe('0');
      expect(await availableOf(HOLDER, 'USDT')).toBe('424.5');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('returns the whole hold when an authorisation is voided or expires', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();
      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      const reversed = await cards.reverse({ cardId: card.id, authorizationRef: 'auth-1' });

      expect(formatAmount(reversed.returned)).toBe('120');
      expect(await heldOn(auth.id)).toBe('0');
      expect(await availableOf(HOLDER, 'USDT')).toBe('500');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses to capture an authorisation that was already settled, and to settle one twice', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();
      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });
      await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      await expect(cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') })).rejects.toMatchObject({
        code: 'bank.card_authorization_closed',
      });
      await expect(cards.reverse({ cardId: card.id, authorizationRef: 'auth-1' })).rejects.toMatchObject({
        code: 'bank.card_authorization_closed',
      });

      // The double attempt moved nothing.
      expect(await availableOf(HOLDER, 'USDT')).toBe('380');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses a capture larger than what was authorised and held', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard();
      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });

      await expect(
        cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120.000000000000000001') }),
      ).rejects.toMatchObject({ code: 'bank.card_capture_exceeds_authorization' });
    });

    it('refuses to capture against a declined authorisation, which holds nothing', async () => {
      await fund(HOLDER, 'USDT', '10');
      const card = await issueCard();
      const declined = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') });
      expect(declined.decision).toBe('declined');

      await expect(cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('120') })).rejects.toMatchObject({
        code: 'bank.card_authorization_declined',
      });
    });

    it('refuses an authorisation reference this card has never seen', async () => {
      const card = await issueCard();
      await expect(cards.capture({ cardId: card.id, authorizationRef: 'never', amount: amt('1') })).rejects.toMatchObject({
        code: 'bank.card_authorization_not_found',
      });
    });

    // ── Cashback ─────────────────────────────────────────────────────────────

    it('pays cashback out of a pot funded from real bank revenue', async () => {
      await fund(HOLDER, 'USDT', '500');
      await fundCashbackPot('USDT', '10');
      const card = await issueCard({ cashbackBps: 100 }); // 1%

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });

      expect(result.cashback.status).toBe('paid');
      expect(formatAmount(result.cashback.amount)).toBe('2');

      // 500 − 200 spent + 2 back.
      expect(await availableOf(HOLDER, 'USDT')).toBe('302');
      expect(formatAmount((await ledger.balance(rewardsEngine('USDT'))).amount)).toBe('8');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('pays cashback on the CAPTURED amount, never on the authorised one', async () => {
      // A reward on an amount the merchant did not take would be cashback on a
      // purchase that did not happen at that size.
      await fund(HOLDER, 'USDT', '500');
      await fundCashbackPot('USDT', '10');
      const card = await issueCard({ cashbackBps: 100 });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('50') });

      expect(formatAmount(result.cashback.amount)).toBe('0.5');
    });

    it('pays nothing at all on a reversed authorisation', async () => {
      await fund(HOLDER, 'USDT', '500');
      await fundCashbackPot('USDT', '10');
      const card = await issueCard({ cashbackBps: 100 });

      const auth = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      await cards.reverse({ cardId: card.id, authorizationRef: 'auth-1' });

      expect(await cards.cashbackFor(auth.id)).toBeNull();
      expect(await availableOf(HOLDER, 'USDT')).toBe('500');
      expect(formatAmount((await ledger.balance(rewardsEngine('USDT'))).amount)).toBe('10');
    });

    /**
     * THE REFUSAL THAT MATTERS MOST IN THIS FILE.
     *
     * The pot is empty, so the advertised rate is not currently earned. The
     * capture still stands — undoing a purchase the merchant already has,
     * because a marketing promise could not be kept, would be the worse
     * failure — and the reward is refused BY NAME, on a row, where an operator
     * finds it on the day it became true.
     */
    it('refuses cashback by name when the pot is unfunded, and leaves the capture standing', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard({ cashbackBps: 100 });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });

      expect(result.cashback).toMatchObject({ status: 'refused', reason: 'bank.cashback_pot_unfunded' });
      expect(formatAmount(result.cashback.amount)).toBe('2');

      // The capture happened: the merchant has the money, the user does not.
      expect(await availableOf(HOLDER, 'USDT')).toBe('300');
      expect(formatAmount((await ledger.balance(railBoundary('card-sim', 'USDT'))).amount)).toBe('200');

      // And the unpaid reward is a row somebody can look at, not an absence.
      const record = await cards.cashbackFor(result.authorizationId);
      expect(record).toMatchObject({ status: 'rejected', rejectionCode: 'bank.cashback_pot_unfunded' });
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('pays nothing and records nothing when the card earns no cashback', async () => {
      await fund(HOLDER, 'USDT', '500');
      const card = await issueCard(); // 0 bps

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });

      // Not a refusal and not a payment. A zero-value posting to say "nothing
      // was earned" would be noise in the book.
      expect(result.cashback).toEqual({ status: 'none', amount: 0n });
      expect(await cards.cashbackFor(result.authorizationId)).toBeNull();
    });

    it('pays one cashback per authorisation however many times a capture is re-driven', async () => {
      await fund(HOLDER, 'USDT', '500');
      await fundCashbackPot('USDT', '10');
      const card = await issueCard({ cashbackBps: 100 });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      // The second capture is refused as closed, which is the guard that makes
      // the reward unrepeatable too.
      await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') }).catch(() => undefined);

      const rows = await sql`SELECT id FROM bank.card_cashback`;
      expect(rows).toHaveLength(1);
      expect(await availableOf(HOLDER, 'USDT')).toBe('302');
    });

    it('snapshots the rate, so re-rating the card later cannot rewrite what was promised', async () => {
      await fund(HOLDER, 'USDT', '500');
      await fundCashbackPot('USDT', '10');
      const card = await issueCard({ cashbackBps: 100 });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });
      const result = await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('200') });

      await sql`UPDATE bank.cards SET cashback_bps = 500 WHERE id = ${card.id}`;
      const rows = await sql<Array<{ rate_bps: number }>>`
        SELECT rate_bps FROM bank.card_cashback WHERE authorization_id = ${result.authorizationId}
      `;
      expect(Number(rows[0]!.rate_bps)).toBe(100);
    });

    // ── Ownership, and what a row can say about somebody else ────────────────

    it('never returns one user’s authorisations under another user’s card id', async () => {
      await fund(HOLDER, 'USDT', '500');
      const mine = await issueCard();
      const theirs = await issueCard({ userId: OTHER });

      await cards.authorize({ cardId: mine.id, authorizationRef: 'auth-1', amount: amt('10') });

      // The service reads by card, and the ROUTER owner-checks the card — the
      // same split as `transfers.executions`, where only the router knows what
      // the caller should be told. This pins the service half: no cross-card
      // bleed.
      expect(await cards.authorizationsOf(theirs.id)).toHaveLength(0);
      expect(await cards.authorizationsOf(mine.id)).toHaveLength(1);
    });

    // ── Conservation, over everything at once ────────────────────────────────

    it('conserves value across issue, authorise, decline, partial capture, reversal and cashback', async () => {
      await fund(HOLDER, 'USDT', '1000');
      await fundCashbackPot('USDT', '25');
      const card = await issueCard({ cashbackBps: 250 });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('300') });
      await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('180') });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-2', amount: amt('90') });
      await cards.reverse({ cardId: card.id, authorizationRef: 'auth-2' });

      await cards.authorize({ cardId: card.id, authorizationRef: 'auth-3', amount: amt('5000') }); // declined: over limit

      expect(ledger.totalsByAsset().USDT).toBe('0');
      // 1000 − 180 captured + 4.5 cashback (2.5% of 180).
      expect(await availableOf(HOLDER, 'USDT')).toBe('824.5');
      expect(formatAmount((await ledger.balance(railBoundary('card-sim', 'USDT'))).amount)).toBe('180');
      expect(formatAmount((await ledger.balance(rewardsEngine('USDT'))).amount)).toBe('20.5');
    });

    it('leaves no value in any hold account once every authorisation is settled', async () => {
      await fund(HOLDER, 'USDT', '1000');
      const card = await issueCard();

      const a = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('100') });
      const b = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-2', amount: amt('200') });
      const c = await cards.authorize({ cardId: card.id, authorizationRef: 'auth-3', amount: amt('300') });

      await cards.capture({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('100') });
      await cards.capture({ cardId: card.id, authorizationRef: 'auth-2', amount: amt('50') });
      await cards.reverse({ cardId: card.id, authorizationRef: 'auth-3' });

      for (const auth of [a, b, c]) expect(await heldOn(auth.id)).toBe('0');
      expect(await availableOf(HOLDER, 'USDT')).toBe('850');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    // ── The adapter cannot move value ────────────────────────────────────────

    /**
     * An issuer decides whether a card exists and carries our decision back to
     * the network. The LEDGER decides where money goes, through recipes (§0.6).
     * An adapter that posted anything would be a second book with a partner's
     * name on it — so the port is handed no ledger, and this is the behavioural
     * proof that nothing leaks one to it.
     */
    it('hands the issuer adapter nothing it could move money with', async () => {
      await fund(HOLDER, 'USDT', '500');

      const seen: unknown[] = [];
      const spy: CardIssuerAdapter = {
        programme: cardSim().programme,
        issue: async (input) => {
          seen.push(input);
          return cardSim().issue(input);
        },
        respondToAuthorization: async (input) => void seen.push(input),
        setStatus: async (input) => void seen.push(input),
      };

      const service = new CardService(sql, ledger, { issuer: spy });
      const card = await service.issue({ cardId: randomUUID(), userId: HOLDER, assetId: 'USDT', perAuthorizationLimit: amt('500') });
      await service.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('10') });

      const flattened = JSON.stringify(seen, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      expect(flattened).not.toContain('post');
      expect(flattened).not.toContain('balance');
      for (const call of seen) {
        expect(Object.values(call as Record<string, unknown>).some((v) => typeof v === 'function')).toBe(false);
      }
    });

    /**
     * A DECISION ALREADY TRUE IS NOT UNDONE BY FAILING TO DELIVER IT.
     *
     * The funds are held and the row is written before the issuer is told. If
     * the network cannot be reached the scheme treats the silence as a decline
     * at the till, and the hold is released when the authorisation expires —
     * whereas throwing here would unwind a ledger transaction that has committed.
     */
    it('keeps the hold when the issuer cannot be told the answer', async () => {
      await fund(HOLDER, 'USDT', '500');
      const unreachable: CardIssuerAdapter = {
        programme: cardSim().programme,
        issue: cardSim().issue,
        respondToAuthorization: async () => {
          throw new BankError('issuer unreachable', 'bank.no_card_issuer');
        },
        setStatus: async () => undefined,
      };

      const service = new CardService(sql, ledger, { issuer: unreachable });
      const card = await service.issue({ cardId: randomUUID(), userId: HOLDER, assetId: 'USDT', perAuthorizationLimit: amt('500') });
      const auth = await service.authorize({ cardId: card.id, authorizationRef: 'auth-1', amount: amt('10') });

      expect(auth.decision).toBe('approved');
      expect(await heldOn(auth.id)).toBe('10');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });
  });
}
