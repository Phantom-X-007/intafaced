import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { P2pService } from './p2p-service.js';
import { InstrumentService } from './instrument-service.js';
import { ANY_COUNTRY, InstrumentError } from './instruments.js';
import { createP2pRouter } from './router.js';

/**
 * PAYMENT INSTRUMENTS — disclosure, refusal, and the record of both.
 *
 * Postgres is real, because every property this file asserts is enforced in
 * SQL: the reveal is one statement that cannot read without logging, the log is
 * append-only by trigger, and the "one active destination per slot" rule is a
 * partial unique index. A mocked database would assert the shape of the code
 * rather than the behaviour of the system.
 *
 * The tests are driven through the **tRPC router with real signed edge
 * principals**, not by calling the service directly, wherever the question is
 * "can this person see it". Authorisation that is only ever tested one layer
 * below the door is authorisation nobody has checked the door for.
 *
 * The standing device is a CANARY: the seller's account details contain a
 * string that appears nowhere else in the system. "It does not leak" is then a
 * mechanical question — call everything, scan every response.
 */

const URL = process.env.TEST_DATABASE_URL_P2P ?? 'postgres://svc_p2p:svc_p2p@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_p2p_init.sql'), 'utf8');
const instrumentsMigration = readFileSync(join(here, '..', 'drizzle', '0001_p2p_payment_instruments.sql'), 'utf8');

const SELLER = '11111111-1111-4111-8111-111111111111';
const BUYER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const MODERATOR = '44444444-4444-4444-8444-444444444444';

const ASSET = 'USDT';
const METHOD = 'test-transfer';

/**
 * The value that must never appear anywhere it is not explicitly allowed.
 *
 * Deliberately not a plausible account number: if this string turns up in a
 * response, a log or an event payload, there is exactly one way it got there.
 */
const CANARY = 'CANARY-a1b2c3d4-do-not-disclose';

const EDGE_SECRET = 'a-p2p-instrument-test-edge-secret-long-enough';

/** Shared by every svc-p2p suite that brings the schema up. Any constant, as long as it is the same one. */
const P2P_MIGRATION_LOCK = 8_140_702;

/**
 * The Postgres probe comes from `@intafaced/db`, exactly as in
 * `p2p-service.test.ts` next door.
 *
 * This file was written with its own two-line `reachable()`, copied from the
 * sibling suite before that suite was fixed. The private version swallowed
 * every error and returned `false` regardless of `CI` or `REQUIRE_POSTGRES=1`,
 * so on CI — where an unreachable database is meant to be a hard failure — this
 * suite would have skipped in silence and been counted as a pass. That matters
 * more here than in most places: what this file asserts is that account numbers
 * do not leak, and a silent skip is indistinguishable from a green run that
 * proved they do not.
 *
 * `postgresAvailable` honours `postgresRequired()` and journals its decision
 * either way, so `pnpm verify` can name a suite that did not run instead of
 * letting turbo's "N successful" imply that it did.
 * (`tooling/ci/skip-honesty-scan.mjs` fails a build that re-adds a private probe.)
 */
const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-p2p payment instruments (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 12,
    connection: { search_path: 'p2p,public', application_name: 'svc-p2p-instrument-test' },
    onnotice: () => undefined,
  });

  // Owns its database, or does not run.
  await assertTestDatabase(sql, 'svc-p2p');

  // Same advisory lock as the escrow suite — see the note there.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${P2P_MIGRATION_LOCK})`;
    await tx.unsafe(migration);
    await tx.unsafe(instrumentsMigration);
  });

  const instruments = new InstrumentService(sql);
  const edgeContext = createEdgeContext({ secret: EDGE_SECRET, serviceName: 'svc-p2p' });

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let p2p: P2pService;
  let api: ReturnType<typeof createP2pRouter>;

  /** A principal the edge really vouched for, for a given user. */
  function callerFor(userId: string, scopes: string[] = ['p2p:read', 'p2p:write']) {
    const principal = {
      sub: userId,
      userId,
      sid: '99999999-9999-4999-8999-999999999999',
      scopes,
      tier: 'basic',
      mfa: false,
      expiresAt: new Date(Date.now() + 60_000),
    } as unknown as Principal;

    const raw = encodePrincipal(principal);
    return api.createCaller(
      edgeContext({
        headers: {
          'x-intafaced-principal': raw,
          'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, 'DE'),
          'x-intafaced-region': 'DE',
        },
        id: `req-${userId}`,
      }),
    );
  }

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

  /**
   * The operator's registry entry.
   *
   * A FIXTURE, not a claim about any real payment scheme. The registry ships
   * empty precisely because what a market's rails require is not this repo's
   * knowledge to invent, so the fields here are deliberately generic.
   */
  async function registerMethod(overrides: Partial<Parameters<InstrumentService['registerMethodSchema']>[0]> = {}) {
    return instruments.registerMethodSchema({
      methodId: METHOD,
      country: ANY_COUNTRY,
      label: 'Test transfer',
      fields: [
        { key: 'account_reference', label: 'Account reference', required: true },
        { key: 'holder_name', label: 'Account holder', required: true, maxLength: 80 },
        { key: 'note', label: 'Reference note', required: false },
      ],
      ...overrides,
    });
  }

  async function sellerInstrument(overrides: { fiatCurrency?: string; ownerId?: string; details?: Record<string, string> } = {}) {
    return instruments.createInstrument({
      ownerId: overrides.ownerId ?? SELLER,
      methodId: METHOD,
      country: 'DE',
      fiatCurrency: overrides.fiatCurrency ?? 'USD',
      label: 'Main account',
      details: overrides.details ?? { account_reference: CANARY, holder_name: 'A Seller' },
    });
  }

  /** A funded seller, an offer, and a taken trade sitting in `escrowed`. */
  async function liveTrade(amount = '100') {
    await fund(SELLER, '1000');
    const offer = await p2p.createOffer({
      makerId: SELLER,
      side: 'sell',
      asset: ASSET,
      fiatCurrency: 'USD',
      priceType: 'fixed',
      price: amt('1'),
      minAmt: amt('10'),
      maxAmt: amt('500'),
      totalAmt: amt('500'),
      methods: [METHOD],
    });
    const trade = await p2p.takeOffer({ offerId: offer.id, takerId: BUYER, amount: amt(amount), method: METHOD });
    return { offer, trade };
  }

  beforeEach(async () => {
    await sql`
      TRUNCATE p2p.instrument_access_log, p2p.trade_payment_instruments, p2p.payment_instruments,
               p2p.payment_method_schemas, p2p.p2p_disputes, p2p.p2p_trades, p2p.offers, p2p.p2p_reputation
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-p2p');
    p2p = new P2pService(sql, ledger, bus, {
      instruments,
      feeBps: 0,
      deadlines: { escrowSeconds: 120, paymentSeconds: 900, releaseSeconds: 1800, disputeSeconds: 604_800 },
    });
    api = createP2pRouter(p2p, instruments);
    await registerMethod();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  // ── The registry: we do not invent a market's requirements ─────────────────

  describe('the method registry', () => {
    it('ships empty, so an unregistered market refuses rather than guesses', async () => {
      await sql`TRUNCATE p2p.payment_method_schemas CASCADE`;
      expect(await instruments.listMethodSchemas()).toEqual([]);

      // The honest failure. The alternative is a seeded guess at what this
      // market needs, which produces an instrument that looks complete and
      // cannot be paid — discovered by a buyer, after escrow is locked.
      await expect(sellerInstrument()).rejects.toMatchObject({ code: 'p2p.instrument_method_unknown' });
    });

    it('rejects a field the operator never declared instead of dropping it', async () => {
      // Silently ignoring unknown keys would let a client push arbitrary
      // personal data into a blob nobody designed, nobody validates, and
      // everybody then has to protect and eventually delete.
      await expect(
        sellerInstrument({ details: { account_reference: 'x', holder_name: 'y', national_id: '123456' } }),
      ).rejects.toMatchObject({ code: 'p2p.instrument_field_undeclared', field: 'national_id' });
    });

    it('rejects a required field that is present but blank', async () => {
      await expect(sellerInstrument({ details: { account_reference: '   ', holder_name: 'y' } })).rejects.toMatchObject({
        code: 'p2p.instrument_field_missing',
        field: 'account_reference',
      });
    });

    it('lets an exact country override the wildcard, and does not fall back past it', async () => {
      await registerMethod({
        country: 'NG',
        label: 'Test transfer (NG)',
        fields: [{ key: 'wallet_handle', label: 'Handle', required: true }],
      });

      // The NG entry says "this market is different". Falling back to the
      // generic field list here would accept a destination that market cannot
      // actually receive at.
      await expect(
        instruments.createInstrument({
          ownerId: SELLER,
          methodId: METHOD,
          country: 'NG',
          fiatCurrency: 'NGN',
          details: { account_reference: 'x', holder_name: 'y' },
        }),
      ).rejects.toMatchObject({ code: 'p2p.instrument_field_undeclared' });

      const ok = await instruments.createInstrument({
        ownerId: SELLER,
        methodId: METHOD,
        country: 'NG',
        fiatCurrency: 'NGN',
        details: { wallet_handle: 'h' },
      });
      expect(ok.country).toBe('NG');
    });

    it('refuses a second active destination for the same method and currency', async () => {
      await sellerInstrument();
      // One answer to "which account does the buyer pay?", by construction. A
      // lookup that could return two rows would pick one by an ordering nobody
      // designed, on the one field where the wrong choice sends a stranger's
      // money to the wrong bank.
      await expect(sellerInstrument({ details: { account_reference: 'other', holder_name: 'A Seller' } })).rejects.toMatchObject({
        code: 'p2p.instrument_slot_taken',
      });

      const first = (await instruments.listInstruments(SELLER))[0]!;
      await instruments.removeInstrument({ instrumentId: first.id, ownerId: SELLER });
      // Rotation is sequential, and it works.
      await expect(sellerInstrument({ details: { account_reference: 'other', holder_name: 'A Seller' } })).resolves.toMatchObject({
        status: 'active',
      });
    });
  });

  // ── A trade cannot open with nowhere to pay ───────────────────────────────

  describe('taking an offer', () => {
    it('refuses before any lock when the seller has nowhere to be paid', async () => {
      await fund(SELLER, '1000');
      // A USD destination exists; the offer is priced in GBP.
      await sellerInstrument({ fiatCurrency: 'USD' });

      const offer = await p2p.createOffer({
        makerId: SELLER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency: 'GBP',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        totalAmt: amt('500'),
        methods: [METHOD],
      });

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: BUYER, amount: amt('100'), method: METHOD })).rejects.toMatchObject({
        code: 'p2p.take_refused',
      });

      // BEFORE ANY LOCK, and the transaction rolled back with it: no trade row,
      // no reserved inventory, nothing in escrow. The alternative is escrowing
      // the seller's asset against a payment nobody can make and letting them
      // discover it fifteen minutes later via a timeout.
      expect(await sql`SELECT id FROM p2p.p2p_trades`).toHaveLength(0);
      expect(await sql`SELECT trade_id FROM p2p.trade_payment_instruments`).toHaveLength(0);
      expect(ledger.totalsByAsset()[ASSET] ?? '0').toBe('0');
      const after = await p2p.getOffer(offer.id);
      expect(after.remainingAmt).toBe(amt('500'));
    });

    it('freezes the destination onto the trade in the same transaction', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      const rows = await sql<Array<{ trade_id: string; owner_id: string; fingerprint: string }>>`
        SELECT trade_id, owner_id, fingerprint FROM p2p.trade_payment_instruments WHERE trade_id = ${trade.id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.owner_id).toBe(SELLER);
    });

    /**
     * THE CAPITAL LETTER THAT MADE AN OFFER UNTAKEABLE.
     *
     * Every other test in this file uses a method id that is already lowercase,
     * which is exactly why nothing caught this: storage normalises the id, the
     * offer stores whatever the maker typed, the taker echoes the offer back,
     * and the lookup compared the two with `=`. A maker who capitalised
     * anything produced an offer nobody could take — and the message the seller
     * got was that they had no destination, while holding one.
     *
     * Driven through `takeOffer`, not `attachToTrade`, because the bug needed
     * BOTH comparisons on the path (`methodAllowed`, then the instrument
     * lookup) to agree that case is not meaning. Fixing either alone just moves
     * which layer refuses.
     */
    it('completes a take when the maker capitalised the method id and the instrument did not', async () => {
      await fund(SELLER, '1000');
      await registerMethod({ methodId: 'Bank_Transfer' });

      // Stored lowercase — `createInstrument` normalises, as every write does.
      const created = await instruments.createInstrument({
        ownerId: SELLER,
        methodId: 'BANK_TRANSFER',
        country: 'DE',
        fiatCurrency: 'USD',
        label: 'Main account',
        details: { account_reference: CANARY, holder_name: 'A Seller' },
      });
      expect(created.methodId).toBe('bank_transfer');

      // Stored verbatim — an offer's `methods` are the maker's own strings.
      const offer = await p2p.createOffer({
        makerId: SELLER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency: 'USD',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        totalAmt: amt('500'),
        methods: ['Bank_Transfer'],
      });
      expect(offer.methods).toEqual(['Bank_Transfer']);

      // The taker sends back what the offer showed them.
      const trade = await p2p.takeOffer({ offerId: offer.id, takerId: BUYER, amount: amt('100'), method: 'Bank_Transfer' });

      const rows = await sql<Array<{ instrument_id: string; method_id: string }>>`
        SELECT instrument_id, method_id FROM p2p.trade_payment_instruments WHERE trade_id = ${trade.id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.instrument_id).toBe(created.id);
      // The frozen snapshot carries the normalised id, not the maker's spelling.
      expect(rows[0]!.method_id).toBe('bank_transfer');

      // And the buyer really can pay it — the whole point of not refusing.
      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY },
      });
    });

    it('accepts either spelling from the taker, since neither was ever shown to matter', async () => {
      await fund(SELLER, '1000');
      await registerMethod({ methodId: 'bank_transfer' });
      await instruments.createInstrument({
        ownerId: SELLER,
        methodId: 'bank_transfer',
        country: 'DE',
        fiatCurrency: 'USD',
        label: 'Main account',
        details: { account_reference: CANARY, holder_name: 'A Seller' },
      });

      // The mirror image of the test above: the maker was lowercase, the taker
      // capitalises. Refusing here would have been the same failure wearing the
      // other hat.
      const offer = await p2p.createOffer({
        makerId: SELLER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency: 'USD',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        totalAmt: amt('500'),
        methods: ['bank_transfer'],
      });

      await expect(
        p2p.takeOffer({ offerId: offer.id, takerId: BUYER, amount: amt('100'), method: '  BANK_Transfer  ' }),
      ).resolves.toBeTruthy();
    });

    it('still refuses a method the seller genuinely has no destination for', async () => {
      // The fix must not become "any string matches". Case is not meaning; a
      // different method still is.
      await fund(SELLER, '1000');
      await registerMethod({ methodId: 'Bank_Transfer' });
      await registerMethod({ methodId: 'other_rail' });
      await instruments.createInstrument({
        ownerId: SELLER,
        methodId: 'Bank_Transfer',
        country: 'DE',
        fiatCurrency: 'USD',
        label: 'Main account',
        details: { account_reference: CANARY, holder_name: 'A Seller' },
      });

      const offer = await p2p.createOffer({
        makerId: SELLER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency: 'USD',
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        totalAmt: amt('500'),
        methods: ['Other_Rail'],
      });

      await expect(p2p.takeOffer({ offerId: offer.id, takerId: BUYER, amount: amt('100'), method: 'Other_Rail' })).rejects.toMatchObject({
        code: 'p2p.take_refused',
      });
    });
  });

  // ── THE ORACLE ────────────────────────────────────────────────────────────

  /**
   * `trades.take` WAS A FREE, UNLOGGED, SELF-DESCRIBING PROBE.
   *
   * `attachToTrade` threw with the method id and the currency echoed back, and
   * the router returned `err.message` verbatim as a `BAD_REQUEST`. The throw is
   * inside the reserve transaction, so the probe rolled back cleanly — no trade
   * row, no inventory decrement, no escrow, no cost — and `logDenied` was not
   * called on that path, so it wrote no access-log row. With
   * `instruments.methods.list` supplying the candidate ids, that is a complete
   * confirm/deny for "does seller S hold an instrument for method M in currency
   * C", answered for nothing and never recorded.
   *
   * These tests are the two halves of closing it: the refusals must be
   * indistinguishable, and every one of them must be on the record.
   */
  describe('the take oracle', () => {
    /** An offer that lists `methodId`, from a seller funded and ready. */
    async function offerListing(methodId: string, fiatCurrency = 'USD') {
      await fund(SELLER, '1000');
      return p2p.createOffer({
        makerId: SELLER,
        side: 'sell',
        asset: ASSET,
        fiatCurrency,
        priceType: 'fixed',
        price: amt('1'),
        minAmt: amt('10'),
        maxAmt: amt('500'),
        totalAmt: amt('500'),
        methods: [methodId],
      });
    }

    /** Everything a caller can observe from one refused take. */
    async function refusalShape(offerId: string, method: string) {
      const err = await callerFor(BUYER)
        .trades.take({ offerId, amount: '100', method })
        .then(
          () => null,
          (e: unknown) => e as { code?: string; message?: string; shape?: unknown; data?: unknown },
        );
      return {
        code: (err as { code?: string })?.code,
        message: (err as { message?: string })?.message,
        keys: Object.keys((err ?? {}) as object).sort(),
        data: JSON.parse(JSON.stringify((err as { data?: unknown })?.data ?? null)),
      };
    }

    /**
     * THE PROOF.
     *
     * Two takes that fail for two entirely different reasons — one because the
     * seller holds no destination for the method, one because the offer does
     * not accept it — and nothing a caller can see tells them apart.
     */
    it('refuses "no such instrument" and "offer does not accept it" identically', async () => {
      await registerMethod();
      await registerMethod({ methodId: 'other-rail' });

      // (a) The offer lists the method. The seller has NO instrument for it.
      const noInstrument = await offerListing('other-rail');
      const a = await refusalShape(noInstrument.id, 'other-rail');

      // (b) The offer does NOT list the method. The seller DOES hold one.
      await sellerInstrument();
      const notAccepted = await offerListing('other-rail');
      const b = await refusalShape(notAccepted.id, METHOD);

      expect(a.code).toBe('BAD_REQUEST');
      expect(a).toEqual(b);
      // And the message names nothing the caller was not entitled to see: not
      // the method they asked for, not the currency, not the seller.
      expect(a.message).toBe('This offer cannot be taken with the selected payment method');
      expect(a.message).not.toContain('other-rail');
      expect(a.message).not.toContain(METHOD);
      expect(a.message).not.toContain('USD');
      expect(a.message).not.toContain(SELLER);
    });

    it('costs the prober nothing to attempt and everything to hide', async () => {
      // The rollback that made the probe free is still there — refusing before
      // any lock is correct and is not what changed. What changed is that the
      // attempt is now on the seller's own access log.
      await registerMethod();
      await registerMethod({ methodId: 'other-rail' });
      const offer = await offerListing('other-rail');

      await expect(refusalShape(offer.id, 'other-rail')).resolves.toMatchObject({ code: 'BAD_REQUEST' });

      expect(await sql`SELECT id FROM p2p.p2p_trades`).toHaveLength(0);
      expect((await p2p.getOffer(offer.id)).remainingAmt).toBe(amt('500'));
      expect(ledger.totalsByAsset()[ASSET] ?? '0').toBe('0');

      // THE LOG ROW SURVIVED THE ROLLBACK. It is written on the service's own
      // connection, not the reserve transaction — a log row written inside the
      // transaction the throw aborts would vanish with it, which is precisely
      // what "unlogged" meant.
      const log = await instruments.accessLogFor(SELLER);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        ownerId: SELLER,
        viewerId: BUYER,
        outcome: 'denied',
        denyReason: 'take_refused',
        instrumentId: null,
        tradeId: null,
      });
    });

    it('logs both refusals the same way, so the log does not restore the distinction', async () => {
      await registerMethod();
      await registerMethod({ methodId: 'other-rail' });

      const noInstrument = await offerListing('other-rail');
      await refusalShape(noInstrument.id, 'other-rail');

      await sellerInstrument();
      const notAccepted = await offerListing('other-rail');
      await refusalShape(notAccepted.id, METHOD);

      const log = await instruments.accessLogFor(SELLER);
      expect(log).toHaveLength(2);
      const shapes = log.map((e) => ({
        outcome: e.outcome,
        denyReason: e.denyReason,
        viewerRole: e.viewerRole,
        instrumentId: e.instrumentId,
        tradeId: e.tradeId,
      }));
      expect(shapes[0]).toEqual(shapes[1]);
    });

    it('enumerating a seller is now a visible act, not a silent one', async () => {
      // The seller reads their own log and sees that somebody spent an
      // afternoon asking. Before this, there was nothing to see.
      await registerMethod();
      await registerMethod({ methodId: 'other-rail' });
      const offer = await offerListing('other-rail');

      for (let i = 0; i < 5; i++) await refusalShape(offer.id, 'other-rail');

      const log = await callerFor(SELLER).instruments.accessLog({});
      expect(log.filter((e) => e.outcome === 'denied' && e.denyReason === 'take_refused')).toHaveLength(5);
    });
  });

  // ── THE HEADLINE: who can see it, and when ────────────────────────────────

  describe('disclosure', () => {
    it('shows the buyer the destination while the escrow is held', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      const view = await callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id });
      expect(view.details).toEqual({ account_reference: CANARY, holder_name: 'A Seller' });
      expect(view.methodId).toBe(METHOD);
      expect(view.fiatCurrency).toBe('USD');

      // And still after the buyer says they have paid — the seller has not
      // confirmed yet and the buyer may need to quote the account in a dispute.
      await p2p.markFiatSent(trade.id, BUYER);
      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY },
      });
    });

    it('shows the seller their own destination on their own trade', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      await expect(callerFor(SELLER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY },
      });
    });

    it('refuses a non-counterparty, and refuses it as NOT_FOUND', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      // FORBIDDEN would confirm that a trade with this id exists and that its
      // seller has an account on file — the first half of what the caller was
      // trying to learn.
      await expect(callerFor(STRANGER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('refuses before the escrow is locked', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      // The two-minute `created` window is not reachable through the API (a
      // take escrows or fails), so it is set up directly. It matters because it
      // is the window in which a taker has committed nothing: if it disclosed,
      // opening and abandoning takes would be a free harvest.
      await sql`UPDATE p2p.p2p_trades SET status = 'created' WHERE id = ${trade.id}`;

      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('stops showing it the moment the trade closes', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toBeTruthy();

      await p2p.markFiatSent(trade.id, BUYER);
      await p2p.confirmFiatReceived(trade.id, SELLER);

      // A completed trade is not a permanent licence to read the account of
      // someone you dealt with once.
      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(callerFor(SELLER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('stops showing it on a refunded trade too', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      await p2p.cancelTrade(trade.id, SELLER, 'changed_mind');

      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('lets a moderator see it only while a dispute on that trade is open', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      const moderator = () => callerFor(MODERATOR, ['p2p:read', 'admin:compliance']);

      // No dispute: `admin:compliance` is not a skeleton key.
      await expect(moderator().trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await p2p.markFiatSent(trade.id, BUYER);
      await p2p.openDispute({ tradeId: trade.id, openedBy: BUYER, reason: 'paid, not released' });

      // §A2: a disputed release needs a human, and both sides see the same
      // evidence. A human asked to rule on "I paid" / "nothing arrived" without
      // seeing the account the payment was meant to reach is being asked to
      // guess.
      await expect(moderator().trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY },
      });

      await p2p.resolveDispute({ tradeId: trade.id, moderatorId: MODERATOR, resolution: 'release' });
      await expect(moderator().trades.paymentInstrument({ tradeId: trade.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ── THE LEAK SWEEP ────────────────────────────────────────────────────────

  describe('no leak through any other path', () => {
    /**
     * Every procedure in the router, called as a stranger against the REAL ids
     * of a live trade, with every successful response scanned for the canary.
     *
     * The map is exhaustive by construction: a procedure the router exposes and
     * this map does not name fails the test. That is the point — the risk this
     * guards is not the endpoints that exist today, it is the next list
     * endpoint someone adds that happens to select the whole row.
     */
    it('never returns the account details to a stranger from any procedure', async () => {
      await sellerInstrument();
      const { offer, trade } = await liveTrade();

      const inputs: Record<string, unknown> = {
        health: undefined,
        'fiat.list': undefined,
        'offers.list': {},
        'offers.get': { offerId: offer.id },
        'offers.create': {
          side: 'sell',
          asset: ASSET,
          fiatCurrency: 'USD',
          priceType: 'fixed',
          price: '1',
          minAmount: '10',
          maxAmount: '100',
        },
        'offers.close': { offerId: offer.id },
        // A random offer id on purpose: a stranger who TAKES an offer becomes a
        // counterparty, which is the product working, not a leak.
        'trades.take': { offerId: crypto.randomUUID(), amount: '10', method: METHOD },
        'trades.markFiatSent': { tradeId: trade.id },
        'trades.confirmReceived': { tradeId: trade.id },
        'trades.cancel': { tradeId: trade.id },
        'trades.get': { tradeId: trade.id },
        'trades.list': {},
        'trades.paymentInstrument': { tradeId: trade.id },
        'disputes.open': { tradeId: trade.id, reason: 'probing' },
        // Considered, per the note below the map. Neither can carry an
        // instrument: `appendEvidence` returns only the caller's OWN evidence
        // envelopes, and `list` serialises dispute rows, which hold no
        // instrument id and never join the instrument tables. Both are probed
        // as a stranger anyway — the assertion is on what comes back, not on
        // the reasoning.
        'disputes.appendEvidence': { tradeId: trade.id, evidence: ['probing'] },
        'disputes.list': {},
        'disputes.get': { tradeId: trade.id },
        'disputes.resolve': { tradeId: trade.id, resolution: 'release' },
        'reputation.get': { userId: SELLER },
        'instruments.methods.list': {},
        'instruments.methods.register': { methodId: 'probe', country: 'DE', label: 'p', fields: [{ key: 'a', label: 'A' }] },
        'instruments.methods.setEnabled': { methodId: METHOD, country: ANY_COUNTRY, enabled: false },
        'instruments.create': {
          methodId: METHOD,
          country: 'DE',
          fiatCurrency: 'EUR',
          details: { account_reference: 'own', holder_name: 'S' },
        },
        'instruments.list': {},
        'instruments.accessLog': {},
        'instruments.update': { instrumentId: (await instruments.listInstruments(SELLER))[0]!.id, label: 'mine now' },
        'instruments.remove': { instrumentId: (await instruments.listInstruments(SELLER))[0]!.id },
        'instruments.reveal': { instrumentId: (await instruments.listInstruments(SELLER))[0]!.id },
      };

      const paths = Object.keys((api as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures);
      const unmapped = paths.filter((p) => !(p in inputs));
      // A new procedure has to be considered here before it can ship. Adding it
      // to the map is the act of deciding it cannot leak an instrument.
      expect(unmapped, 'new router procedure — add it to the leak sweep').toEqual([]);

      const stranger = callerFor(STRANGER) as unknown as Record<string, unknown>;
      const responses: unknown[] = [];
      const succeeded: string[] = [];

      for (const path of paths) {
        const fn = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], stranger);
        try {
          responses.push(await (fn as (i: unknown) => Promise<unknown>)(inputs[path]));
          succeeded.push(path);
        } catch {
          // A refusal is a pass. What matters is what came back when one did not.
        }
      }

      // Sanity: if everything refused, the scan below would prove nothing.
      expect(succeeded.length).toBeGreaterThan(3);
      expect(JSON.stringify(responses)).not.toContain(CANARY);
      expect(succeeded).not.toContain('trades.paymentInstrument');
    });

    it('never returns the account details through the counterparty’s ordinary reads', async () => {
      await sellerInstrument();
      const { offer, trade } = await liveTrade();
      const buyer = callerFor(BUYER);

      // The buyer IS entitled to the details — through `trades.paymentInstrument`
      // and nowhere else, so that a disclosure is always a deliberate, logged
      // act rather than a side effect of rendering a screen.
      const ordinary = [
        await buyer.trades.get({ tradeId: trade.id }),
        await buyer.trades.list({}),
        await buyer.offers.get({ offerId: offer.id }),
        await buyer.offers.list({}),
        await buyer.instruments.list({}),
        await buyer.instruments.methods.list({}),
        await buyer.reputation.get({ userId: SELLER }),
      ];
      expect(JSON.stringify(ordinary)).not.toContain(CANARY);

      await expect(buyer.trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY },
      });
    });

    it('never returns the values on the owner’s own list', async () => {
      await sellerInstrument();
      const list = await callerFor(SELLER).instruments.list({});
      expect(list).toHaveLength(1);
      expect(JSON.stringify(list)).not.toContain(CANARY);
      // No masked hint either: a mask is still the data, on a path that is not
      // access-logged, one helpful refactor from being the whole value.
      expect(Object.keys(list[0]!)).not.toContain('details');
      expect(Object.keys(list[0]!)).not.toContain('fingerprint');
    });

    it('never puts the values on an offer or on a published event', async () => {
      await sellerInstrument();
      const { offer, trade } = await liveTrade();

      const published = bus.emitted('p2pOfferCreated').concat(bus.emitted('p2pEscrowLocked') as never);
      expect(JSON.stringify(published)).not.toContain(CANARY);

      // The offer carries method IDS — what a maker accepts — and never a
      // destination. That distinction is the whole reason a public board is
      // safe to publish.
      const board = await callerFor(STRANGER).offers.list({});
      expect(JSON.stringify(board)).not.toContain(CANARY);
      expect(board.find((o) => o.id === offer.id)?.methods).toEqual([METHOD]);
      expect(trade.id).toBeTruthy();
    });
  });

  // ── Removal and editing, against a trade that is already running ──────────

  describe('an in-flight trade', () => {
    it('keeps working after the owner removes the instrument', async () => {
      const created = await sellerInstrument();
      const { trade } = await liveTrade();

      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toBeTruthy();

      await callerFor(SELLER).instruments.remove({ instrumentId: created.id });

      // The buyer is mid-payment. A removal must not blank the screen they are
      // copying an account number out of.
      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY, holder_name: 'A Seller' },
      });

      // And it is gone for everything that has not started yet.
      expect(await callerFor(SELLER).instruments.list({})).toEqual([]);
      await expect(p2p.takeOffer({ offerId: trade.offerId, takerId: BUYER, amount: amt('50'), method: METHOD })).rejects.toMatchObject({
        code: 'p2p.take_refused',
      });
    });

    it('does not let the seller redirect a payment already in flight', async () => {
      const created = await sellerInstrument();
      const { trade } = await liveTrade();

      await callerFor(SELLER).instruments.update({
        instrumentId: created.id,
        details: { account_reference: 'SWITCHED-ACCOUNT', holder_name: 'A Seller' },
      });

      // THE SCAM THIS PREVENTS: show account A, wait for the buyer to start the
      // transfer, switch to account B, then truthfully report that nothing
      // arrived at B. A live pointer instead of a snapshot is what makes it
      // work; the frozen row is what makes it evidence.
      const view = await callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id });
      expect(view.details).toEqual({ account_reference: CANARY, holder_name: 'A Seller' });

      // The owner's own copy did change — the edit was legitimate, it just does
      // not reach backwards.
      const own = await callerFor(SELLER).instruments.reveal({ instrumentId: created.id });
      expect(own.details).toEqual({ account_reference: 'SWITCHED-ACCOUNT', holder_name: 'A Seller' });
    });
  });

  // ── The access log ────────────────────────────────────────────────────────

  describe('the access log', () => {
    it('records who saw whose details, on which trade', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      await callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id });

      const log = await instruments.accessLogFor(SELLER);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ viewerId: BUYER, viewerRole: 'counterparty', outcome: 'revealed', tradeId: trade.id });
      expect(log[0]!.at).toBeInstanceOf(Date);
    });

    it('records the owner’s own reads too', async () => {
      const created = await sellerInstrument();
      await callerFor(SELLER).instruments.reveal({ instrumentId: created.id });

      // The owner is not exempt: an account takeover reads exactly like an
      // owner, because it holds the session. A log with a hole shaped like "the
      // owner" says nothing about the one attack it most needs to describe.
      const log = await instruments.accessLogFor(SELLER);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ viewerId: SELLER, viewerRole: 'owner', outcome: 'revealed', tradeId: null });
    });

    it('records refusals, which is the half that shows harvesting', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      await expect(callerFor(STRANGER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toThrow();
      await expect(
        callerFor(MODERATOR, ['p2p:read', 'admin:compliance']).trades.paymentInstrument({ tradeId: trade.id }),
      ).rejects.toThrow();

      const log = await instruments.accessLogFor(SELLER);
      expect(log).toHaveLength(2);
      expect(log.map((e) => [e.viewerId, e.outcome, e.denyReason]).sort()).toEqual(
        [
          [MODERATOR, 'denied', 'moderator_without_open_dispute'],
          [STRANGER, 'denied', 'not_a_party'],
        ].sort(),
      );
    });

    it('is the owner’s to read, and shows them a look they did not expect', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      await expect(callerFor(STRANGER).trades.paymentInstrument({ tradeId: trade.id })).rejects.toThrow();

      const mine = await callerFor(SELLER).instruments.accessLog({});
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ viewerId: STRANGER, outcome: 'denied' });

      // And it is not anyone else's to read.
      expect(await callerFor(STRANGER).instruments.accessLog({})).toEqual([]);
    });

    it('cannot be edited or deleted, even behind the service’s back', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      await callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id });

      // Raw SQL, bypassing every line of application code. A log the service
      // could tidy is a log whose value depends on the service not having been
      // the thing that was compromised.
      await expect(sql`UPDATE p2p.instrument_access_log SET viewer_id = 'someone-else'`).rejects.toThrow(/append-only/i);
      await expect(sql`DELETE FROM p2p.instrument_access_log`).rejects.toThrow(/append-only/i);

      expect(await instruments.accessLogFor(SELLER)).toHaveLength(1);
    });

    it('cannot be avoided: no disclosure exists without a row', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();

      const before = await sql<Array<{ n: string }>>`SELECT count(*) AS n FROM p2p.instrument_access_log WHERE outcome = 'revealed'`;
      expect(Number(before[0]!.n)).toBe(0);

      for (let i = 0; i < 3; i++) await callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id });

      // One row per disclosure, not one per session. The reveal is a single SQL
      // statement in which the SELECT of the details is cross-joined to the
      // INSERT of this row, so the count cannot fall behind the reads.
      const after = await sql<Array<{ n: string }>>`SELECT count(*) AS n FROM p2p.instrument_access_log WHERE outcome = 'revealed'`;
      expect(Number(after[0]!.n)).toBe(3);
    });
  });

  // ── Retention ─────────────────────────────────────────────────────────────

  describe('retention', () => {
    it('wipes the details off a closed trade past the window and keeps the fingerprint', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      await p2p.markFiatSent(trade.id, BUYER);
      await p2p.confirmFiatReceived(trade.id, SELLER);

      const short = new InstrumentService(sql, { retentionDays: 30 });
      // Nothing is due yet — a purge that ran early would destroy evidence an
      // open appeal still needs.
      expect(await short.purgeExpiredSnapshots()).toEqual({ purged: 0 });

      await sql`UPDATE p2p.p2p_trades SET resolved_at = now() - interval '45 days' WHERE id = ${trade.id}`;
      expect(await short.purgeExpiredSnapshots()).toEqual({ purged: 1 });

      const rows = await sql<Array<{ details: unknown; fingerprint: string; purged_at: Date | null }>>`
        SELECT details, fingerprint, purged_at FROM p2p.trade_payment_instruments WHERE trade_id = ${trade.id}
      `;
      expect(rows[0]!.details).toBeNull();
      expect(rows[0]!.purged_at).toBeInstanceOf(Date);
      // The fingerprint outlives the values: an appeal can still be told whether
      // the account a seller now names is the one the buyer was shown, without
      // us holding the account in order to say so.
      expect(rows[0]!.fingerprint).toHaveLength(64);

      expect(await sql`SELECT trade_id FROM p2p.trade_payment_instruments WHERE details::text LIKE ${'%' + CANARY + '%'}`).toHaveLength(0);
    });

    it('never touches a trade that is still live', async () => {
      await sellerInstrument();
      const { trade } = await liveTrade();
      await sql`UPDATE p2p.trade_payment_instruments SET attached_at = now() - interval '400 days' WHERE trade_id = ${trade.id}`;

      const short = new InstrumentService(sql, { retentionDays: 30 });
      expect(await short.purgeExpiredSnapshots()).toEqual({ purged: 0 });
      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toBeTruthy();
    });

    /**
     * "REMOVE MY BANK ACCOUNT" HAS TO MEAN THE ACCOUNT IS GONE.
     *
     * Removal used to set the status and nothing else. Nothing else nulled the
     * details either — the snapshot purge only touches
     * `trade_payment_instruments` — so the account number stayed in the row
     * indefinitely, in a state where `revealOwn` (which filters `active`) would
     * not let the owner so much as look at what was still held.
     *
     * Retained and unreadable is the worst pair available: no delete path and
     * no export path, under a README and an `env.ts` that both promise a
     * retention window.
     */
    it('wipes the account details when the owner removes the instrument, and keeps the fingerprint', async () => {
      const created = await sellerInstrument();

      // THE EXPORT, and it must exist BEFORE the removal — this is the moment
      // the owner can still get their own data out. `reveal` is the export, and
      // it is logged like every other read.
      const exported = await callerFor(SELLER).instruments.reveal({ instrumentId: created.id });
      expect(exported.details).toEqual({ account_reference: CANARY, holder_name: 'A Seller' });

      await callerFor(SELLER).instruments.remove({ instrumentId: created.id });

      const rows = await sql<Array<{ details: unknown; fingerprint: string; status: string; removed_at: Date | null }>>`
        SELECT details, fingerprint, status, removed_at FROM p2p.payment_instruments WHERE id = ${created.id}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('removed');
      expect(rows[0]!.details).toBeNull();
      expect(rows[0]!.removed_at).toBeInstanceOf(Date);
      // Kept on purpose: an appeal can still be told whether the account a
      // seller now names is the one the buyer was shown.
      expect(rows[0]!.fingerprint).toHaveLength(64);

      // The canary is the mechanical version of the claim: it appears nowhere
      // else in the system, so scanning the whole table is a complete answer.
      expect(await sql`SELECT id FROM p2p.payment_instruments WHERE details::text LIKE ${'%' + CANARY + '%'}`).toHaveLength(0);

      // The header survives, because the access log has to keep meaning
      // something after the data it describes is gone.
      const [header] = await instruments.listInstruments(SELLER, true);
      expect(header).toMatchObject({ id: created.id, status: 'removed', methodId: METHOD });
    });

    it('will not let a removed instrument hold details, even behind the service’s back', async () => {
      const created = await sellerInstrument();
      await callerFor(SELLER).instruments.remove({ instrumentId: created.id });

      // The rule is a CHECK constraint, not a line in `removeInstrument`. A
      // retention promise kept only by the one function that happens to write
      // the row is a promise the next edit one layer up drops silently.
      await expect(
        sql`UPDATE p2p.payment_instruments SET details = ${sql.json({ account_reference: CANARY } as never)} WHERE id = ${created.id}`,
      ).rejects.toMatchObject({ code: '23514' });

      // And the other half of the same constraint: an ACTIVE instrument cannot
      // be emptied, because a destination with no address is one the buyer
      // cannot pay.
      const live = await sellerInstrument({ fiatCurrency: 'GBP' });
      await expect(sql`UPDATE p2p.payment_instruments SET details = NULL WHERE id = ${live.id}`).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('leaves the owner nothing to read once it is removed, and says so as NOT_FOUND', async () => {
      const created = await sellerInstrument();
      await callerFor(SELLER).instruments.remove({ instrumentId: created.id });

      // There is nothing left to disclose, and the refusal is the same
      // NOT_FOUND every other refusal collapses to — a removed instrument must
      // not be distinguishable from one that never existed.
      await expect(callerFor(SELLER).instruments.reveal({ instrumentId: created.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('does not strand a buyer who is mid-payment when the seller removes the destination', async () => {
      const created = await sellerInstrument();
      const { trade } = await liveTrade();

      await callerFor(SELLER).instruments.remove({ instrumentId: created.id });

      // The live row is wiped; the trade's own frozen copy is a separate one and
      // survives until the retention sweep. Wiping on removal must not become a
      // way to blank the screen a buyer is copying an account number out of.
      expect(await sql`SELECT id FROM p2p.payment_instruments WHERE id = ${created.id} AND details IS NOT NULL`).toHaveLength(0);
      await expect(callerFor(BUYER).trades.paymentInstrument({ tradeId: trade.id })).resolves.toMatchObject({
        details: { account_reference: CANARY, holder_name: 'A Seller' },
      });
    });
  });

  // ── Ownership ─────────────────────────────────────────────────────────────

  describe('ownership', () => {
    it('refuses every owner operation to someone who is not the owner', async () => {
      const created = await sellerInstrument();
      const stranger = callerFor(STRANGER);

      for (const call of [
        () => stranger.instruments.reveal({ instrumentId: created.id }),
        () => stranger.instruments.update({ instrumentId: created.id, label: 'mine' }),
        () => stranger.instruments.remove({ instrumentId: created.id }),
      ]) {
        await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
      }

      const untouched = await instruments.revealOwn({ instrumentId: created.id, viewerId: SELLER });
      expect(untouched.label).toBe('Main account');
      expect(untouched.details).toEqual({ account_reference: CANARY, holder_name: 'A Seller' });
    });

    it('logs the refused attempt against the attempt, not the owner', async () => {
      const created = await sellerInstrument();
      await expect(callerFor(STRANGER).instruments.reveal({ instrumentId: created.id })).rejects.toThrow();

      // Nothing resolved, so nothing is attributed to the owner — but the
      // attempt itself is on the record, under the viewer who made it.
      expect(await instruments.accessLogFor(SELLER)).toEqual([]);
      const attempts = await sql<Array<{ viewer_id: string; outcome: string; deny_reason: string }>>`
        SELECT viewer_id, outcome, deny_reason FROM p2p.instrument_access_log WHERE viewer_id = ${STRANGER}
      `;
      expect(attempts).toEqual([{ viewer_id: STRANGER, outcome: 'denied', deny_reason: 'not_the_owner' }]);
    });
  });

  // ── A row that did not come through the API ────────────────────────────────

  /**
   * THE DOOR IS NOT THE CONTROL.
   *
   * `registerMethodSchema` is the only writer with `admin:compliance` in front
   * of it, and it validates. Everything else that can reach the column —
   * a migration, a data-fix script, a psql session, some future writer in this
   * same service — validated nothing, and `toSchema` cast the row straight to
   * `FieldSpec[]`. "Only a trusted operator can get here" is a statement about
   * who is holding the door; it stops being true the first time a scope widens
   * or a migration writes the row directly, and it was never something the code
   * enforced.
   *
   * These tests write rows with RAW SQL — deliberately bypassing every line of
   * TypeScript in this service — and assert that both halves hold:
   *
   *   · the DATABASE refuses a structurally bad field list at write time,
   *     whoever is writing;
   *   · the SERVICE refuses a field list it cannot run at read time, because
   *     "is this pattern safe to execute" is not a question SQL can answer.
   */
  describe('a schema row inserted behind the API', () => {
    /** Straight to the table. No service code involved on the way in. */
    async function rawInsertSchema(fields: unknown, methodId = 'raw-method') {
      return sql`
        INSERT INTO p2p.payment_method_schemas (method_id, country, label, fields, enabled)
        VALUES (${methodId}, ${ANY_COUNTRY}, 'Inserted behind the API', ${sql.json(fields as never)}, true)
        ON CONFLICT (method_id, country) DO UPDATE SET fields = EXCLUDED.fields
      `;
    }

    it('is refused by the database when the field list is malformed', async () => {
      // The column guard used to be "a non-empty JSON array" and nothing more,
      // so every one of these was storable.
      const REFUSED: Array<[string, unknown]> = [
        ['no fields at all', []],
        ['not an array', { key: 'a' }],
        ['above MAX_FIELDS', Array.from({ length: 25 }, (_, i) => ({ key: `f${i}`, label: 'L' }))],
        ['a key that is not a key', [{ key: 'Not A Key', label: 'L' }]],
        ['no key', [{ label: 'L' }]],
        ['no label', [{ key: 'a' }]],
        ['a blank label', [{ key: 'a', label: '   ' }]],
        ['a label over MAX_LABEL_LENGTH', [{ key: 'a', label: 'x'.repeat(121) }]],
        ['a pattern over MAX_PATTERN_LENGTH', [{ key: 'a', label: 'L', pattern: 'x'.repeat(201) }]],
        ['a pattern that is not a string', [{ key: 'a', label: 'L', pattern: 5 }]],
        ['a minLength of 0', [{ key: 'a', label: 'L', minLength: 0 }]],
        ['a minLength past MAX_VALUE_LENGTH', [{ key: 'a', label: 'L', minLength: 513 }]],
        ['a fractional minLength', [{ key: 'a', label: 'L', minLength: 1.5 }]],
        ['minLength above maxLength', [{ key: 'a', label: 'L', minLength: 10, maxLength: 4 }]],
        [
          'a duplicate key',
          [
            { key: 'a', label: 'A' },
            { key: 'a', label: 'B' },
          ],
        ],
        ['a non-boolean required', [{ key: 'a', label: 'L', required: 'yes' }]],
        ['an element that is not an object', ['nope']],
      ];

      for (const [what, fields] of REFUSED) {
        await expect(rawInsertSchema(fields), what).rejects.toMatchObject({
          constraint_name: 'payment_method_schemas_fields_ck',
        });
      }

      // And nothing landed.
      const rows = await sql`SELECT method_id FROM p2p.payment_method_schemas WHERE method_id = 'raw-method'`;
      expect(rows).toEqual([]);
    });

    /**
     * The half SQL cannot cover.
     *
     * `(?=…)` is a perfectly well-formed string of 12 characters, so the column
     * constraint has no grounds to refuse it — deciding whether a pattern is one
     * this service can run in linear time means running this service's parser.
     * That is why the re-validation on READ exists as well, and this is the test
     * that would go green again if `toSchema` went back to casting the row.
     */
    it('is refused by the service on read when the pattern is one we cannot run', async () => {
      await rawInsertSchema([{ key: 'acct', label: 'Account', pattern: '(?=[0-9]{4})[0-9]+' }]);

      // It really is in the table — the database had no reason to object.
      const stored = await sql`SELECT fields FROM p2p.payment_method_schemas WHERE method_id = 'raw-method'`;
      expect(stored).toHaveLength(1);

      // Every read path refuses it, and says which row is the problem.
      await expect(instruments.listMethodSchemas()).rejects.toThrow(/raw-method/);
      await expect(instruments.listMethodSchemas()).rejects.toThrow(/lookahead/);
      await expect(
        instruments.createInstrument({
          ownerId: SELLER,
          methodId: 'raw-method',
          country: 'DE',
          fiatCurrency: 'USD',
          details: { acct: '1234' },
        }),
      ).rejects.toThrow(InstrumentError);
    });

    it('refuses on read for the rest of the rules too, not only patterns', async () => {
      // A row whose SHAPE the constraint accepts but whose CONTENT the service
      // will not: `help` is a string, so SQL is satisfied, and the pattern is a
      // 13-character automaton bomb that only the compiler can recognise.
      await rawInsertSchema([{ key: 'acct', label: 'Account', pattern: '(a{100}){100}' }]);

      await expect(instruments.listMethodSchemas()).rejects.toThrow(InstrumentError);
      await expect(instruments.listMethodSchemas()).rejects.toThrow(/raw-method/);
    });

    it('lets a legitimate hand-written row through untouched', async () => {
      // Fail-closed must not mean fail-always. A row an operator could have
      // registered through the API reads back exactly as written — including a
      // pattern with an escaped dollar sign, the one that used to explode.
      await rawInsertSchema([
        { key: 'amount', label: 'Amount', required: true, pattern: '\\d+\\$' },
        { key: 'holder_name', label: 'Account holder', required: true, maxLength: 80 },
      ]);

      const all = await instruments.listMethodSchemas({ methodId: 'raw-method' });
      expect(all).toHaveLength(1);
      expect(all[0]!.fields.map((f) => f.key)).toEqual(['amount', 'holder_name']);
      expect(all[0]!.fields[0]!.pattern).toBe('\\d+\\$');

      const created = await instruments.createInstrument({
        ownerId: SELLER,
        methodId: 'raw-method',
        country: 'DE',
        fiatCurrency: 'USD',
        details: { amount: '2500$', holder_name: 'A Seller' },
      });
      expect(created.methodId).toBe('raw-method');
    });
  });
}
