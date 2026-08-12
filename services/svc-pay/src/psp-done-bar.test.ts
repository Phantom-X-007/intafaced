/**
 * D26-P1-P1 Done bar — PSP path without third-party money library; merchant durability.
 *
 * Promise: one API creates payments across two registered rails with identical
 * create semantics; a rail outage yields a typed refusal (not a wrong status);
 * PSP merchant pricing + KYB history are durable; svc-pay never depends on a
 * named third-party money/PSP orchestrator lib. Card/PSP partner invent stays
 * refused (bank-payout absent / socket.psp-partners).
 * Break: silent success on down rail, fee invent, Hyperswitch/Stripe dep, KYB
 * history gap, dual-book.
 * Class: M. Leverage: PayService + CardSandbox + BankPayoutAbsent + kyb/psp
 * routers (Phase A — wire/extend, no second book, no card invent).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import type { Principal } from '@intafaced/auth';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { createEdgeContext, encodePrincipal, mergeRouters, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryLedger, formatAmount, merchantClearing } from '@intafaced/ledger-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createKybPspRouter } from './kyb-router.js';
import { KybService } from './kyb-service.js';
import { PayService } from './payment-service.js';
import { FORBIDDEN_THIRD_PARTY_MONEY_LIBS, PspModeService, assertNoThirdPartyMoneyLibrary } from './psp-mode.js';
import { BankPayoutAbsentAdapter } from './rails/bank-payout.js';
import { CardSandboxAdapter } from './rails/card-sandbox.js';
import { RailRegistry } from './rails/registry.js';
import { createPayRouter } from './router.js';
import type { UserMoneyService } from './user-money-service.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const EDGE_SECRET = 'svc-pay-psp-done-bar-edge-secret-32chars!!';
const MERCHANT_USER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '99999999-9999-4999-8999-999999999999';
const EDGE = createEdgeContext({ secret: EDGE_SECRET, serviceName: 'svc-pay' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: MERCHANT_USER,
    userId: MERCHANT_USER,
    sid: '33333333-3333-4333-8333-333333333333',
    scopes: ['pay:read', 'pay:write', 'admin:read', 'admin:write', 'admin:compliance'],
    tier: 'full',
    mfa: true,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signedHeaders(p: Principal = principal()): Record<string, string> {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

type WireBody = { result?: { data?: unknown }; error?: { message?: string; data?: { code?: string } } };

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('pay.psp Done bar (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'pay', url: URL, migrations });
  const sql = db.sql;

  let ledger: MemoryLedger;
  let card: CardSandboxAdapter;
  let rails: RailRegistry;
  let pay: PayService;
  let kyb: KybService;
  let psp: PspModeService;
  const stubUserMoney = {
    creditDeposit: async () => {
      throw new Error('unused');
    },
  } as unknown as UserMoneyService;

  beforeEach(async () => {
    await sql`
      TRUNCATE pay.merchant_kyb_events, pay.merchant_pricing_events, pay.merchant_status_events,
               pay.payment_events, pay.payments, pay.merchants
      RESTART IDENTITY CASCADE
    `;
    ledger = new MemoryLedger();
    card = new CardSandboxAdapter({ secret: 'psp-done-bar-card-sandbox-secret-32' });
    rails = new RailRegistry([card, new BankPayoutAbsentAdapter()]);
    pay = new PayService(sql, ledger, rails, { defaultFeeBps: 250 });
    kyb = new KybService(sql);
    psp = new PspModeService(sql);
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  async function mountDoors() {
    const router = mergeRouters(createPayRouter(pay, rails, stubUserMoney, null), createKybPspRouter(kyb, psp));
    const app = Fastify({ logger: false });
    await app.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: {
        router,
        createContext: ({ req }) => EDGE({ headers: req.headers, id: req.id }),
      } satisfies FastifyTRPCPluginOptions<typeof router>['trpcOptions'],
    });
    await app.ready();
    return app;
  }

  async function post(
    app: Awaited<ReturnType<typeof mountDoors>>,
    path: string,
    input: Record<string, unknown>,
    headers: Record<string, string> = signedHeaders(),
  ): Promise<{ statusCode: number; body: WireBody }> {
    const res = await app.inject({ method: 'POST', url: `/trpc/${path}`, headers, payload: input });
    return { statusCode: res.statusCode, body: res.json() as WireBody };
  }

  async function get(
    app: Awaited<ReturnType<typeof mountDoors>>,
    path: string,
    input?: Record<string, unknown>,
    headers: Record<string, string> = signedHeaders(),
  ): Promise<{ statusCode: number; body: WireBody }> {
    const q = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await app.inject({ method: 'GET', url: `/trpc/${path}${q}`, headers });
    return { statusCode: res.statusCode, body: res.json() as WireBody };
  }

  describe('pay.psp Done bar — public doors + dual-rail + durability', () => {
    it('refuses third-party money libs (Doctrine 5 / D-S-10)', () => {
      expect(() => assertNoThirdPartyMoneyLibrary()).not.toThrow();
      expect(FORBIDDEN_THIRD_PARTY_MONEY_LIBS).toEqual(expect.arrayContaining(['hyperswitch', 'stripe', '@juspay/hyperswitch']));
    });

    it('ONE PSP merchant: KYB + pricing durability + card rail capture + bank-payout typed refuse + outage typed refuse', async () => {
      const app = await mountDoors();

      const created = await post(app, 'merchant.create', {
        mode: 'gateway',
        pricing: { feeBps: 250 },
      });
      expect(created.statusCode).toBe(200);
      const merchant = created.body.result!.data as { id: string; mode: string };
      expect(merchant.mode).toBe('gateway');

      const enable = await post(
        app,
        'psp.enableMode',
        { merchantId: merchant.id, reason: 'own-the-merchant PSP contract signed' },
        signedHeaders(
          principal({
            userId: OPERATOR,
            sub: OPERATOR,
            scopes: ['admin:write', 'admin:read', 'admin:compliance', 'pay:read', 'pay:write'],
          }),
        ),
      );
      expect(enable.statusCode).toBe(200);
      expect((enable.body.result!.data as { mode: string }).mode).toBe('psp');

      const pricing = await post(
        app,
        'psp.setPricing',
        { merchantId: merchant.id, feeBps: 180, reason: 'negotiated enterprise band' },
        signedHeaders(principal({ userId: OPERATOR, sub: OPERATOR, scopes: ['admin:write', 'admin:read', 'pay:read', 'pay:write'] })),
      );
      expect(pricing.statusCode).toBe(200);
      expect((pricing.body.result!.data as { feeBps: number; changed: boolean }).feeBps).toBe(180);

      const hist = await get(
        app,
        'psp.pricingHistory',
        { merchantId: merchant.id },
        signedHeaders(principal({ userId: OPERATOR, sub: OPERATOR, scopes: ['admin:read'] })),
      );
      expect(hist.statusCode).toBe(200);
      const events = hist.body.result!.data as Array<{ fromFeeBps: number; toFeeBps: number; reason: string }>;
      expect(events[0]).toMatchObject({ fromFeeBps: 250, toFeeBps: 180 });
      expect(events[0]!.reason).toMatch(/enterprise/);

      const submit = await post(app, 'kyb.submit', {
        merchantId: merchant.id,
        kybRef: 'dossier-psp-done-bar-1',
        reason: 'merchant uploaded incorporation pack',
      });
      expect(submit.statusCode).toBe(200);

      const decide = await post(
        app,
        'kyb.decide',
        { merchantId: merchant.id, decision: 'approved', reason: 'docs match registry' },
        signedHeaders(principal({ userId: OPERATOR, sub: OPERATOR, scopes: ['admin:compliance', 'admin:read'] })),
      );
      expect(decide.statusCode).toBe(200);
      expect((decide.body.result!.data as { kybStatus: string }).kybStatus).toBe('approved');

      // Rail A — card-sandbox: identical create API → authorize → capture.
      const payA = await post(app, 'payment.create', {
        merchantId: merchant.id,
        amount: '40.00',
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: 'tok_ok' },
      });
      expect(payA.statusCode).toBe(200);
      const paymentA = payA.body.result!.data as { id: string; status: string; railAdapter: string };
      expect(paymentA.railAdapter).toBe('card-sandbox');
      expect(paymentA.status).toBe('created');

      const authA = await post(app, 'payment.authorize', { paymentId: paymentA.id });
      expect(authA.statusCode).toBe(200);
      const capA = await post(app, 'payment.capture', { paymentId: paymentA.id });
      expect(capA.statusCode).toBe(200);
      expect((capA.body.result!.data as { status: string }).status).toBe('captured');
      expect(formatAmount((await ledger.balance(merchantClearing(merchant.id, 'USDT'))).amount)).toBe('40');

      // Rail B — bank-payout (payout-only / absent sponsor): same create door, typed refuse.
      const payB = await post(app, 'payment.create', {
        merchantId: merchant.id,
        amount: '10.00',
        assetId: 'USDT',
        method: 'bank',
        railAdapter: 'bank-payout',
      });
      expect(payB.statusCode).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(payB.body)).toMatch(/pay\.rail_capability|does not support authorize|rail_not_live|absent/i);

      // Outage on card-sandbox → typed refusal, not wrong status.
      card.failNext('acquirer.unavailable', 'Simulated acquirer failure');
      const payOut = await post(app, 'payment.create', {
        merchantId: merchant.id,
        amount: '5.00',
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
        instrument: { kind: 'card', token: 'tok_ok' },
      });
      expect(payOut.statusCode).toBe(200);
      const outId = (payOut.body.result!.data as { id: string }).id;
      const authOut = await post(app, 'payment.authorize', { paymentId: outId });
      expect(authOut.statusCode).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(authOut.body)).toMatch(/pay\.rail_declined|pay\.rail_failed|unavailable/i);
      const stuck = await pay.getPayment(outId);
      expect(stuck.status).toBe('failed');

      await app.close();
    });
  });
}
