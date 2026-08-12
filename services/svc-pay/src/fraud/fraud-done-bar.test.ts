/**
 * D26-P1-P5 Done bar — Scoring + chargeback **mechanism**; list content Class X.
 *
 * Promise: explainable scoring is reachable on the merchant tRPC door; review
 * queue accepts only review outcomes with reasons; dispute case machine opens /
 * contests / closes without calling ledger chargeback recipes; blocklist
 * **content** stays caller-supplied (Class X).
 * Break: silent decline, forged review enqueue, chargebackOpen wire invent,
 * inventing IP/device lists inside svc-pay.
 * Class: M (mechanism). Leverage: fraud/evaluate + review-queue + dispute-case
 * + router fraud.* (Phase A — extend, no second book).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { INTERACTIVE_ONLY_SCOPES, issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { createPayRouter } from '../router.js';
import { PayError, type PayService, type PaymentView } from '../payment-service.js';
import type { UserMoneyService } from '../user-money-service.js';
import { RailRegistry } from '../rails/registry.js';
import { CardSandboxAdapter } from '../rails/card-sandbox.js';
import { evaluateFraud } from './evaluate.js';
import { defaultDisputeCaseStore } from './dispute-case.js';
import { defaultFraudReviewQueue } from './review-queue.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const authConfig = {
  secret: 'a-fraud-done-bar-signing-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = '66666666-6666-4666-8666-666666666666';
const MERCHANT = '55555555-5555-4555-8555-555555555555';
const PAYMENT = '44444444-4444-4444-8444-444444444444';
const here = dirname(fileURLToPath(import.meta.url));

void INTERACTIVE_ONLY_SCOPES;

async function ctx(scopes: string[]): Promise<Context> {
  if (scopes.length === 0) return { principal: null, region: 'DE', requestId: 'fraud-done-1' };
  const { token } = await issueAccessToken(
    {
      userId: USER,
      sessionId: '77777777-7777-4777-8777-777777777777',
      scopes,
      tier: 'full',
      mfa: true,
    },
    authConfig,
  );
  return { principal: await verifyAccessToken(token, authConfig), region: 'DE', requestId: 'fraud-done-1' };
}

function paymentView(overrides: Partial<PaymentView> = {}): PaymentView {
  return {
    id: PAYMENT,
    merchantId: MERCHANT,
    profileId: null,
    amount: amt('100'),
    assetId: 'USDT',
    method: 'card',
    railAdapter: 'card-sandbox',
    railRef: 'ch_1',
    status: 'captured',
    capturedAmount: amt('100'),
    refundedAmount: 0n,
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  };
}

function stubPay(): PayService {
  return {
    getMerchant: async () => ({
      id: MERCHANT,
      userId: USER,
      mode: 'gateway',
      tier: 0,
      kybStatus: 'none',
      kybRef: null,
      status: 'active',
      pricing: { feeBps: 250 },
      settlementPrefs: {},
    }),
    getPayment: async () => paymentView(),
    markDisputed: async () => paymentView({ status: 'disputed' }),
    listPayments: async () => [],
    clearingBalance: async () => amt('0'),
    merchantBalance: async () => amt('0'),
    createPayment: async () => paymentView({ status: 'created' }),
    authorize: async () => paymentView({ status: 'authorized' }),
    capture: async () => paymentView(),
    refund: async () => {
      throw new PayError('unused', 'pay.invalid_transition');
    },
    history: async () => [],
  } as unknown as PayService;
}

describe('pay.fraud Done bar — scoring + chargeback case mechanism (public doors)', () => {
  const rails = new RailRegistry([new CardSandboxAdapter({ secret: 'fraud-done-bar-secret-32chars!!!!' })]);
  const stubUserMoney = {
    creditDeposit: async () => {
      throw new Error('unused');
    },
  } as unknown as UserMoneyService;
  const router = createPayRouter(stubPay(), rails, stubUserMoney, null);
  const caller = async (scopes: string[]) => router.createCaller(await ctx(scopes));

  beforeEach(() => {
    // Process-local defaults — clear between tests by resolving/ignoring leftovers.
    for (const c of defaultFraudReviewQueue.listOpen()) {
      try {
        defaultFraudReviewQueue.resolve({ id: c.id, outcome: 'allow', actorId: 'cleanup' });
      } catch {
        /* already closed */
      }
    }
  });

  it('scoring door: decline is explainable; missing signal refuses silent allow when rule configured', async () => {
    const api = await caller([]);
    const declined = await api.fraud.evaluate({
      merchantId: MERCHANT,
      amount: '10',
      assetId: 'USDT',
      ip: '203.0.113.9',
      blocklists: { ips: ['203.0.113.9'] },
    });
    expect(declined.outcome).toBe('decline');
    expect(declined.reasons[0]?.ruleId).toBe('blocklist_ip');
    expect(declined.reasons[0]?.detail.length).toBeGreaterThan(0);

    // Content stays caller-supplied — evaluateFraud has no baked-in production lists.
    const src = readFileSync(join(here, 'evaluate.ts'), 'utf8');
    expect(src).not.toMatch(/203\.0\.113\.|1\.2\.3\.4|evil-device/);
    expect(src).toMatch(/Class X|counsel|caller supplies|caller-owned/i);

    const missing = evaluateFraud({
      merchantId: MERCHANT,
      amount: '10',
      assetId: 'USDT',
      thresholds: { maxPaymentsInWindow: 2 },
      // recentPaymentCount omitted → unavailable signal, not silent allow
    });
    expect(missing.outcome).not.toBe('allow');
    expect(missing.reasons.some((r) => /unavailable/i.test(r.detail))).toBe(true);
  });

  it('review queue door: only review outcomes enqueue; resolve requires actor', async () => {
    const api = await caller(['pay:write', 'admin:treasury']);
    const enq = await api.fraud.enqueueReview({
      id: 'fraud-done-rev-1',
      merchantId: MERCHANT,
      amount: '99',
      assetId: 'USDT',
      recentPaymentCount: 20,
      thresholds: { maxPaymentsInWindow: 3 },
    });
    expect(enq.status).toBe('open');
    expect(enq.reasons.length).toBeGreaterThan(0);

    const allowAttempt = await api.fraud
      .enqueueReview({
        id: 'fraud-done-rev-allow',
        merchantId: MERCHANT,
        amount: '1',
        assetId: 'USDT',
      })
      .catch((e: unknown) => e);
    expect(String(allowAttempt)).toMatch(/pay\.fraud_review_not_review|BAD_REQUEST/);

    const resolved = await api.fraud.resolveReview({
      id: 'fraud-done-rev-1',
      outcome: 'decline',
      note: 'manual confirm velocity',
    });
    expect(resolved.status).toBe('declined');
    expect(resolved.resolvedBy).toBe(USER);
  });

  it('chargeback case mechanism: open → contest → won; ledger recipes stay unwired', async () => {
    const disputeId = `dsp-done-bar-${Date.now()}`;
    const api = await caller(['admin:treasury', 'pay:read']);
    const opened = await api.fraud.openDispute({
      disputeId,
      paymentId: PAYMENT,
      merchantId: MERCHANT,
      amount: '100',
      assetId: 'USDT',
      reasonCode: '10.4',
      markPaymentDisputed: true,
    });
    expect(opened.status).toBe('open');
    expect(opened.ledgerWire).toBe('unwired');
    expect(opened.paymentMarkedDisputed).toBe(true);

    const contested = await api.fraud.contestDispute({ disputeId });
    expect(contested.status).toBe('contested');

    const won = await api.fraud.markDisputeWon({ disputeId });
    expect(won.status).toBe('won');

    const got = await api.fraud.getDispute({ disputeId });
    expect(got.ledgerWire).toBe('unwired');

    const paymentSrc = readFileSync(join(here, '..', 'payment-service.ts'), 'utf8');
    const routerSrc = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    expect(paymentSrc).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
    expect(routerSrc).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);

    // Store still holds the case (mechanism complete without money wire).
    expect(defaultDisputeCaseStore.get(disputeId)?.status).toBe('won');
  });
});
