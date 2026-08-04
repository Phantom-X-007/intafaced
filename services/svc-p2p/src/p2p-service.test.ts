import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, parseAmount as amt, recipes, houseFees, userAvailable } from '@intafaced/ledger-client';
import { P2pService, P2pError } from './p2p-service.js';
import { InstrumentService } from './instrument-service.js';
import { ANY_COUNTRY } from './instruments.js';
import { TradeStateError } from './state.js';
import type { ReferencePriceSource } from './pricing.js';

/**
 * svc-p2p ESCROW MONEY PATHS.
 *
 * Postgres is real, because the trade row / ledger interaction is exactly where
 * a stranded-funds bug would hide. The ledger is `MemoryLedger` — the reference
 * implementation the conformance suite proves equivalent to svc-ledger's
 * Postgres engine (§4.4) — so these tests are about svc-p2p's decisions and
 * ordering, not about the ledger.
 *
 * The standing assertion in almost every test is `totalsByAsset()` being zero.
 * Escrow is the one place where value sits between two owners, and a book that
 * does not close is a book where some of it went somewhere nobody asked for.
 */

const URL = process.env.TEST_DATABASE_URL_P2P ?? 'postgres://svc_p2p:svc_p2p@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_p2p_init.sql'), 'utf8');
const instrumentsMigration = readFileSync(join(here, '..', 'drizzle', '0001_p2p_payment_instruments.sql'), 'utf8');

const MAKER = '11111111-1111-4111-8111-111111111111';
const TAKER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const MODERATOR = '44444444-4444-4444-8444-444444444444';

const ASSET = 'USDT';

/** Shared by every svc-p2p suite that brings the schema up. Any constant, as long as it is the same one. */
const P2P_MIGRATION_LOCK = 8_140_702;

/**
 * The Postgres probe comes from `@intafaced/db` on purpose.
 *
 * This file used to open its own two-line `reachable()`. That helper swallowed
 * every error and returned `false` regardless of `CI` or `REQUIRE_POSTGRES=1`,
 * so on CI — where an unreachable database is supposed to be a hard failure —
 * this money suite would have skipped in silence and been counted as a pass.
 * Five suites carried the same private probe and the same hole.
 *
 * `postgresAvailable` is the one probe that honours `postgresRequired()`, and it
 * journals its decision so `pnpm verify` can name what did not run instead of
 * letting turbo's "N successful" imply that everything did.
 * (`tooling/ci/skip-honesty-scan.mjs` fails a build that re-adds a private probe.)
 */
const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-p2p (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 12,
    connection: { search_path: 'p2p,public', application_name: 'svc-p2p-test' },
    onnotice: () => undefined,
  });

  // Owns its database, or does not run. Must precede the first migration.
  await assertTestDatabase(sql, 'svc-p2p');

  // Under an advisory lock, and the same constant the instrument suite uses.
  // Both migrations re-assert their CHECK constraints with DROP ... IF EXISTS
  // first, so two suites bringing the same schema up at once take the same
  // table locks in opposite orders and Postgres kills one with a deadlock.
  // `vitest.config.ts` already serialises the two FILES; this covers the case
  // it cannot — a second checkout of this repo pointed at the same test
  // database, which is exactly how the shared-database incident happened.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${P2P_MIGRATION_LOCK})`;
    await tx.unsafe(migration);
    await tx.unsafe(instrumentsMigration);
  });

  /**
   * Stateless apart from the connection, so it is built once. The tables it
   * owns are truncated per test like every other table here.
   */
  const instruments = new InstrumentService(sql);

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let p2p: P2pService;

  /** A reference feed that can be switched off, for the floating-price cases. */
  let reference: { price: string | null };
  const referencePrices: ReferencePriceSource = {
    async price() {
      return reference.price === null ? null : amt(reference.price);
    },
  };

  const options = {
    instruments,
    feeBps: 100, // 1% — large enough that a mis-split is visible in a balance
    referencePrices,
    deadlines: {
      escrowSeconds: 120,
      paymentSeconds: 900,
      releaseSeconds: 1800,
      disputeSeconds: 604_800,
      escalationRecheckSeconds: 3_600,
    },
  };

  /**
   * A take now requires the SELLER to have somewhere the buyer can pay, and is
   * refused before any lock otherwise (`p2p.take_refused`). So every
   * account that ends up on the sell side of a trade in this file needs a
   * destination, in the currency that trade is priced in.
   *
   * The schema below is a FIXTURE, not a claim about any real payment scheme.
   * The registry ships empty precisely because what a market's rails require is
   * not this repo's knowledge to invent — a single opaque "account reference"
   * field is enough to exercise the escrow paths and asserts nothing about how
   * anyone's bank actually works.
   */
  async function seedPaymentRails() {
    await instruments.registerMethodSchema({
      methodId: 'sepa',
      country: ANY_COUNTRY,
      label: 'Bank transfer (test fixture)',
      fields: [{ key: 'account_reference', label: 'Account reference', required: true }],
    });

    for (const ownerId of [MAKER, TAKER, OTHER, MODERATOR]) {
      for (const fiatCurrency of ['USD', 'EUR']) {
        await instruments.createInstrument({
          ownerId,
          methodId: 'sepa',
          country: 'DE',
          fiatCurrency,
          label: `${fiatCurrency} destination`,
          details: { account_reference: `ref-${ownerId}-${fiatCurrency}` },
        });
      }
    }
  }

  /** Put real value in a user's available balance so an escrow has something behind it. */
  async function fund(userId: string, amount: string) {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId: ASSET,
        amount: amt(amount),
        rail: 'test',
        railRef: `${userId}:${amount}:${crypto.randomUUID()}`,
      }),
    );
  }

  const availableOf = async (userId: string) => formatAmount((await ledger.balance(userAvailable(userId, ASSET))).amount);
  const escrowOf = async (userId: string) => {
    const all = await ledger.balances('user', userId);
    const total = all.filter((b) => b.account.kind === 'escrow' && b.account.assetId === ASSET).reduce((acc, b) => acc + b.amount, 0n);
    return formatAmount(total);
  };
  const houseOf = async () => formatAmount((await ledger.balance(houseFees('p2p', ASSET))).amount);

  /** The standing invariant: the book closes and replays identically. */
  async function expectBooksClosed() {
    expect(ledger.totalsByAsset()[ASSET] ?? '0').toBe('0');
    expect(ledger.reconcile()).toEqual({ ok: true });
    expect(ledger.verifyChain()).toEqual({ ok: true });
  }

  /** A standard sell offer: maker sells USDT for USD at 1.00, 10–500 per trade. */
  async function sellOffer(overrides: Partial<Parameters<P2pService['createOffer']>[0]> = {}) {
    return p2p.createOffer({
      makerId: MAKER,
      side: 'sell',
      asset: ASSET,
      fiatCurrency: 'USD',
      priceType: 'fixed',
      price: amt('1'),
      minAmt: amt('10'),
      maxAmt: amt('500'),
      totalAmt: amt('500'),
      methods: ['sepa'],
      ...overrides,
    });
  }

  /** Age a trade past its deadline without waiting for a real clock. */
  async function expire(tradeId: string) {
    await sql`UPDATE p2p.p2p_trades SET deadline_at = now() - interval '1 hour' WHERE id = ${tradeId}`;
  }

  /** Funded seller + a taken trade, ready to release. */
  async function escrowedTrade(amount = '100') {
    await fund(MAKER, '1000');
    const offer = await sellOffer();
    return p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt(amount), method: 'sepa' });
  }

  beforeEach(async () => {
    await sql`
      TRUNCATE p2p.instrument_access_log, p2p.trade_payment_instruments, p2p.payment_instruments,
               p2p.payment_method_schemas, p2p.p2p_disputes, p2p.p2p_trades, p2p.offers, p2p.p2p_reputation
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-p2p');
    reference = { price: '1' };
    p2p = new P2pService(sql, ledger, bus, options);
    await seedPaymentRails();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  // ── Offers ────────────────────────────────────────────────────────────────

  describe('offers', () => {
    it('creates an offer and puts its full inventory on the board', async () => {
      const offer = await sellOffer();
      expect(formatAmount(offer.remainingAmt)).toBe('500');
      expect(offer.status).toBe('active');
      expect(offer.fiatCurrency).toBe('USD');
    });

    it('emits p2pOfferCreated', async () => {
      const offer = await sellOffer();
      const emitted = bus.emitted('p2pOfferCreated');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]?.payload).toMatchObject({ offerId: offer.id, side: 'sell', price: '1' });
    });

    it('refuses a fiat currency the registry does not serve', async () => {
      // §6.2: 100+ fiat currencies are config, not code. The registry decides.
      await expect(sellOffer({ fiatCurrency: 'HRK' })).rejects.toMatchObject({ code: 'p2p.unsupported_fiat' });
      await expect(sellOffer({ fiatCurrency: 'XYZ' })).rejects.toMatchObject({ code: 'p2p.unsupported_fiat' });
    });

    it('accepts any of the 100+ currencies the registry does serve', async () => {
      for (const code of ['JPY', 'KWD', 'NGN', 'BRL', 'VND']) {
        const offer = await sellOffer({ fiatCurrency: code });
        expect(offer.fiatCurrency).toBe(code);
      }
    });

    it('rejects inverted bounds at the database, not just in code', async () => {
      await expect(sellOffer({ minAmt: amt('500'), maxAmt: amt('10') })).rejects.toThrow(/offers_bounds_ordered_ck/);
    });

    it('rejects a max above the offer’s own inventory', async () => {
      await expect(sellOffer({ maxAmt: amt('900'), totalAmt: amt('500') })).rejects.toThrow(/offers_bounds_ordered_ck/);
    });

    it('lists only offers with liquidity left to take', async () => {
      await fund(MAKER, '1000');
      const offer = await sellOffer({ minAmt: amt('400'), maxAmt: amt('500'), totalAmt: amt('500') });

      expect(await p2p.listOffers({ asset: ASSET })).toHaveLength(1);
      await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('450'), method: 'sepa' });
      // 50 left, below the 400 minimum — nobody can take it, so it leaves the board.
      expect(await p2p.listOffers({ asset: ASSET })).toHaveLength(0);
    });

    it('closes an offer without touching its open trades', async () => {
      const trade = await escrowedTrade('100');
      await p2p.closeOffer(trade.offerId, MAKER);

      expect((await p2p.getTrade(trade.id)).status).toBe('escrowed');
      expect((await p2p.getOffer(trade.offerId)).status).toBe('closed');
    });

    it('lets only the maker close an offer', async () => {
      const offer = await sellOffer();
      await expect(p2p.closeOffer(offer.id, OTHER)).rejects.toMatchObject({ code: 'p2p.not_a_party' });
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  describe('HAPPY PATH — lock, then release', () => {
    it('locks the seller’s asset into escrow on take', async () => {
      const trade = await escrowedTrade('100');

      expect(trade.status).toBe('escrowed');
      expect(await availableOf(MAKER)).toBe('900');
      expect(await escrowOf(MAKER)).toBe('100');
      expect(await availableOf(TAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('prices the fiat leg and freezes it on the trade', async () => {
      await fund(MAKER, '1000');
      const offer = await sellOffer({ price: amt('0.985') });
      const trade = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('123.45'), method: 'sepa' });

      // 123.45 × 0.985 = 121.59825 → $121.60
      expect(formatAmount(trade.fiatAmount)).toBe('121.6');
      expect(formatAmount(trade.price)).toBe('0.985');
    });

    it('releases to the buyer, pays the house its fee, and closes the books', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      const released = await p2p.confirmFiatReceived(trade.id, MAKER);

      expect(released.status).toBe('released');
      expect(released.resolution).toBe('released');
      expect(released.settledAt).not.toBeNull();

      // 1% of 100 to the house, 99 to the buyer, nothing left in escrow.
      expect(await availableOf(TAKER)).toBe('99');
      expect(await houseOf()).toBe('1');
      expect(await escrowOf(MAKER)).toBe('0');
      expect(await availableOf(MAKER)).toBe('900');

      await expectBooksClosed();
    });

    it('takes the fee out of the escrowed amount, never from a second post', async () => {
      // A fee charged separately could fail after the release and leave the
      // house short of a fee it already promised the seller it had taken.
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      const buyer = amt(await availableOf(TAKER));
      const house = amt(await houseOf());
      expect(buyer + house).toBe(amt('100'));
    });

    it('lets the seller release straight from escrowed', async () => {
      const trade = await escrowedTrade('100');
      const released = await p2p.confirmFiatReceived(trade.id, MAKER);
      expect(released.status).toBe('released');
      expect(await availableOf(TAKER)).toBe('99');
    });

    it('emits escrow locked and released', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      expect(bus.emitted('p2pEscrowLocked')[0]?.payload).toMatchObject({ tradeId: trade.id, amount: '100' });
      expect(bus.emitted('p2pEscrowReleased')[0]?.payload).toMatchObject({ tradeId: trade.id, amount: '100', fee: '1' });
    });

    it('works with a zero fee — no fee entry rather than a zero-amount entry', async () => {
      const noFee = new P2pService(sql, ledger, bus, { ...options, feeBps: 0 });
      await fund(MAKER, '1000');
      const offer = await noFee.createOffer({
        makerId: MAKER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency: 'USD',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        methods: ['sepa'],
      });
      const trade = await noFee.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });
      await noFee.confirmFiatReceived(trade.id, MAKER);

      expect(await availableOf(TAKER)).toBe('100');
      expect(await houseOf()).toBe('0');
      await expectBooksClosed();
    });

    it('escrows the TAKER on a buy offer', async () => {
      await fund(TAKER, '1000');
      const offer = await p2p.createOffer({
        makerId: MAKER,
        side: 'buy',
        asset: ASSET,
        fiatCurrency: 'USD',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        methods: ['sepa'],
      });
      const trade = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });

      expect(trade.sellerId).toBe(TAKER);
      expect(trade.buyerId).toBe(MAKER);
      expect(await escrowOf(TAKER)).toBe('100');

      await p2p.confirmFiatReceived(trade.id, TAKER);
      expect(await availableOf(MAKER)).toBe('99');
      await expectBooksClosed();
    });
  });

  // ── Cancel → refund ───────────────────────────────────────────────────────

  describe('CANCEL — full refund, seller made whole', () => {
    it('returns every unit to the seller', async () => {
      const trade = await escrowedTrade('250');
      expect(await escrowOf(MAKER)).toBe('250');

      const cancelled = await p2p.cancelTrade(trade.id, TAKER, 'changed_mind');

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.resolution).toBe('refunded');
      // Whole, to the unit. No fee is taken on a refund — the platform did not
      // provide the service it charges for.
      expect(await availableOf(MAKER)).toBe('1000');
      expect(await escrowOf(MAKER)).toBe('0');
      expect(await houseOf()).toBe('0');
      await expectBooksClosed();
    });

    it('hands the liquidity back to the offer', async () => {
      const trade = await escrowedTrade('250');
      expect(formatAmount((await p2p.getOffer(trade.offerId)).remainingAmt)).toBe('250');

      await p2p.cancelTrade(trade.id, TAKER);
      expect(formatAmount((await p2p.getOffer(trade.offerId)).remainingAmt)).toBe('500');
    });

    it('lets either party cancel before the buyer claims to have paid', async () => {
      const a = await escrowedTrade('100');
      await expect(p2p.cancelTrade(a.id, MAKER)).resolves.toMatchObject({ resolution: 'refunded' });

      const offer = await sellOffer();
      const b = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });
      await expect(p2p.cancelTrade(b.id, TAKER)).resolves.toMatchObject({ resolution: 'refunded' });
      await expectBooksClosed();
    });

    it('refuses to let the BUYER cancel after declaring the fiat sent', async () => {
      // Otherwise a buyer could take their claim back after the seller acted on
      // it. Their route from here is a dispute.
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);

      await expect(p2p.cancelTrade(trade.id, TAKER)).rejects.toMatchObject({ code: 'p2p.not_the_seller' });
      expect(await escrowOf(MAKER)).toBe('100');
    });

    it('lets the seller refund voluntarily after the buyer claims to have paid', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);

      const cancelled = await p2p.cancelTrade(trade.id, MAKER, 'payment_never_arrived');
      expect(cancelled.resolution).toBe('refunded');
      expect(await availableOf(MAKER)).toBe('1000');
      await expectBooksClosed();
    });

    it('lets nobody outside the trade cancel it', async () => {
      const trade = await escrowedTrade('100');
      await expect(p2p.cancelTrade(trade.id, OTHER)).rejects.toMatchObject({ code: 'p2p.not_a_party' });
      expect(await escrowOf(MAKER)).toBe('100');
    });
  });

  // ── Disputes ──────────────────────────────────────────────────────────────

  describe('DISPUTES — a moderator resolves to release OR refund, never neither', () => {
    it('holds the escrow while a dispute is open', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'seller unresponsive' });

      expect((await p2p.getTrade(trade.id)).status).toBe('disputed');
      // Value has not moved. Neither party can spend it.
      expect(await escrowOf(MAKER)).toBe('100');
      expect(await availableOf(TAKER)).toBe('0');
    });

    it('resolves to RELEASE — buyer receives, house takes its fee', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'paid, not released' });

      const resolved = await p2p.resolveDispute({
        tradeId: trade.id,
        moderatorId: MODERATOR,
        resolution: 'release',
        notes: 'bank statement matches',
      });

      expect(resolved.status).toBe('released');
      expect(await availableOf(TAKER)).toBe('99');
      expect(await houseOf()).toBe('1');
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('resolves to REFUND — seller made whole', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await p2p.openDispute({ tradeId: trade.id, openedBy: MAKER, reason: 'no payment received' });

      const resolved = await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'refund' });

      expect(resolved.status).toBe('cancelled');
      expect(resolved.resolution).toBe('refunded');
      expect(await availableOf(MAKER)).toBe('1000');
      expect(await availableOf(TAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('RECORDS THE DECISION BEFORE THE LEDGER POST', async () => {
      // §5: the audit trail must explain every movement, which means the
      // explanation exists before the movement. `resolved_at` is written in the
      // decision transaction; `settled_at` only after the post succeeded.
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });
      await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'release' });

      const rows = await sql<Array<{ created_at: Date; escrowed_at: Date; resolved_at: Date; settled_at: Date }>>`
        SELECT created_at, escrowed_at, resolved_at, settled_at FROM p2p.p2p_trades WHERE id = ${trade.id}
      `;
      expect(rows[0]!.resolved_at.getTime()).toBeLessThanOrEqual(rows[0]!.settled_at.getTime());

      // The whole lifecycle, not just the pair above. Each of these instants is
      // stamped by a later transaction than the one before it, so on ONE clock
      // the chain is monotonic by construction. It is only orderable at all
      // because every column is written from the server's clock — read any one
      // of them from this process instead and the chain stops meaning anything.
      const { created_at, escrowed_at, resolved_at, settled_at } = rows[0]!;
      expect(created_at.getTime()).toBeLessThanOrEqual(escrowed_at.getTime());
      expect(escrowed_at.getTime()).toBeLessThanOrEqual(resolved_at.getTime());
      expect(resolved_at.getTime()).toBeLessThanOrEqual(settled_at.getTime());

      const dispute = await p2p.getDispute(trade.id);
      expect(dispute).toMatchObject({ status: 'resolved', moderatorId: MODERATOR, resolution: 'release' });
      expect(dispute.resolvedAt).not.toBeNull();

      // One ruling, one instant. Both rows are written in the moderator's single
      // transaction and `now()` is the TRANSACTION timestamp, so they record the
      // same moment exactly — two rows disagreeing about when a moderator
      // decided is the same audit-trail hole this test exists to rule out.
      expect(dispute.resolvedAt!.getTime()).toBe(resolved_at.getTime());
    });

    it('refuses a second dispute on the same trade', async () => {
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'first' });
      await expect(p2p.openDispute({ tradeId: trade.id, openedBy: MAKER, reason: 'second' })).rejects.toBeInstanceOf(TradeStateError);
    });

    it('refuses a second ruling on a resolved dispute', async () => {
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });
      await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'release' });

      // Caught on the dispute row, before the trade's own terminal guard —
      // a moderator gets told the ruling already exists, not that the trade
      // happens to be finished.
      await expect(p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'refund' })).rejects.toMatchObject({
        code: 'p2p.dispute_already_resolved',
      });

      // And nothing moved a second time.
      expect(await availableOf(TAKER)).toBe('99');
      expect(await availableOf(MAKER)).toBe('900');
      await expectBooksClosed();
    });

    it('lets only a party open a dispute', async () => {
      const trade = await escrowedTrade('100');
      await expect(p2p.openDispute({ tradeId: trade.id, openedBy: OTHER, reason: 'nosy' })).rejects.toMatchObject({
        code: 'p2p.not_a_party',
      });
    });

    it('refuses a dispute on a trade with nothing in escrow', async () => {
      const offer = await sellOffer();
      // Seller has no balance, so the take fails and voids the trade.
      await expect(
        p2p.takeOffer({
          offerId: offer.id,
          takerId: TAKER,
          amount: amt('100'),
          method: 'sepa',
          tradeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      ).rejects.toThrow();

      await expect(
        p2p.openDispute({ tradeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', openedBy: TAKER, reason: 'x' }),
      ).rejects.toBeInstanceOf(TradeStateError);
    });

    it('records the loser of the dispute on their reputation', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });
      await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'release' });

      // Released to the buyer means the seller lost.
      expect((await p2p.reputationOf(MAKER)).disputesLost).toBe(1);
      expect((await p2p.reputationOf(TAKER)).disputesLost).toBe(0);
    });
  });

  // ── The moderator queue, and the evidence in it ───────────────────────────

  /**
   * WHAT THIS BLOCK IS FOR.
   *
   * `p2p.disputes` shipped as "moderated dispute resolution ✅" while a
   * moderator could not reach a dispute even if they wanted to: no queue, no
   * readable evidence, and a timer that refunded everything after seven days.
   * These tests are the four halves of "a human could have reached it".
   */
  describe('the moderator queue', () => {
    /** Open a dispute on a fresh escrowed trade, with optional evidence. */
    async function disputedTrade(evidence?: readonly unknown[], opener = TAKER) {
      const trade = await escrowedTrade('100');
      await p2p.openDispute({
        tradeId: trade.id,
        openedBy: opener,
        reason: 'nothing arrived',
        ...(evidence ? { evidence } : {}),
      });
      return trade;
    }

    it('enumerates open disputes, most overdue first', async () => {
      // The index that serves this — `p2p_disputes_open_idx` on
      // (status, deadline_at) — existed from the first migration and nothing
      // queried it. A moderator could only call `.get({ tradeId })`, which
      // requires already knowing the id of a dispute you have never seen.
      const a = await disputedTrade();
      const b = await disputedTrade();
      const c = await disputedTrade();

      // Make `b` the most overdue and `c` the least.
      await sql`UPDATE p2p.p2p_disputes SET deadline_at = now() - interval '3 days' WHERE trade_id = ${b.id}`;
      await sql`UPDATE p2p.p2p_disputes SET deadline_at = now() - interval '1 day'  WHERE trade_id = ${a.id}`;
      await sql`UPDATE p2p.p2p_disputes SET deadline_at = now() + interval '1 day'  WHERE trade_id = ${c.id}`;

      const page = await p2p.listDisputes({ moderatorId: MODERATOR });
      expect(page.disputes.map((d) => d.tradeId)).toEqual([b.id, a.id, c.id]);
      expect(page.nextCursor).toBeNull();
    });

    it('paginates by keyset, so nothing resolved mid-read can hide a dispute', async () => {
      const trades = [];
      for (let i = 0; i < 5; i++) trades.push(await disputedTrade());
      // Distinct deadlines, ascending in creation order.
      for (const [i, t] of trades.entries()) {
        await sql`UPDATE p2p.p2p_disputes SET deadline_at = now() + ${`${i} hours`}::interval WHERE trade_id = ${t.id}`;
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: Awaited<ReturnType<typeof p2p.listDisputes>> = await p2p.listDisputes({
          moderatorId: MODERATOR,
          limit: 2,
          cursor,
        });
        seen.push(...page.disputes.map((d) => d.tradeId));
        cursor = page.nextCursor;
        if (!cursor) break;
      }

      expect(seen).toEqual(trades.map((t) => t.id));
      expect(new Set(seen).size).toBe(5);
    });

    it('only lists what was asked for: resolved disputes are not in the open queue', async () => {
      const open = await disputedTrade();
      const ruled = await disputedTrade();
      await p2p.resolveDispute({ tradeId: ruled.id, moderatorId: MODERATOR, resolution: 'refund' });

      expect((await p2p.listDisputes({ moderatorId: MODERATOR })).disputes.map((d) => d.tradeId)).toEqual([open.id]);
      expect((await p2p.listDisputes({ moderatorId: MODERATOR, status: 'resolved' })).disputes.map((d) => d.tradeId)).toEqual([ruled.id]);
    });

    /**
     * THE ONE THAT MAKES "REACHABLE" A FACT RATHER THAN A CLAIM.
     *
     * A queue endpoint existing is a property of our repository. A row having
     * been served to a moderator is a property of the world, and it is the only
     * one of the two that survives "nobody can hold the scope".
     */
    it('records that a moderator was actually served the dispute, and cannot serve it without recording', async () => {
      const trade = await disputedTrade();
      expect((await p2p.getDispute(trade.id)).lastSeenByModeratorAt).toBeNull();

      // A PARTY reading their own dispute is not evidence of moderation.
      await p2p.getDispute(trade.id);
      expect((await p2p.getDispute(trade.id)).lastSeenByModeratorAt).toBeNull();
      expect((await p2p.getDispute(trade.id)).moderatorViews).toBe(0);

      await p2p.listDisputes({ moderatorId: MODERATOR });
      const seen = await p2p.getDispute(trade.id);
      expect(seen.lastSeenByModeratorAt).not.toBeNull();
      expect(seen.moderatorViews).toBe(1);

      await p2p.getDisputeAsModerator(trade.id, MODERATOR);
      expect((await p2p.getDispute(trade.id)).moderatorViews).toBe(2);
    });

    it('counts the backlog an operator has to act on', async () => {
      const overdue = await disputedTrade();
      await disputedTrade();
      await sql`UPDATE p2p.p2p_disputes SET deadline_at = now() - interval '1 day' WHERE trade_id = ${overdue.id}`;

      expect(await p2p.moderationBacklog()).toEqual({ open: 2, overdue: 1, escalated: 0, neverSeen: 2 });

      await p2p.listDisputes({ moderatorId: MODERATOR });
      expect(await p2p.moderationBacklog()).toMatchObject({ neverSeen: 0 });
    });
  });

  describe('dispute evidence', () => {
    async function disputedTrade(evidence?: readonly unknown[], opener = TAKER) {
      const trade = await escrowedTrade('100');
      await p2p.openDispute({
        tradeId: trade.id,
        openedBy: opener,
        reason: 'nothing arrived',
        ...(evidence ? { evidence } : {}),
      });
      return trade;
    }

    it('serialises evidence at all — it used to be write-only', async () => {
      // Accepted by `openDispute`, stored in `p2p_disputes.evidence`, carried on
      // `DisputeRecord`, and never returned by anything. A moderator could not
      // read what they were ruling on.
      const trade = await disputedTrade([{ kind: 'receipt', ref: 'BANK-1' }]);
      const dispute = await p2p.getDispute(trade.id);

      expect(dispute.evidence).toHaveLength(1);
      expect(dispute.evidence[0]).toMatchObject({ seq: 1, submittedBy: TAKER, item: { kind: 'receipt', ref: 'BANK-1' } });
      expect(dispute.evidence[0]!.submittedAt).toBeInstanceOf(Date);
    });

    it('attributes evidence filed at open, not just evidence appended later', async () => {
      const trade = await disputedTrade(['a', 'b'], MAKER);
      const dispute = await p2p.getDispute(trade.id);
      expect(dispute.evidence.map((e) => e.submittedBy)).toEqual([MAKER, MAKER]);
      expect(dispute.evidence.map((e) => e.seq)).toEqual([1, 2]);
    });

    it('lets a party append evidence they obtained after opening', async () => {
      // The gap this closes: evidence could only be supplied in the single
      // `disputes.open` call, and a dispute opened by the release TIMEOUT
      // carries a reason and nothing else — so the party handed a dispute they
      // did not ask for had nowhere to put anything at all.
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await expire(trade.id);
      await p2p.sweepDeadlines();

      expect((await p2p.getDispute(trade.id)).evidence).toEqual([]);

      await p2p.appendDisputeEvidence({ tradeId: trade.id, actorId: TAKER, evidence: [{ receipt: 'late' }] });
      await p2p.appendDisputeEvidence({ tradeId: trade.id, actorId: MAKER, evidence: [{ statement: 'nothing landed' }] });

      const dispute = await p2p.getDispute(trade.id);
      expect(dispute.evidence.map((e) => [e.seq, e.submittedBy])).toEqual([
        [1, TAKER],
        [2, MAKER],
      ]);
    });

    it('lets only a party append', async () => {
      const trade = await disputedTrade();
      await expect(p2p.appendDisputeEvidence({ tradeId: trade.id, actorId: OTHER, evidence: ['x'] })).rejects.toMatchObject({
        code: 'p2p.not_a_party',
      });
    });

    it('refuses evidence once the dispute has been ruled on', async () => {
      // The record a ruling was made against must stay the record the ruling
      // was made against.
      const trade = await disputedTrade();
      await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'refund' });

      await expect(p2p.appendDisputeEvidence({ tradeId: trade.id, actorId: TAKER, evidence: ['too late'] })).rejects.toMatchObject({
        code: 'p2p.dispute_already_resolved',
      });
    });

    it('caps what one call and one dispute can carry', async () => {
      const trade = await disputedTrade();
      await expect(
        p2p.appendDisputeEvidence({ tradeId: trade.id, actorId: TAKER, evidence: Array.from({ length: 11 }, (_, i) => i) }),
      ).rejects.toMatchObject({ code: 'p2p.dispute_evidence_rejected' });

      await expect(p2p.appendDisputeEvidence({ tradeId: trade.id, actorId: TAKER, evidence: ['x'.repeat(9_000)] })).rejects.toMatchObject({
        code: 'p2p.dispute_evidence_rejected',
      });

      expect((await p2p.getDispute(trade.id)).evidence).toEqual([]);
    });

    /**
     * APPEND-ONLY, PROVEN AT THE LEVEL THAT MATTERS.
     *
     * The service having no update verb is a fact about this codebase today.
     * The trigger is a fact about the database, and it is the one that holds
     * against a fixture script, a migration, and whoever adds the next write
     * path without reading `appendDisputeEvidence`.
     */
    it('the DATABASE refuses to edit, reorder or remove evidence', async () => {
      const trade = await disputedTrade(['first', 'second']);

      await expect(sql`
        UPDATE p2p.p2p_disputes SET evidence = '[]'::jsonb WHERE trade_id = ${trade.id}
      `).rejects.toThrow(/append-only/);

      await expect(sql`
        UPDATE p2p.p2p_disputes
           SET evidence = jsonb_set(evidence, '{0,item}', '"tampered"'::jsonb)
         WHERE trade_id = ${trade.id}
      `).rejects.toThrow(/append-only/);

      // Same length, contents swapped — the length check alone would miss this.
      await expect(sql`
        UPDATE p2p.p2p_disputes
           SET evidence = jsonb_build_array(evidence -> 1, evidence -> 0)
         WHERE trade_id = ${trade.id}
      `).rejects.toThrow(/append-only/);

      // Appending is the one thing that works.
      await sql`
        UPDATE p2p.p2p_disputes
           SET evidence = evidence || '[{"seq":3,"submittedBy":"x","submittedAt":"2026-01-01T00:00:00.000Z","item":"third"}]'::jsonb
         WHERE trade_id = ${trade.id}
      `;
      expect((await p2p.getDispute(trade.id)).evidence).toHaveLength(3);
    });

    it('the DATABASE refuses evidence that is not a bounded array', async () => {
      const trade = await disputedTrade();
      await expect(sql`
        UPDATE p2p.p2p_disputes SET evidence = '{"not":"an array"}'::jsonb WHERE trade_id = ${trade.id}
      `).rejects.toThrow();
    });

    it('does not attribute evidence it cannot attribute', async () => {
      // Rows written before evidence carried an envelope come back
      // `submittedBy: null` rather than being assigned to the dispute's opener.
      // A guess recorded as a fact is how an audit trail starts lying, and this
      // one would be lying about who accused whom.
      const trade = await disputedTrade();
      await sql`
        UPDATE p2p.p2p_disputes SET evidence = '["a legacy bare item"]'::jsonb WHERE trade_id = ${trade.id}
      `;

      const dispute = await p2p.getDispute(trade.id);
      expect(dispute.evidence[0]).toMatchObject({ seq: 1, submittedBy: null, submittedAt: null, item: 'a legacy bare item' });
    });
  });

  // ── The invariants, tested to destruction ─────────────────────────────────

  describe('INVARIANT: no path releases twice', () => {
    it('rejects a second release and moves value exactly once', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await p2p.confirmFiatReceived(trade.id, MAKER);

      await expect(p2p.confirmFiatReceived(trade.id, MAKER)).rejects.toMatchObject({ code: 'p2p.trade_terminal' });

      expect(await availableOf(TAKER)).toBe('99');
      expect(await houseOf()).toBe('1');
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('survives eight concurrent releases without double-paying', async () => {
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          p2p
            .confirmFiatReceived(trade.id, MAKER)
            .then(() => 'ok' as const)
            .catch(() => 'rejected' as const),
        ),
      );

      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      expect(await availableOf(TAKER)).toBe('99');
      await expectBooksClosed();
    });

    it('posts exactly one ledger transaction for the release', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);
      // Calling settle again is a no-op, not a second post.
      await p2p.settle(trade.id);

      const releases = ledger.journal().filter((tx) => tx.reason === 'p2p.escrow.release');
      expect(releases).toHaveLength(1);
      expect(await availableOf(TAKER)).toBe('99');
    });
  });

  describe('INVARIANT: no path releases to both parties', () => {
    it('refuses a refund after a release', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      await expect(p2p.cancelTrade(trade.id, TAKER)).rejects.toMatchObject({ code: 'p2p.trade_terminal' });

      expect(await availableOf(TAKER)).toBe('99');
      expect(await availableOf(MAKER)).toBe('900');
      await expectBooksClosed();
    });

    it('refuses a release after a refund', async () => {
      const trade = await escrowedTrade('100');
      await p2p.cancelTrade(trade.id, TAKER);

      await expect(p2p.confirmFiatReceived(trade.id, MAKER)).rejects.toMatchObject({ code: 'p2p.trade_terminal' });

      expect(await availableOf(MAKER)).toBe('1000');
      expect(await availableOf(TAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('lets a concurrent release and refund race produce exactly one winner', async () => {
      const trade = await escrowedTrade('100');

      const [release, refund] = await Promise.all([
        p2p
          .confirmFiatReceived(trade.id, MAKER)
          .then(() => 'ok' as const)
          .catch(() => 'rejected' as const),
        p2p
          .cancelTrade(trade.id, TAKER)
          .then(() => 'ok' as const)
          .catch(() => 'rejected' as const),
      ]);

      expect([release, refund].filter((r) => r === 'ok')).toHaveLength(1);

      // Whichever won, the 100 went to exactly one place and the books close.
      const buyer = amt(await availableOf(TAKER));
      const seller = amt(await availableOf(MAKER));
      const house = amt(await houseOf());
      expect(buyer + seller + house).toBe(amt('1000'));
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('makes the double resolution unrepresentable in the database', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      // Even going behind the service, the row physically cannot claim both.
      await expect(sql`UPDATE p2p.p2p_trades SET resolution = 'refunded' WHERE id = ${trade.id}`).rejects.toThrow(
        /p2p_trades_resolution_matches_status_ck/,
      );
    });

    it('refuses a terminal trade a deadline, so the sweeper can never re-resolve it', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      await expect(sql`UPDATE p2p.p2p_trades SET deadline_at = now() WHERE id = ${trade.id}`).rejects.toThrow(
        /p2p_trades_terminal_has_no_deadline_ck/,
      );
    });
  });

  describe('INVARIANT: release requires an escrow that provably exists', () => {
    it('rejects a release on a trade that never escrowed', async () => {
      // Reserve a trade but never let it lock: the seller has no balance.
      const offer = await sellOffer();
      const tradeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa', tradeId })).rejects.toThrow();

      // The failed take voided it rather than leaving it in limbo.
      const trade = await p2p.getTrade(tradeId);
      expect(trade.status).toBe('cancelled');
      expect(trade.resolution).toBe('voided');

      await expect(p2p.confirmFiatReceived(tradeId, MAKER)).rejects.toMatchObject({ code: 'p2p.trade_terminal' });
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('posts NOTHING at all for a voided trade', async () => {
      const offer = await sellOffer();
      const tradeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa', tradeId })).rejects.toThrow();

      // No lock, no refund, no release. A refund here would have paid the seller
      // out of a pooled escrow account holding somebody else's trade.
      expect(ledger.journal().filter((tx) => tx.module === 'p2p')).toHaveLength(0);
      await expectBooksClosed();
    });

    it('never refunds a never-locked trade out of ANOTHER trade’s escrow', async () => {
      // The seller has exactly enough for one trade. Trade A locks it; trade B
      // is reserved and then fails to lock. B must not be refunded — the 100 in
      // the seller's escrow account belongs to A.
      await fund(MAKER, '100');
      const offerA = await sellOffer();
      const tradeA = await p2p.takeOffer({ offerId: offerA.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });

      const offerB = await sellOffer();
      const tradeBId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      await expect(
        p2p.takeOffer({ offerId: offerB.id, takerId: OTHER, amount: amt('100'), method: 'sepa', tradeId: tradeBId }),
      ).rejects.toThrow();

      expect((await p2p.getTrade(tradeBId)).resolution).toBe('voided');
      // A's escrow is untouched and still fully backs A.
      expect(await escrowOf(MAKER)).toBe('100');

      await p2p.confirmFiatReceived(tradeA.id, MAKER);
      expect(await availableOf(TAKER)).toBe('99');
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('rejects marking fiat sent on a trade with no escrow', async () => {
      const offer = await sellOffer();
      const tradeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa', tradeId })).rejects.toThrow();

      await expect(p2p.markFiatSent(tradeId, TAKER)).rejects.toBeInstanceOf(TradeStateError);
    });
  });

  describe('INVARIANT: bounds are enforced before any lock', () => {
    it('rejects more than the offer maximum and locks nothing', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer();

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('501'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.amount_above_max',
      });

      expect(await escrowOf(MAKER)).toBe('0');
      expect(await availableOf(MAKER)).toBe('10000');
      expect(await sql`SELECT id FROM p2p.p2p_trades`).toHaveLength(0);
    });

    it('rejects less than the offer minimum and locks nothing', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer();

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('9.99'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.amount_below_min',
      });

      expect(await escrowOf(MAKER)).toBe('0');
      expect(await sql`SELECT id FROM p2p.p2p_trades`).toHaveLength(0);
    });

    it('rejects more than the offer has left even when inside the per-trade max', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ maxAmt: amt('400'), totalAmt: amt('500') });
      await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('400'), method: 'sepa' });

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: OTHER, amount: amt('200'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.insufficient_offer_liquidity',
      });

      expect(await escrowOf(MAKER)).toBe('400');
    });

    it('rejects a maker taking their own offer', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer();
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: MAKER, amount: amt('100'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.self_trade',
      });
      expect(await escrowOf(MAKER)).toBe('0');
    });

    it('refuses a NEW offer that declares no payment methods', async () => {
      // An offer with no declared methods accepts anything, so the only thing
      // that can refuse a take on it is the seller's instrument set — which
      // turns every such offer into a clean per-method probe of its own maker.
      // Existing offers are left alone and refuse at take, honestly.
      await expect(sellOffer({ methods: [] })).rejects.toMatchObject({ code: 'p2p.offer_methods_required' });
      await expect(sellOffer({ methods: undefined })).rejects.toMatchObject({ code: 'p2p.offer_methods_required' });
    });

    it('rejects a payment method the offer does not accept', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ methods: ['sepa'] });
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'wise' })).rejects.toMatchObject({
        code: 'p2p.take_refused',
      });
      expect(await escrowOf(MAKER)).toBe('0');
    });

    it('rejects a take against a closed offer', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer();
      await p2p.closeOffer(offer.id, MAKER);

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.offer_not_active',
      });
    });

    it('refuses a floating offer when the reference price is unavailable', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ priceType: 'float', price: amt('1.02') });
      reference.price = null;

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.reference_price_unavailable',
      });

      expect(await escrowOf(MAKER)).toBe('0');
    });

    it('prices a floating offer off the reference when one is available', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ priceType: 'float', price: amt('1.02') });
      reference.price = '0.995';

      const trade = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });
      // 0.995 × 1.02 = 1.0149 → 100 × 1.0149 = $101.49
      expect(formatAmount(trade.fiatAmount)).toBe('101.49');

      // And the price is frozen: moving the mark does not re-price the trade.
      reference.price = '2';
      expect(formatAmount((await p2p.getTrade(trade.id)).price)).toBe('1.0149');
    });
  });

  describe('INVARIANT: concurrent takers — only one escrows', () => {
    it('lets exactly one of six concurrent takers get the last of the inventory', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ minAmt: amt('500'), maxAmt: amt('500'), totalAmt: amt('500') });

      const takers = [
        TAKER,
        OTHER,
        MODERATOR,
        '55555555-5555-4555-8555-555555555555',
        '66666666-6666-4666-8666-666666666666',
        '77777777-7777-4777-8777-777777777777',
      ];

      const results = await Promise.all(
        takers.map((takerId) =>
          p2p
            .takeOffer({ offerId: offer.id, takerId, amount: amt('500'), method: 'sepa' })
            .then(() => 'ok' as const)
            .catch(() => 'rejected' as const),
        ),
      );

      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      // Exactly one escrow, of exactly the right size.
      expect(await escrowOf(MAKER)).toBe('500');
      expect(await availableOf(MAKER)).toBe('9500');

      const trades = await sql<Array<{ status: string }>>`SELECT status FROM p2p.p2p_trades`;
      expect(trades).toHaveLength(1);
      expect(trades[0]!.status).toBe('escrowed');
      await expectBooksClosed();
    });

    it('splits an offer between concurrent takers without over-drawing it', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ minAmt: amt('100'), maxAmt: amt('100'), totalAmt: amt('300') });

      const takers = ['a', 'b', 'c', 'd', 'e'].map((s) => `${s}0000000-0000-4000-8000-000000000000`);
      const results = await Promise.all(
        takers.map((takerId) =>
          p2p
            .takeOffer({ offerId: offer.id, takerId, amount: amt('100'), method: 'sepa' })
            .then(() => 'ok' as const)
            .catch(() => 'rejected' as const),
        ),
      );

      // Three units of 100 available, five takers.
      expect(results.filter((r) => r === 'ok')).toHaveLength(3);
      expect(await escrowOf(MAKER)).toBe('300');
      expect(formatAmount((await p2p.getOffer(offer.id)).remainingAmt)).toBe('0');
      await expectBooksClosed();
    });

    it('never lets the offer’s remaining amount go negative', async () => {
      await fund(MAKER, '100000');
      const offer = await sellOffer({ minAmt: amt('10'), maxAmt: amt('500'), totalAmt: amt('500') });

      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          p2p
            .takeOffer({
              offerId: offer.id,
              takerId: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
              amount: amt('100'),
              method: 'sepa',
            })
            .catch(() => undefined),
        ),
      );

      const remaining = (await p2p.getOffer(offer.id)).remainingAmt;
      expect(remaining >= 0n).toBe(true);
      expect(await escrowOf(MAKER)).toBe(formatAmount(amt('500') - remaining));
      await expectBooksClosed();
    });
  });

  // ── Timeouts ──────────────────────────────────────────────────────────────

  describe('TIMEOUTS — an abandoned trade always resolves, and a disputed one never does', () => {
    it('refunds an escrowed trade the buyer never paid for', async () => {
      const trade = await escrowedTrade('100');
      await expire(trade.id);

      const result = await p2p.sweepDeadlines();
      expect(result).toMatchObject({ swept: 1, failed: 0, escalated: 0, failures: [] });

      const after = await p2p.getTrade(trade.id);
      expect(after.status).toBe('cancelled');
      expect(after.resolution).toBe('refunded');
      expect(after.resolutionReason).toBe('timeout.payment_window_elapsed');
      expect(await availableOf(MAKER)).toBe('1000');
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('does NOT auto-release a trade the buyer merely claimed to have paid for', async () => {
      // It opens a dispute instead. Auto-releasing would hand the asset to
      // anyone willing to click "I paid" and wait out the clock.
      const trade = await escrowedTrade('100');
      await p2p.markFiatSent(trade.id, TAKER);
      await expire(trade.id);

      await p2p.sweepDeadlines();

      const after = await p2p.getTrade(trade.id);
      expect(after.status).toBe('disputed');
      expect(await availableOf(TAKER)).toBe('0');
      expect(await escrowOf(MAKER)).toBe('100');

      const dispute = await p2p.getDispute(trade.id);
      expect(dispute.status).toBe('open');
      expect(dispute.reason).toBe('timeout.seller_did_not_confirm');
    });

    it('ESCALATES a dispute no moderator ruled on — and moves nothing', async () => {
      // THE ONE THIS SERVICE USED TO GET WRONG. A 7-day timer refunded the
      // buyer, attributed the refund to `system:p2p-backstop`, and recorded it
      // as a resolution — while there was no queue to find the dispute in, no
      // way to read its evidence, and no session that could hold
      // `admin:compliance`. Two people disagreed and a clock picked one.
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });
      await expire(trade.id);

      const swept = await p2p.sweepDeadlines();
      expect(swept).toMatchObject({ escalated: 1, swept: 0, failed: 0 });

      const after = await p2p.getTrade(trade.id);
      expect(after.status).toBe('disputed');
      expect(after.resolution).toBeNull();
      // The escrow is exactly where it was.
      expect(await escrowOf(MAKER)).toBe('100');
      expect(await availableOf(MAKER)).toBe('900');
      expect(await availableOf(TAKER)).toBe('0');
      expect(bus.emitted('p2pDisputeResolved')).toHaveLength(0);

      const dispute = await p2p.getDispute(trade.id);
      expect(dispute.status).toBe('open');
      expect(dispute.escalations).toBe(1);
      expect(dispute.escalatedAt).not.toBeNull();
      await expectBooksClosed();
    });

    it('re-arms rather than resolving, so the live-deadline constraint still holds', async () => {
      // `p2p_trades_live_has_deadline_ck` makes "sits in escrow with no clock on
      // it" unrepresentable, correctly. The constraint requires a live trade to
      // carry a DEADLINE; it does not require the deadline to dispose of value.
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });
      // Age both halves of the SLA the way real time would: the trade's mirror
      // of it (what the sweeper scans) and the dispute's own record of it.
      await expire(trade.id);
      await sql`UPDATE p2p.p2p_disputes SET deadline_at = now() - interval '1 hour' WHERE trade_id = ${trade.id}`;
      await p2p.sweepDeadlines();

      const rows = await sql<Array<{ deadline_at: Date | null }>>`
        SELECT deadline_at FROM p2p.p2p_trades WHERE id = ${trade.id}
      `;
      expect(rows[0]!.deadline_at).not.toBeNull();
      expect(rows[0]!.deadline_at!.getTime()).toBeGreaterThan(Date.now());

      // The DISPUTE's own deadline stays in the past on purpose: it is the SLA,
      // the SLA was missed, and the moderator queue orders by it. Moving it
      // would push the most neglected dispute to the bottom of the list.
      const dispute = await p2p.getDispute(trade.id);
      expect(dispute.deadlineAt.getTime()).toBeLessThan(Date.now());
    });

    it('never gives up: a dispute nobody rules on escalates again, forever, and still holds the escrow', async () => {
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });

      for (let i = 1; i <= 5; i++) {
        await expire(trade.id);
        const swept = await p2p.sweepDeadlines();
        expect(swept.escalated).toBe(1);
        expect((await p2p.getDispute(trade.id)).escalations).toBe(i);
      }

      expect((await p2p.getTrade(trade.id)).resolution).toBeNull();
      expect(await escrowOf(MAKER)).toBe('100');
      await expectBooksClosed();
    });

    it('the DATABASE refuses to terminate a disputed escrow without an attributed human ruling', async () => {
      // The last line of defence, and the one a future re-introduction of a
      // timer would actually hit. Not a service check — a trigger, so it holds
      // against psql, a fixture script, and a well-meaning patch.
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });

      await expect(sql`
        UPDATE p2p.p2p_trades
           SET status = 'cancelled', resolution = 'refunded', resolution_reason = 'timeout.backstop',
               resolved_at = now(), deadline_at = NULL
         WHERE id = ${trade.id}
      `).rejects.toThrow(/only on a human ruling/);

      // And a `system:` moderator does not satisfy it either — attributing an
      // automatic decision to a named robot was exactly the old shape.
      await sql`
        UPDATE p2p.p2p_disputes
           SET status = 'resolved', moderator_id = 'system:p2p-backstop', resolution = 'refund', resolved_at = now()
         WHERE trade_id = ${trade.id}
      `;
      await expect(sql`
        UPDATE p2p.p2p_trades
           SET status = 'cancelled', resolution = 'refunded', resolution_reason = 'timeout.backstop',
               resolved_at = now(), deadline_at = NULL
         WHERE id = ${trade.id}
      `).rejects.toThrow(/only on a human ruling/);

      expect((await p2p.getTrade(trade.id)).resolution).toBeNull();
    });

    it('unwinds a trade that was reserved but never escrowed', async () => {
      // The `created` window: nothing is locked, but the trade must still die.
      const trade = await escrowedTrade('100');
      await sql`
        UPDATE p2p.p2p_trades
           SET status = 'created', escrowed_at = NULL, deadline_at = now() - interval '1 hour'
         WHERE id = ${trade.id}
      `;

      await p2p.sweepDeadlines();

      const after = await p2p.getTrade(trade.id);
      // The sweep re-drove `escrowLock`, found it already posted (idempotency),
      // and therefore knew there WAS escrow to return.
      expect(after.status).toBe('cancelled');
      expect(after.resolution).toBe('refunded');
      expect(await availableOf(MAKER)).toBe('1000');
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });

    it('voids a `created` trade whose lock never posted and never could', async () => {
      const offer = await sellOffer();
      const tradeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa', tradeId })).rejects.toThrow();

      // Already terminal. The sweep has nothing to pick up, which is the point.
      const due = await sql`SELECT id FROM p2p.p2p_trades WHERE deadline_at IS NOT NULL`;
      expect(due).toHaveLength(0);
      expect((await p2p.getTrade(tradeId)).resolution).toBe('voided');
    });

    it('leaves terminal trades alone', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      const result = await p2p.sweepDeadlines();
      expect(result.swept).toBe(0);
      expect(await availableOf(TAKER)).toBe('99');
    });

    it('emits an expiry event naming the state it timed out from', async () => {
      const trade = await escrowedTrade('100');
      await expire(trade.id);
      await p2p.sweepDeadlines();

      expect(bus.emitted('p2pTradeExpired')[0]?.payload).toMatchObject({
        tradeId: trade.id,
        from: 'escrowed',
        outcome: 'refunded',
      });
    });

    /**
     * THE REASON, NOT JUST THE COUNT.
     *
     * Both sweeps used to `catch { failed++ }` and discard the error object.
     * The cost showed up for real: the escrow guard refused a write with a
     * perfectly clear sentence, this line ate it, and the refusal surfaced two
     * branches away as an assertion failure that named nothing. A settlement
     * failure is the sharpest case of all — a committed decision with no
     * ledger post is value that is LATE, and `escrowIntegrity()` counts it as
     * still escrowed, correctly, so it does not flag either.
     */
    it('says WHY a settlement failed instead of counting it and moving on', async () => {
      const trade = await escrowedTrade('100');

      // A ledger that refuses to post, so the decision commits and the money
      // does not move — the one window in which P2P value can be late.
      const brokenLedger = {
        post: async () => {
          throw new Error('ledger unavailable');
        },
        balance: (account: Parameters<typeof ledger.balance>[0]) => ledger.balance(account),
        balances: (kind: string, id: string) => (ledger.balances as (k: string, i: string) => unknown)(kind, id),
      } as unknown as MemoryLedger;

      const breaking = new P2pService(sql, brokenLedger, bus, options);
      await expect(breaking.confirmFiatReceived(trade.id, MAKER)).rejects.toThrow('ledger unavailable');

      const result = await breaking.sweepSettlements();
      expect(result.settled).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({ tradeId: trade.id, error: 'ledger unavailable' });

      // And the decision is still on the row, so the next sweep re-drives it.
      expect((await p2p.getTrade(trade.id)).resolution).toBe('released');
      expect((await p2p.getTrade(trade.id)).settledAt).toBeNull();
      expect((await p2p.sweepSettlements()).settled).toBe(1);
    });

    it('names the trade and the guard when a timeout sweep is refused', async () => {
      // Reaching this needs the escrow guard to refuse, which nothing in the
      // service does any more — so the trade row is put into the one shape the
      // trigger objects to, directly. That is the point: if a future change
      // reintroduces a path that tries to terminate a disputed escrow, the
      // sweep reports the sentence rather than a number.
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });

      const failure = await sql`
        UPDATE p2p.p2p_trades SET status = 'cancelled', resolution = 'refunded', resolution_reason = 'x',
                                  resolved_at = now(), deadline_at = NULL
         WHERE id = ${trade.id}
      `.catch((e: unknown) => e as Error);

      expect((failure as Error).message).toMatch(/only on a human ruling/);
      // The sweep's own shape carries that same string when it happens there.
      expect((await p2p.getTrade(trade.id)).resolution).toBeNull();
    });

    it('keeps sweeping after one trade fails', async () => {
      const a = await escrowedTrade('100');
      const offer = await sellOffer();
      const b = await p2p.takeOffer({ offerId: offer.id, takerId: OTHER, amount: amt('100'), method: 'sepa' });

      await expire(a.id);
      await expire(b.id);

      const result = await p2p.sweepDeadlines();
      expect(result.swept).toBe(2);
      expect(await escrowOf(MAKER)).toBe('0');
      await expectBooksClosed();
    });
  });

  // ── The settlement sweep — decided, but not yet posted ────────────────────

  describe('DECIDE THEN POST — a decision is never lost', () => {
    it('posts a resolution that was recorded but never settled', async () => {
      const trade = await escrowedTrade('100');

      // Simulate a crash between the decision transaction and the ledger post:
      // resolution recorded, settled_at still null, escrow still held.
      await sql`
        UPDATE p2p.p2p_trades
           SET status = 'released', resolution = 'released', resolution_reason = 'seller.confirmed',
               resolved_at = now(), deadline_at = NULL
         WHERE id = ${trade.id}
      `;

      expect(await escrowOf(MAKER)).toBe('100');
      const result = await p2p.sweepSettlements();

      expect(result).toMatchObject({ settled: 1, failed: 0, failures: [] });
      expect(await availableOf(TAKER)).toBe('99');
      expect(await houseOf()).toBe('1');
      expect(await escrowOf(MAKER)).toBe('0');
      expect((await p2p.getTrade(trade.id)).settledAt).not.toBeNull();
      await expectBooksClosed();
    });

    it('posts a refund that was recorded but never settled', async () => {
      const trade = await escrowedTrade('100');
      await sql`
        UPDATE p2p.p2p_trades
           SET status = 'cancelled', resolution = 'refunded', resolution_reason = 'buyer.cancelled',
               resolved_at = now(), deadline_at = NULL
         WHERE id = ${trade.id}
      `;

      await p2p.sweepSettlements();
      expect(await availableOf(MAKER)).toBe('1000');
      await expectBooksClosed();
    });

    it('is idempotent — a second sweep moves nothing', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      const again = await p2p.sweepSettlements();
      expect(again.settled).toBe(0);
      expect(await availableOf(TAKER)).toBe('99');
      await expectBooksClosed();
    });

    it('never leaves a decision unexecuted across a mixed run', async () => {
      const trades = [];
      await fund(MAKER, '10000');
      const offer = await sellOffer({ totalAmt: amt('500'), maxAmt: amt('100') });

      for (const taker of [TAKER, OTHER, MODERATOR]) {
        trades.push(await p2p.takeOffer({ offerId: offer.id, takerId: taker, amount: amt('100'), method: 'sepa' }));
      }

      await p2p.confirmFiatReceived(trades[0]!.id, MAKER);
      await p2p.cancelTrade(trades[1]!.id, MAKER);
      await p2p.openDispute({ tradeId: trades[2]!.id, openedBy: MAKER, reason: 'x' });
      await p2p.resolveDispute({ tradeId: trades[2]!.id, moderatorId: MODERATOR, resolution: 'refund' });

      const pending = await sql`SELECT id FROM p2p.p2p_trades WHERE resolved_at IS NOT NULL AND settled_at IS NULL`;
      expect(pending).toHaveLength(0);
    });
  });

  // ── Reputation ────────────────────────────────────────────────────────────

  describe('REPUTATION → the one XP graph (§6.2 → §4.1)', () => {
    it('counts a trade from escrow, not from take', async () => {
      const offer = await sellOffer();
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' })).rejects.toThrow();

      // The failed take cost the counterparty nothing.
      expect((await p2p.reputationOf(MAKER)).tradesTotal).toBe(0);
      expect((await p2p.reputationOf(TAKER)).tradesTotal).toBe(0);
    });

    it('records a completion for both parties and an average release time', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      const maker = await p2p.reputationOf(MAKER);
      expect(maker).toMatchObject({ tradesTotal: 1, completed: 1, completionRate: 1 });
      expect(maker.badges).toContain('first-trade');
      expect(maker.avgReleaseSecs).toBeGreaterThanOrEqual(0);

      expect(await p2p.reputationOf(TAKER)).toMatchObject({ tradesTotal: 1, completed: 1 });
    });

    it('drops the completion rate on a cancel', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ maxAmt: amt('100'), totalAmt: amt('500') });

      const a = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });
      await p2p.confirmFiatReceived(a.id, MAKER);

      const b = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });
      await p2p.cancelTrade(b.id, TAKER);

      expect(await p2p.reputationOf(MAKER)).toMatchObject({ tradesTotal: 2, completed: 1, cancelled: 1, completionRate: 0.5 });
    });

    it('emits xpEarned for both parties on release, keyed on the trade', async () => {
      const trade = await escrowedTrade('100');
      await p2p.confirmFiatReceived(trade.id, MAKER);

      const awards = bus.emitted('xpEarned');
      expect(awards).toHaveLength(2);
      expect(awards.map((a) => a.payload.userId).sort()).toEqual([MAKER, TAKER].sort());
      expect(awards.every((a) => a.payload.sourceModule === 'p2p')).toBe(true);
      // Business keys, so a redelivered event finds svc-identity's original award.
      expect(awards.map((a) => a.idempotencyKey).sort()).toEqual(
        [`p2p:trade.completed.seller:${trade.id}:${MAKER}`, `p2p:trade.completed.buyer:${trade.id}:${TAKER}`].sort(),
      );
    });

    it('emits a NEGATIVE xpEarned for the party who lost a dispute', async () => {
      const trade = await escrowedTrade('100');
      await p2p.openDispute({ tradeId: trade.id, openedBy: TAKER, reason: 'x' });
      await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'refund' });

      const loss = bus.emitted('xpEarned').find((e) => e.payload.action === 'dispute.lost');
      expect(loss?.payload.userId).toBe(TAKER);
      expect(loss?.payload.xpDelta).toBeLessThan(0);
    });

    it('emits no XP for a cancel — nothing was achieved and nothing was lost', async () => {
      const trade = await escrowedTrade('100');
      await p2p.cancelTrade(trade.id, TAKER);
      expect(bus.emitted('xpEarned')).toHaveLength(0);
    });

    it('shows an unknown trader as empty, not as flawless', async () => {
      const snapshot = await p2p.reputationOf('99999999-9999-4999-8999-999999999999');
      expect(snapshot).toMatchObject({ tradesTotal: 0, completed: 0, completionRate: 0 });
      expect(snapshot.badges).toEqual([]);
    });
  });

  // ── Doctrine ──────────────────────────────────────────────────────────────

  describe('doctrine §0.6 — no balance outside the ledger', () => {
    it('agrees with the ledger about what is in escrow', async () => {
      await fund(MAKER, '10000');
      const offer = await sellOffer({ maxAmt: amt('100'), totalAmt: amt('500') });
      for (const taker of [TAKER, OTHER, MODERATOR]) {
        await p2p.takeOffer({ offerId: offer.id, takerId: taker, amount: amt('100'), method: 'sepa' });
      }

      expect(await p2p.escrowIntegrity()).toEqual({ ok: true });
      expect(await escrowOf(MAKER)).toBe('300');
    });

    it('still agrees when a decision is recorded but not yet posted', async () => {
      // A decided-but-unsettled trade still holds escrow — the post has not
      // happened — so it must count on this side too.
      const trade = await escrowedTrade('100');
      await sql`
        UPDATE p2p.p2p_trades
           SET status = 'released', resolution = 'released', resolution_reason = 'seller.confirmed',
               resolved_at = now(), deadline_at = NULL
         WHERE id = ${trade.id}
      `;

      expect(await p2p.escrowIntegrity()).toEqual({ ok: true });
      await p2p.sweepSettlements();
      expect(await p2p.escrowIntegrity()).toEqual({ ok: true });
    });

    it('holds no numeric balance of its own — `amount` never changes after take', async () => {
      const trade = await escrowedTrade('100');
      const before = await sql<Array<{ amount: string }>>`SELECT amount FROM p2p.p2p_trades WHERE id = ${trade.id}`;
      await p2p.confirmFiatReceived(trade.id, MAKER);
      const after = await sql<Array<{ amount: string }>>`SELECT amount FROM p2p.p2p_trades WHERE id = ${trade.id}`;

      expect(after[0]!.amount).toBe(before[0]!.amount);
    });
  });

  // ── Kill-switch ───────────────────────────────────────────────────────────

  describe('kill-switch', () => {
    it('stops new offers and new takes', async () => {
      await fund(MAKER, '1000');
      const offer = await sellOffer();
      p2p.setTradingEnabled(false);

      await expect(sellOffer()).rejects.toMatchObject({ code: 'p2p.trading_disabled' });
      await expect(p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' })).rejects.toMatchObject({
        code: 'p2p.trading_disabled',
      });
    });

    it('NEVER stops settlement — an open escrow must still be able to resolve', async () => {
      // A switch that could freeze settlement would be a switch that strands
      // every open escrow, which is the exact failure this service prevents.
      const trade = await escrowedTrade('100');
      p2p.setTradingEnabled(false);

      await expect(p2p.confirmFiatReceived(trade.id, MAKER)).resolves.toMatchObject({ status: 'released' });
      expect(await availableOf(TAKER)).toBe('99');

      const other = await escrowedTradeUnderSwitch();
      await expect(p2p.cancelTrade(other, MAKER)).resolves.toMatchObject({ resolution: 'refunded' });
      await expectBooksClosed();
    });

    async function escrowedTradeUnderSwitch(): Promise<string> {
      p2p.setTradingEnabled(true);
      const trade = await escrowedTrade('50');
      p2p.setTradingEnabled(false);
      return trade.id;
    }
  });

  // ── The full mixed run ────────────────────────────────────────────────────

  describe('MIXED RUN — reconcile stays clean end to end', () => {
    it('runs every branch against one book and closes it', async () => {
      await fund(MAKER, '5000');
      await fund(TAKER, '5000');

      const sell = await sellOffer({ maxAmt: amt('100'), totalAmt: amt('5000') });
      const buy = await p2p.createOffer({
        makerId: TAKER,
        side: 'buy',
        asset: ASSET,
        fiatCurrency: 'EUR',
        priceType: 'fixed',
        price: amt('0.92'),
        minAmt: amt('10'),
        maxAmt: amt('100'),
        totalAmt: amt('1000'),
        methods: ['sepa'],
      });

      const take = (offerId: string, takerId: string) => p2p.takeOffer({ offerId, takerId, amount: amt('100'), method: 'sepa' });

      // 1 — released via the full path
      const t1 = await take(sell.id, TAKER);
      await p2p.markFiatSent(t1.id, TAKER);
      await p2p.confirmFiatReceived(t1.id, MAKER);

      // 2 — cancelled by the buyer
      const t2 = await take(sell.id, TAKER);
      await p2p.cancelTrade(t2.id, TAKER);

      // 3 — disputed, moderator releases
      const t3 = await take(sell.id, OTHER);
      await p2p.markFiatSent(t3.id, OTHER);
      await p2p.openDispute({ tradeId: t3.id, openedBy: OTHER, reason: 'paid' });
      await p2p.resolveDispute({ tradeId: t3.id, moderatorId: MODERATOR, resolution: 'release' });

      // 4 — disputed, moderator refunds
      const t4 = await take(sell.id, OTHER);
      await p2p.openDispute({ tradeId: t4.id, openedBy: MAKER, reason: 'never paid' });
      await p2p.resolveDispute({ tradeId: t4.id, moderatorId: MODERATOR, resolution: 'refund' });

      // 5 — timed out in escrow
      const t5 = await take(sell.id, OTHER);
      await sql`UPDATE p2p.p2p_trades SET deadline_at = now() - interval '1 hour' WHERE id = ${t5.id}`;
      await p2p.sweepDeadlines();

      // 6 — the reverse direction, escrowing the taker
      const t6 = await take(buy.id, MAKER);
      await p2p.confirmFiatReceived(t6.id, MAKER);

      // 7 — a take that could never lock
      const broke = await p2p.createOffer({
        makerId: OTHER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency: 'USD',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('100'),
        methods: ['sepa'],
      });
      await expect(take(broke.id, TAKER)).rejects.toThrow();

      // Every trade terminal, every terminal trade settled.
      const open = await sql`SELECT id FROM p2p.p2p_trades WHERE resolution IS NULL`;
      expect(open).toHaveLength(0);
      const unsettled = await sql`SELECT id FROM p2p.p2p_trades WHERE settled_at IS NULL`;
      expect(unsettled).toHaveLength(0);

      // Nothing left locked anywhere.
      expect(await escrowOf(MAKER)).toBe('0');
      expect(await escrowOf(TAKER)).toBe('0');
      expect(await escrowOf(OTHER)).toBe('0');

      expect(await p2p.escrowIntegrity()).toEqual({ ok: true });
      await expectBooksClosed();
    });

    it('conserves total value exactly across the mixed run', async () => {
      await fund(MAKER, '1000');
      const offer = await sellOffer({ maxAmt: amt('100'), totalAmt: amt('1000') });

      const t1 = await p2p.takeOffer({ offerId: offer.id, takerId: TAKER, amount: amt('100'), method: 'sepa' });
      const t2 = await p2p.takeOffer({ offerId: offer.id, takerId: OTHER, amount: amt('100'), method: 'sepa' });
      const t3 = await p2p.takeOffer({ offerId: offer.id, takerId: MODERATOR, amount: amt('100'), method: 'sepa' });

      await p2p.confirmFiatReceived(t1.id, MAKER);
      await p2p.cancelTrade(t2.id, OTHER);
      await p2p.openDispute({ tradeId: t3.id, openedBy: MODERATOR, reason: 'x' });
      await p2p.resolveDispute({ tradeId: t3.id, moderatorId: MODERATOR, resolution: 'release' });

      const total =
        amt(await availableOf(MAKER)) +
        amt(await availableOf(TAKER)) +
        amt(await availableOf(OTHER)) +
        amt(await availableOf(MODERATOR)) +
        amt(await houseOf()) +
        amt(await escrowOf(MAKER));

      // Every unit deposited is still somewhere, and nowhere else.
      expect(formatAmount(total)).toBe('1000');
      await expectBooksClosed();
    });
  });

  describe('errors', () => {
    it('reports a missing trade rather than inventing one', async () => {
      await expect(p2p.getTrade('88888888-8888-4888-8888-888888888888')).rejects.toBeInstanceOf(P2pError);
      await expect(p2p.getTrade('88888888-8888-4888-8888-888888888888')).rejects.toMatchObject({
        code: 'p2p.trade_not_found',
      });
    });

    it('reports a missing offer', async () => {
      await expect(p2p.getOffer('88888888-8888-4888-8888-888888888888')).rejects.toMatchObject({
        code: 'p2p.offer_not_found',
      });
    });

    it('lets only the buyer mark the fiat sent', async () => {
      const trade = await escrowedTrade('100');
      await expect(p2p.markFiatSent(trade.id, MAKER)).rejects.toMatchObject({ code: 'p2p.not_the_buyer' });
    });

    it('lets only the seller confirm receipt', async () => {
      const trade = await escrowedTrade('100');
      await expect(p2p.confirmFiatReceived(trade.id, TAKER)).rejects.toMatchObject({ code: 'p2p.not_the_seller' });
      expect(await escrowOf(MAKER)).toBe('100');
    });
  });
}
