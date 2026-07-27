import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  MemoryLedger,
  formatAmount,
  houseFees,
  merchantClearing,
  parseAmount as amt,
  railBoundary,
  userAvailable,
} from '@intafaced/ledger-client';
import { PayService, PayError, type PaymentView } from './payment-service.js';
import { RailRegistry } from './rails/registry.js';
import { CardSandboxAdapter, SANDBOX_DECLINE_TOKEN } from './rails/card-sandbox.js';
import { CryptoNativeAdapter } from './rails/crypto-native.js';
import { MemoryChain } from './rails/chain-port.js';
import { signPayload } from './rails/webhook-signature.js';

/**
 * svc-pay money paths.
 *
 * The ledger here is `MemoryLedger` — the reference implementation, which the
 * ledger conformance suite proves behaves identically to svc-ledger's Postgres
 * engine (§4.4). That equivalence is what makes it legitimate to use here:
 * these tests are about svc-pay's recipes and ordering, not about the ledger.
 *
 * Postgres is real, because the payment row / event log / ledger interaction is
 * exactly where a bug would hide — and because the append-only guarantee on
 * `payment_events` is enforced by a database trigger, which an in-memory fake
 * would quietly not have.
 */

const URL = process.env.TEST_DATABASE_URL_PAY ?? 'postgres://svc_pay:svc_pay@localhost:5433/intafaced';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', 'drizzle', '0000_pay_init.sql'), 'utf8');

const SECRET = 'svc-pay-test-secret-at-least-32-characters';
const MERCHANT_USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 });
  }
}

const available = await reachable();

if (!available) {
  describe.skip('svc-pay (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 12,
    connection: { search_path: 'pay,public', application_name: 'svc-pay-test' },
    onnotice: () => undefined,
  });

  await sql.unsafe(migration);

  let ledger: MemoryLedger;
  let chain: MemoryChain;
  let card: CardSandboxAdapter;
  let crypto: CryptoNativeAdapter;
  let rails: RailRegistry;
  let pay: PayService;

  beforeEach(async () => {
    await sql`TRUNCATE pay.settlements, pay.payment_events, pay.payments, pay.payment_profiles, pay.merchants RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    chain = new MemoryChain();
    card = new CardSandboxAdapter({ secret: SECRET });
    crypto = new CryptoNativeAdapter({ chain, secret: SECRET, minConfirmations: 6 });
    rails = new RailRegistry([card, crypto]);
    pay = new PayService(sql, ledger, rails);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  async function merchant(feeBps = 250, userId = MERCHANT_USER) {
    return pay.createMerchant({ userId, pricing: { feeBps } });
  }

  /** A card payment, authorized and ready to capture. */
  async function cardPayment(merchantId: string, amount = '100', assetId = 'USDT'): Promise<PaymentView> {
    const payment = await pay.createPayment({
      merchantId,
      amount: amt(amount),
      assetId,
      method: 'card',
      railAdapter: 'card-sandbox',
      instrument: { kind: 'card', token: 'tok_ok' },
    });
    return pay.authorize(payment.id);
  }

  /** A crypto payment with the payer's transfer already confirmed on chain. */
  async function cryptoPayment(merchantId: string, amount = '100', assetId = 'USDT'): Promise<PaymentView> {
    const payment = await pay.createPayment({
      merchantId,
      amount: amt(amount),
      assetId,
      method: 'crypto',
      railAdapter: 'crypto-native',
    });
    const address = await chain.acceptanceAddress(payment.id, assetId);
    chain.credit({ address, assetId, amount: amt(amount), from: '0xbuyer', confirmations: 12 });
    return pay.authorize(payment.id);
  }

  /** Settle with wide explicit bounds so the test never straddles UTC midnight. */
  async function settle(merchantId: string, window: string, assetId = 'USDT') {
    return pay.settleWindow({
      merchantId,
      window,
      assetId,
      from: new Date(Date.now() - 24 * 3600_000),
      to: new Date(Date.now() + 24 * 3600_000),
    });
  }

  const availableOf = async (userId: string, assetId = 'USDT') =>
    formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
  const clearingOf = async (merchantId: string, assetId = 'USDT') =>
    formatAmount((await ledger.balance(merchantClearing(merchantId, assetId))).amount);
  /**
   * Everything held for a user in an asset, across every purpose (P0-3).
   *
   * Stronger than the single-account read it replaces: "nothing is held" now
   * means no hold under ANY purpose, rather than none under one chosen key.
   */
  const heldTotalOf = async (userId: string, assetId = 'USDT') => {
    const all = await ledger.balances('user', userId);
    return formatAmount(
      all.filter((b) => b.account.kind === 'hold' && b.account.assetId === assetId).reduce((acc, b) => acc + b.amount, 0n),
    );
  };
  const feesOf = async (assetId = 'USDT') => formatAmount((await ledger.balance(houseFees('pay', assetId))).amount);
  const boundaryOf = async (rail: string, assetId = 'USDT') => formatAmount((await ledger.balance(railBoundary(rail, assetId))).amount);

  const events = async (paymentId: string) => (await pay.history(paymentId)).map((e) => e.event);

  function signed(rail: 'card-sandbox' | 'crypto-native', payload: Record<string, unknown>, at = new Date()) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(at.getTime() / 1000).toString();
    const prefix = rail === 'card-sandbox' ? 'x-sandbox' : 'x-chain';
    return {
      headers: { [`${prefix}-signature`]: signPayload(SECRET, timestamp, body), [`${prefix}-timestamp`]: timestamp },
      body,
    };
  }

  // ── The lifecycle, on both v1 adapters ────────────────────────────────────

  describe('lifecycle — card-sandbox', () => {
    it('runs created → authorized → captured → settled, and the merchant can spend it', async () => {
      const m = await merchant(250);
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('100'),
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: 'tok_ok' },
      });
      expect(payment.status).toBe('created');
      // Nothing has moved. A created payment is a statement of intent.
      expect(await clearingOf(m.id)).toBe('0');

      const authorized = await pay.authorize(payment.id);
      expect(authorized.status).toBe('authorized');
      expect(authorized.railRef).toBe(`ch_${payment.id}`);
      // Still nothing: an authorization is a promise, not a movement.
      expect(await clearingOf(m.id)).toBe('0');

      const captured = await pay.capture(payment.id);
      expect(captured.status).toBe('captured');
      expect(formatAmount(captured.capturedAmount)).toBe('100');
      // Value is in the book now, waiting in clearing — not yet the merchant's
      // to spend, which is exactly what "captured but not settled" means.
      expect(await clearingOf(m.id)).toBe('100');
      expect(await availableOf(MERCHANT_USER)).toBe('0');
      expect(await boundaryOf('card-sandbox')).toBe('-100');

      const settlement = await settle(m.id, '2026-07-27');
      expect(settlement.status).toBe('posted');
      expect(formatAmount(settlement.gross)).toBe('100');
      expect(formatAmount(settlement.fees)).toBe('2.5');
      expect(formatAmount(settlement.net)).toBe('97.5');

      // §6.1: "merchant net posts to their ledger account — the same balance
      // graph they trade and spend from".
      expect(await availableOf(MERCHANT_USER)).toBe('97.5');
      expect(await clearingOf(m.id)).toBe('0');
      expect(await feesOf()).toBe('2.5');

      expect((await pay.getPayment(payment.id)).status).toBe('settled');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('appends every transition and overwrites nothing', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id);
      await pay.capture(payment.id);
      await settle(m.id, 'w-history');

      expect(await events(payment.id)).toEqual([
        'created',
        'rail.authorize',
        'authorized',
        'rail.capture',
        'captured',
        'settlement.included',
        'settled',
      ]);
    });
  });

  describe('lifecycle — crypto-native', () => {
    it('runs the same flow on a real on-chain rail', async () => {
      const m = await merchant(100);
      const payment = await cryptoPayment(m.id, '2.5', 'USDT');

      expect(payment.status).toBe('authorized');
      expect(payment.railRef).toContain('addr_usdt_');

      await pay.capture(payment.id);
      expect(await clearingOf(m.id)).toBe('2.5');
      expect(await boundaryOf('crypto-native')).toBe('-2.5');

      const settlement = await settle(m.id, '2026-07-27');
      expect(formatAmount(settlement.net)).toBe('2.475');
      expect(await availableOf(MERCHANT_USER)).toBe('2.475');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('stays in `created` while the transfer is not yet final, and moves nothing', async () => {
      const m = await merchant();
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('100'),
        assetId: 'USDT',
        method: 'crypto',
        railAdapter: 'crypto-native',
      });
      const address = await chain.acceptanceAddress(payment.id, 'USDT');
      chain.credit({ address, assetId: 'USDT', amount: amt('100'), confirmations: 1 });

      const pending = await pay.authorize(payment.id);
      expect(pending.status).toBe('created');
      expect(pending.railRef).toBe(address);
      expect(await events(payment.id)).toContain('rail.pending');
      expect(ledger.journal()).toHaveLength(0);

      // Deep enough now — the same call authorizes.
      chain.setConfirmations(address, 12);
      expect((await pay.authorize(payment.id)).status).toBe('authorized');
    });

    it('books an on-chain overpayment at what actually arrived', async () => {
      const m = await merchant(0);
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('100'),
        assetId: 'USDT',
        method: 'crypto',
        railAdapter: 'crypto-native',
      });
      const address = await chain.acceptanceAddress(payment.id, 'USDT');
      chain.credit({ address, assetId: 'USDT', amount: amt('150'), confirmations: 12 });

      const authorized = await pay.authorize(payment.id);
      expect(formatAmount(authorized.amount)).toBe('150');

      await pay.capture(payment.id);
      // Booking 100 would leave 50 at an address nothing points at.
      expect(await clearingOf(m.id)).toBe('150');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });
  });

  // ── Refunds ───────────────────────────────────────────────────────────────

  describe('refunds', () => {
    it('refunds in full before settlement, out of clearing', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      const refunded = await pay.refund(payment.id, amt('100'));

      expect(refunded.status).toBe('refunded');
      expect(formatAmount(refunded.refundedAmount)).toBe('100');
      // The merchant was never paid, so nothing comes out of their balance.
      expect(await clearingOf(m.id)).toBe('0');
      expect(await availableOf(MERCHANT_USER)).toBe('0');
      expect(await boundaryOf('card-sandbox')).toBe('0');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refunds in part, leaves the payment settleable, and settles only the remainder', async () => {
      const m = await merchant(1000); // 10%
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      const partial = await pay.refund(payment.id, amt('40'));
      expect(partial.status).toBe('captured');
      expect(formatAmount(partial.refundedAmount)).toBe('40');
      expect(await clearingOf(m.id)).toBe('60');

      const settlement = await settle(m.id, 'w-partial');
      expect(formatAmount(settlement.gross)).toBe('60');
      expect(formatAmount(settlement.fees)).toBe('6');
      expect(await availableOf(MERCHANT_USER)).toBe('54');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refunds several times until the captured amount is exhausted', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      await pay.refund(payment.id, amt('25'));
      await pay.refund(payment.id, amt('25'));
      const last = await pay.refund(payment.id, amt('50'));

      expect(last.status).toBe('refunded');
      expect(await clearingOf(m.id)).toBe('0');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('REFUSES A REFUND EXCEEDING WHAT WAS CAPTURED, and moves nothing', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      await expect(pay.refund(payment.id, amt('100.000000000000000001'))).rejects.toMatchObject({
        code: 'pay.refund_exceeds_captured',
      });

      expect(await clearingOf(m.id)).toBe('100');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses to over-refund across several partial refunds', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      await pay.refund(payment.id, amt('70'));
      await expect(pay.refund(payment.id, amt('31'))).rejects.toMatchObject({ code: 'pay.refund_exceeds_captured' });
      expect(await clearingOf(m.id)).toBe('30');
    });

    it('refuses to refund a payment that was never captured', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      await expect(pay.refund(payment.id, amt('10'))).rejects.toMatchObject({ code: 'pay.invalid_transition' });
      expect(ledger.journal()).toHaveLength(0);
    });

    it('draws a post-settlement refund on the merchant, not on the clearing account', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);
      await settle(m.id, 'w-post');
      expect(await availableOf(MERCHANT_USER)).toBe('100');

      await pay.refund(payment.id, amt('40'));

      expect(await availableOf(MERCHANT_USER)).toBe('60');
      expect(await clearingOf(m.id)).toBe('0');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('fails a post-settlement refund the merchant cannot cover, rather than inventing the money', async () => {
      const m = await merchant(1000); // 10% — the merchant nets 90 of 100
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);
      await settle(m.id, 'w-short');
      expect(await availableOf(MERCHANT_USER)).toBe('90');

      // The fee is not returned on a refund, so the merchant is 10 short. The
      // ledger refuses, and the refund does not happen at the rail either —
      // which is the entire reason the ledger moves first.
      await expect(pay.refund(payment.id, amt('100'))).rejects.toThrow();

      expect(await availableOf(MERCHANT_USER)).toBe('90');
      expect(await feesOf()).toBe('10');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('reverses the ledger when the rail refuses the refund, leaving the merchant whole', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);
      expect(await clearingOf(m.id)).toBe('100');

      card.failNext('acquirer.unavailable', 'Simulated acquirer failure');
      await expect(pay.refund(payment.id, amt('60'))).rejects.toMatchObject({ code: 'pay.rail_failed' });

      // Debited, then put back. Both postings are in the journal — a ledger
      // reverses, it does not amend.
      expect(await clearingOf(m.id)).toBe('100');
      expect(await boundaryOf('card-sandbox')).toBe('-100');
      expect(await events(payment.id)).toContain('refund.reversed');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });

      // And the merchant can still be refunded afterwards.
      const retry = await pay.refund(payment.id, amt('60'));
      expect(formatAmount(retry.refundedAmount)).toBe('60');
      expect(await clearingOf(m.id)).toBe('40');
    });

    it('sends an on-chain refund back to the address that paid', async () => {
      const m = await merchant(0);
      const payment = await cryptoPayment(m.id, '5');
      await pay.capture(payment.id);

      await pay.refund(payment.id, amt('2'));

      const outbound = chain.outboundTransfers();
      expect(outbound).toHaveLength(1);
      expect(outbound[0]).toMatchObject({ to: '0xbuyer' });
      expect(formatAmount(outbound[0]!.amount)).toBe('2');
      expect(await clearingOf(m.id)).toBe('3');
    });
  });

  // ── Capture rules ─────────────────────────────────────────────────────────

  describe('capture', () => {
    it('REJECTS A CAPTURE EXCEEDING THE AUTHORIZED AMOUNT, before touching the rail', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      await expect(pay.capture(payment.id, { amount: amt('150') })).rejects.toMatchObject({
        code: 'pay.capture_exceeds_authorized',
      });

      // Nothing booked, and the payment is still capturable for the right amount.
      expect(ledger.journal()).toHaveLength(0);
      expect((await pay.getPayment(payment.id)).status).toBe('authorized');
      expect((await pay.capture(payment.id)).status).toBe('captured');
    });

    it('refuses a partial capture rather than pretending the interface supports one', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      await expect(pay.capture(payment.id, { amount: amt('60') })).rejects.toMatchObject({
        code: 'pay.partial_capture_unsupported',
      });
      expect(ledger.journal()).toHaveLength(0);
    });

    it('is idempotent — capturing twice books once', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      await pay.capture(payment.id);
      await pay.capture(payment.id);
      await pay.capture(payment.id);

      expect(await clearingOf(m.id)).toBe('100');
      expect(ledger.journal().filter((t) => t.reason === 'payment.captured')).toHaveLength(1);
    });

    it('refuses to capture a payment that was never authorized', async () => {
      const m = await merchant();
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('10'),
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
      });
      await expect(pay.capture(payment.id)).rejects.toMatchObject({ code: 'pay.invalid_transition' });
    });

    it('leaves the payment capturable when the rail fails mid-capture', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      card.failNext();
      await expect(pay.capture(payment.id)).rejects.toMatchObject({ code: 'pay.rail_failed' });

      // NOT failed. An authorization whose capture failed is still an
      // authorization, and abandoning it would strand the buyer's held funds.
      expect((await pay.getPayment(payment.id)).status).toBe('authorized');
      expect(ledger.journal()).toHaveLength(0);

      const captured = await pay.capture(payment.id);
      expect(captured.status).toBe('captured');
      expect(await clearingOf(m.id)).toBe('100');
    });
  });

  // ── Declines ──────────────────────────────────────────────────────────────

  describe('declines', () => {
    it('marks a declined authorization failed and moves nothing', async () => {
      const m = await merchant();
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('100'),
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: SANDBOX_DECLINE_TOKEN },
      });

      await expect(pay.authorize(payment.id)).rejects.toMatchObject({ code: 'pay.rail_declined' });

      const after = await pay.getPayment(payment.id);
      expect(after.status).toBe('failed');
      expect(await events(payment.id)).toEqual(['created', 'rail.authorize', 'failed']);
      expect(ledger.journal()).toHaveLength(0);
    });

    it('will not resurrect a failed payment', async () => {
      const m = await merchant();
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('100'),
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: SANDBOX_DECLINE_TOKEN },
      });
      await expect(pay.authorize(payment.id)).rejects.toThrow();
      await expect(pay.authorize(payment.id)).rejects.toMatchObject({ code: 'pay.invalid_transition' });
    });
  });

  // ── Webhooks ──────────────────────────────────────────────────────────────

  describe('webhooks', () => {
    it('A WEBHOOK DELIVERED TWICE CHANGES NOTHING', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      const delivery = signed('card-sandbox', {
        id: 'evt_capture_1',
        type: 'captured',
        ref: payment.railRef,
        amount: '100',
        assetId: 'USDT',
      });

      const first = await pay.handleWebhook('card-sandbox', delivery);
      expect(first.duplicate).toBe(false);
      expect(first.applied).toBe(true);
      expect(await clearingOf(m.id)).toBe('100');

      const journalBefore = ledger.journal().length;
      const eventsBefore = (await pay.history(payment.id)).length;

      const second = await pay.handleWebhook('card-sandbox', delivery);
      expect(second.duplicate).toBe(true);
      expect(second.applied).toBe(false);

      // Nothing. Not a second ledger transaction, not a second event row, not a
      // penny more in clearing.
      expect(ledger.journal()).toHaveLength(journalBefore);
      expect(await pay.history(payment.id)).toHaveLength(eventsBefore);
      expect(await clearingOf(m.id)).toBe('100');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('is unmoved by ten deliveries of the same event', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      const delivery = signed('card-sandbox', { id: 'evt_burst', type: 'captured', ref: payment.railRef, amount: '100' });

      for (let i = 0; i < 10; i++) await pay.handleWebhook('card-sandbox', delivery);

      expect(await clearingOf(m.id)).toBe('100');
      expect(ledger.journal().filter((t) => t.reason === 'payment.captured')).toHaveLength(1);
    });

    it('takes a payment from created to captured in one delivery when the rail says both', async () => {
      const m = await merchant();
      const payment = await pay.createPayment({
        merchantId: m.id,
        amount: amt('40'),
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: 'tok_ok' },
      });
      // Authorize so the rail reference exists, then let a webhook drive capture.
      await pay.authorize(payment.id);

      const outcome = await pay.handleWebhook(
        'card-sandbox',
        signed('card-sandbox', { id: 'evt_both', type: 'captured', ref: `ch_${payment.id}`, amount: '40' }),
      );

      expect(outcome.applied).toBe(true);
      expect((await pay.getPayment(payment.id)).status).toBe('captured');
      expect(await clearingOf(m.id)).toBe('40');
    });

    it('rejects a forged delivery without saying why', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      const genuine = signed('card-sandbox', { id: 'evt_x', type: 'captured', ref: payment.railRef, amount: '100' });
      const tampered = { ...genuine, body: genuine.body.replace('100', '100000') };

      await expect(pay.handleWebhook('card-sandbox', tampered)).rejects.toMatchObject({ code: 'pay.webhook_invalid' });
      expect(ledger.journal()).toHaveLength(0);
    });

    it('rejects a delivery signed for a different rail', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      // Correct secret, wrong header names — crypto-native's headers on the
      // card endpoint. There is no cross-rail credential.
      const delivery = signed('crypto-native', { id: 'evt_y', type: 'captured', ref: payment.railRef });
      await expect(pay.handleWebhook('card-sandbox', delivery)).rejects.toMatchObject({ code: 'pay.webhook_invalid' });
    });

    it('refuses to invent a payment from a verified event about an unknown reference', async () => {
      const delivery = signed('card-sandbox', { id: 'evt_ghost', type: 'captured', ref: 'ch_nobody', amount: '999' });
      await expect(pay.handleWebhook('card-sandbox', delivery)).rejects.toMatchObject({ code: 'pay.webhook_unmatched' });
      expect(ledger.journal()).toHaveLength(0);
    });

    it('records a refund webhook without acting on it', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      const outcome = await pay.handleWebhook(
        'card-sandbox',
        signed('card-sandbox', { id: 'evt_refund_ext', type: 'refunded', ref: payment.railRef, amount: '100' }),
      );

      // Recorded, not acted on: moving money because a rail said so, without a
      // refund we initiated, is a rail's bug becoming our liability.
      expect(outcome.duplicate).toBe(false);
      expect(outcome.applied).toBe(false);
      expect(await clearingOf(m.id)).toBe('100');
      expect(await events(payment.id)).toContain('webhook.refunded');
    });

    it('fails a payment on a failure webhook, and moves nothing', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      await pay.handleWebhook(
        'card-sandbox',
        signed('card-sandbox', { id: 'evt_fail', type: 'failed', ref: payment.railRef, failureCode: 'card.lost_stolen' }),
      );

      expect((await pay.getPayment(payment.id)).status).toBe('failed');
      expect(ledger.journal()).toHaveLength(0);
    });
  });

  // ── Settlement ────────────────────────────────────────────────────────────

  describe('settlement', () => {
    it('sweeps every captured payment in the window into one posting', async () => {
      const m = await merchant(200); // 2%
      for (const value of ['10', '20', '30']) {
        const payment = await cardPayment(m.id, value);
        await pay.capture(payment.id);
      }

      const settlement = await settle(m.id, 'w-sweep');

      expect(formatAmount(settlement.gross)).toBe('60');
      expect(formatAmount(settlement.fees)).toBe('1.2');
      expect(await availableOf(MERCHANT_USER)).toBe('58.8');
      expect(await clearingOf(m.id)).toBe('0');
    });

    it('is idempotent — re-running a window pays nobody twice', async () => {
      const m = await merchant(250);
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      const first = await settle(m.id, 'w-idem');
      const second = await settle(m.id, 'w-idem');
      const third = await settle(m.id, 'w-idem');

      expect(second.id).toBe(first.id);
      expect(third.id).toBe(first.id);
      expect(await availableOf(MERCHANT_USER)).toBe('97.5');
      expect(ledger.journal().filter((t) => t.reason === 'pay.settled')).toHaveLength(1);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('settles each asset separately — one window, two currencies, two settlements', async () => {
      const m = await merchant(0);
      const usdt = await cardPayment(m.id, '100', 'USDT');
      await pay.capture(usdt.id);
      const btc = await cardPayment(m.id, '0.5', 'BTC');
      await pay.capture(btc.id);

      const a = await settle(m.id, 'w-multi', 'USDT');
      const b = await settle(m.id, 'w-multi', 'BTC');

      expect(a.id).not.toBe(b.id);
      expect(await availableOf(MERCHANT_USER, 'USDT')).toBe('100');
      expect(await availableOf(MERCHANT_USER, 'BTC')).toBe('0.5');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.totalsByAsset().BTC).toBe('0');
    });

    it('does not settle one merchant’s takings into another’s account', async () => {
      const a = await merchant(0, MERCHANT_USER);
      const b = await merchant(0, OTHER_USER);

      const paymentA = await cardPayment(a.id, '100');
      await pay.capture(paymentA.id);
      const paymentB = await cardPayment(b.id, '70');
      await pay.capture(paymentB.id);

      await settle(a.id, 'w-sep');

      expect(await availableOf(MERCHANT_USER)).toBe('100');
      expect(await availableOf(OTHER_USER)).toBe('0');
      // B's money is untouched and still theirs, in their own clearing account.
      expect(await clearingOf(b.id)).toBe('70');
    });

    it('refuses an empty window rather than recording a payout obligation of nothing', async () => {
      const m = await merchant();
      await expect(settle(m.id, 'w-empty')).rejects.toMatchObject({ code: 'pay.nothing_to_settle' });
    });

    it('does not settle a payment that has not been captured', async () => {
      const m = await merchant();
      await cardPayment(m.id, '100'); // authorized only
      await expect(settle(m.id, 'w-uncaptured')).rejects.toMatchObject({ code: 'pay.nothing_to_settle' });
    });

    it('excludes a fully refunded payment from the window', async () => {
      const m = await merchant(0);
      const keep = await cardPayment(m.id, '30');
      await pay.capture(keep.id);
      const refunded = await cardPayment(m.id, '70');
      await pay.capture(refunded.id);
      await pay.refund(refunded.id, amt('70'));

      const settlement = await settle(m.id, 'w-refunded');
      expect(formatAmount(settlement.gross)).toBe('30');
      expect(await availableOf(MERCHANT_USER)).toBe('30');
    });

    it('refuses to settle a merchant with no fee rate and no configured default', async () => {
      await sql`
        INSERT INTO pay.merchants (user_id, mode, pricing, status)
        VALUES (${'33333333-3333-4333-8333-333333333333'}, 'gateway', '{}'::jsonb, 'active')
      `;
      const rows = await sql<Array<{ id: string }>>`
        SELECT id FROM pay.merchants WHERE user_id = ${'33333333-3333-4333-8333-333333333333'}
      `;
      const merchantId = rows[0]!.id;

      const payment = await cardPayment(merchantId, '100');
      await pay.capture(payment.id);

      // Settling at zero would be revenue that is not merely lost but invisible.
      await expect(settle(merchantId, 'w-nofee')).rejects.toMatchObject({ code: 'pay.merchant_pricing_invalid' });
      expect(await clearingOf(merchantId)).toBe('100');
    });

    it('refuses a fee that consumes the whole window', async () => {
      const m = await merchant(10_000); // 100%
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);
      await expect(settle(m.id, 'w-allfee')).rejects.toMatchObject({ code: 'pay.fee_exceeds_gross' });
      expect(await clearingOf(m.id)).toBe('100');
    });

    it('rounds the fee in the house’s favour by at most one unit of precision', async () => {
      const m = await merchant(1); // 0.01%
      const payment = await cardPayment(m.id, '0.000000000000000101');
      await pay.capture(payment.id);

      const settlement = await settle(m.id, 'w-dust');
      // gross × 1bps = 1.01e-20, which rounds up to one unit at 18dp.
      expect(formatAmount(settlement.fees)).toBe('0.000000000000000001');
      expect(formatAmount(settlement.net)).toBe('0.0000000000000001');
      expect(settlement.fees + settlement.net).toBe(settlement.gross);
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });
  });

  // ── Payout ────────────────────────────────────────────────────────────────

  describe('payout', () => {
    it('moves a settled window out of the book to a chain address', async () => {
      const m = await merchant(0);
      const payment = await cryptoPayment(m.id, '10');
      await pay.capture(payment.id);
      const settlement = await settle(m.id, 'w-payout');

      const paid = await pay.payoutSettlement({
        settlementId: settlement.id,
        railId: 'crypto-native',
        destination: { kind: 'crypto', ref: '0xmerchantwallet' },
      });

      expect(paid.status).toBe('paid_out');
      expect(paid.payoutRef).toBeTruthy();
      expect(await availableOf(MERCHANT_USER)).toBe('0');
      expect(await heldTotalOf(MERCHANT_USER)).toBe('0');
      expect(chain.totalSent('USDT')).toBe('10');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('returns the funds to the merchant when the payout rail refuses', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '50');
      await pay.capture(payment.id);
      const settlement = await settle(m.id, 'w-payout-fail');

      card.failNext('bank.rejected', 'Beneficiary account closed');
      await expect(
        pay.payoutSettlement({
          settlementId: settlement.id,
          railId: 'card-sandbox',
          destination: { kind: 'bank', ref: 'GB00CLOSED' },
        }),
      ).rejects.toMatchObject({ code: 'pay.rail_failed' });

      // Held, then released. There is no state in which the merchant's money is
      // neither available, nor held, nor gone with a reference against it.
      expect(await availableOf(MERCHANT_USER)).toBe('50');
      expect(await heldTotalOf(MERCHANT_USER)).toBe('0');
      expect((await pay.getSettlement(settlement.id)).status).toBe('failed');
      expect(ledger.reconcile()).toEqual({ ok: true });

      // And it can be retried onto a working destination.
      const retried = await pay.payoutSettlement({
        settlementId: settlement.id,
        railId: 'card-sandbox',
        destination: { kind: 'bank', ref: 'GB00WORKING' },
      });
      expect(retried.status).toBe('paid_out');
      expect(await availableOf(MERCHANT_USER)).toBe('0');
    });

    it('is idempotent — paying out twice pays once', async () => {
      const m = await merchant(0);
      const payment = await cryptoPayment(m.id, '10');
      await pay.capture(payment.id);
      const settlement = await settle(m.id, 'w-payout-idem');

      const request = {
        settlementId: settlement.id,
        railId: 'crypto-native',
        destination: { kind: 'crypto', ref: '0xmerchantwallet' },
      };
      await pay.payoutSettlement(request);
      await pay.payoutSettlement(request);

      expect(chain.outboundTransfers()).toHaveLength(1);
      expect(chain.totalSent('USDT')).toBe('10');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses to pay out a settlement that has not been posted', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '10');
      await pay.capture(payment.id);
      const settlement = await settle(m.id, 'w-payout-early');

      await sql`UPDATE pay.settlements SET status = 'pending' WHERE id = ${settlement.id}`;
      await expect(
        pay.payoutSettlement({ settlementId: settlement.id, railId: 'card-sandbox', destination: { kind: 'bank', ref: 'X' } }),
      ).rejects.toMatchObject({ code: 'pay.invalid_transition' });
    });
  });

  // ── Doctrine and invariants ───────────────────────────────────────────────

  describe('doctrine §0.6 — no balance outside the ledger', () => {
    it('keeps the books closed and reconciled after a long mixed run', async () => {
      const a = await merchant(250, MERCHANT_USER);
      const b = await merchant(75, OTHER_USER);

      // Card and crypto, captures, partial and full refunds, a decline, a
      // pending transfer, two settlements and a payout — all interleaved.
      for (let i = 0; i < 6; i++) {
        const cardPay = await cardPayment(a.id, `${10 + i}`);
        await pay.capture(cardPay.id);
        if (i % 3 === 0) await pay.refund(cardPay.id, amt('2'));

        const cryptoPay = await cryptoPayment(b.id, `${1 + i}`);
        await pay.capture(cryptoPay.id);
        if (i % 4 === 0) await pay.refund(cryptoPay.id, amt('1'));
      }

      const declined = await pay.createPayment({
        merchantId: a.id,
        amount: amt('99'),
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: SANDBOX_DECLINE_TOKEN },
      });
      await expect(pay.authorize(declined.id)).rejects.toThrow();

      const settlementA = await settle(a.id, 'w-mixed');
      const settlementB = await settle(b.id, 'w-mixed');

      await pay.payoutSettlement({
        settlementId: settlementB.id,
        railId: 'crypto-native',
        destination: { kind: 'crypto', ref: '0xb' },
      });

      // THE TWO CHECKS THAT MATTER. Every asset nets to zero across the whole
      // book, and a full replay of the journal agrees with every live balance.
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
      expect(ledger.verifyChain()).toEqual({ ok: true });

      // And the merchant's own account holds exactly what was settled to it.
      expect(await availableOf(MERCHANT_USER)).toBe(formatAmount(settlementA.net));
      expect(await clearingOf(a.id)).toBe('0');
      expect(await clearingOf(b.id)).toBe('0');
    });

    it('answers “what do we owe this merchant” from the ledger, not from our tables', async () => {
      const m = await merchant(0);
      const first = await cardPayment(m.id, '30');
      await pay.capture(first.id);
      const second = await cardPayment(m.id, '70');
      await pay.capture(second.id);

      // The clearing account is the answer, and it is reachable without reading
      // a single svc-pay table — which is what makes reconciliation meaningful.
      expect(formatAmount(await pay.clearingBalance(m.id, 'USDT'))).toBe('100');
    });

    it('holds no numeric balance column of its own', async () => {
      const m = await merchant(0);
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      const before = await sql<Array<{ amount: string }>>`SELECT amount FROM pay.payments WHERE id = ${payment.id}`;
      await pay.refund(payment.id, amt('40'));
      const after = await sql<Array<{ amount: string }>>`SELECT amount FROM pay.payments WHERE id = ${payment.id}`;

      // `amount` is the authorized amount and never moves. What was captured and
      // refunded is summed from the event log, which is why the two can never
      // disagree.
      expect(after[0]!.amount).toBe(before[0]!.amount);
      const view = await pay.getPayment(payment.id);
      expect(formatAmount(view.capturedAmount)).toBe('100');
      expect(formatAmount(view.refundedAmount)).toBe('40');
    });
  });

  describe('payment_events is append-only, enforced by the database', () => {
    it('refuses an UPDATE', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');
      await pay.capture(payment.id);

      await expect(sql`UPDATE pay.payment_events SET event = 'tampered' WHERE payment_id = ${payment.id}`).rejects.toThrow(/append-only/);
    });

    it('refuses a DELETE', async () => {
      const m = await merchant();
      const payment = await cardPayment(m.id, '100');

      await expect(sql`DELETE FROM pay.payment_events WHERE payment_id = ${payment.id}`).rejects.toThrow(/append-only/);
      expect((await pay.history(payment.id)).length).toBeGreaterThan(0);
    });
  });

  describe('merchants and rails', () => {
    it('onboards a merchant idempotently', async () => {
      const first = await merchant(250);
      const second = await merchant(250);
      expect(second.id).toBe(first.id);

      const rows = await sql`SELECT id FROM pay.merchants WHERE user_id = ${MERCHANT_USER}`;
      expect(rows).toHaveLength(1);
    });

    it('refuses a payment on an unknown rail before a row exists', async () => {
      const m = await merchant();
      await expect(
        pay.createPayment({ merchantId: m.id, amount: amt('1'), assetId: 'USDT', method: 'card', railAdapter: 'stripe' }),
      ).rejects.toThrow(/stripe/);

      const rows = await sql`SELECT id FROM pay.payments`;
      expect(rows).toHaveLength(0);
    });

    it('refuses a payment for a suspended merchant', async () => {
      const m = await merchant();
      await sql`UPDATE pay.merchants SET status = 'suspended' WHERE id = ${m.id}`;
      await expect(
        pay.createPayment({ merchantId: m.id, amount: amt('1'), assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' }),
      ).rejects.toMatchObject({ code: 'pay.merchant_inactive' });
    });

    it('refuses a zero or negative payment', async () => {
      const m = await merchant();
      for (const value of [0n, amt('-5')]) {
        await expect(
          pay.createPayment({ merchantId: m.id, amount: value, assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' }),
        ).rejects.toMatchObject({ code: 'pay.invalid_amount' });
      }
    });

    it('rejects malformed merchant pricing at onboarding', async () => {
      await expect(pay.createMerchant({ userId: OTHER_USER, pricing: { feeBps: 20_000 } })).rejects.toMatchObject({
        code: 'pay.merchant_pricing_invalid',
      });
      await expect(pay.createMerchant({ userId: OTHER_USER, pricing: { feeBps: -1 } })).rejects.toMatchObject({
        code: 'pay.merchant_pricing_invalid',
      });
    });

    it('reports an unknown payment rather than returning an empty one', async () => {
      await expect(pay.getPayment('44444444-4444-4444-8444-444444444444')).rejects.toBeInstanceOf(PayError);
    });
  });
}
