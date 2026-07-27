import { describe, expect, it, beforeEach } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { createPayRouter } from './router.js';
import { PayError, type PayService, type PaymentView, type SettlementRecord } from './payment-service.js';
import { RailRegistry } from './rails/registry.js';
import { CardSandboxAdapter } from './rails/card-sandbox.js';

/**
 * The tRPC boundary.
 *
 * No database and no ledger: the service is a stub, because what this file is
 * about is the CONTRACT, not the payments maths. Three things cross this
 * boundary and every one of them is a way to lose money quietly:
 *
 *   1. Money, which is a decimal string in both directions. A JSON number that
 *      slips through is a float in a payments book.
 *   2. Errors, which a caller has to be able to tell apart — a declined card,
 *      a malformed request and an unavailable rail need three different
 *      responses from a merchant's integration, and collapsing them into
 *      "500" costs somebody a day.
 *   3. Authority. Taking a payment and sending money back out are not the same
 *      permission, and §22 says pay is custodial, so verification applies.
 */

const authConfig = {
  secret: 'a-test-signing-secret-that-is-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = '66666666-6666-4666-8666-666666666666';
const MERCHANT = '55555555-5555-4555-8555-555555555555';
const PAYMENT = '44444444-4444-4444-8444-444444444444';
const SETTLEMENT = '33333333-3333-4333-8333-333333333333';

/**
 * `pay` is `OPEN_FULL` in the jurisdiction matrix — custodial Fiat Plane, so
 * `full` verification is the floor. Anything less is refused by the guard, not
 * by this service.
 */
async function ctx(scopes: string[], opts: { tier?: 'none' | 'basic' | 'full'; region?: string } = {}): Promise<Context> {
  const region = opts.region ?? 'DE';
  if (scopes.length === 0) return { principal: null, region, requestId: 'req-1' };

  const { token } = await issueAccessToken(
    {
      userId: USER,
      sessionId: '77777777-7777-4777-8777-777777777777',
      scopes,
      tier: opts.tier ?? 'full',
      mfa: true,
    },
    authConfig,
  );
  return { principal: await verifyAccessToken(token, authConfig), region, requestId: 'req-1' };
}

// ── The stub ─────────────────────────────────────────────────────────────────

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
    status: 'authorized',
    capturedAmount: 0n,
    refundedAmount: 0n,
    createdAt: new Date('2026-07-27T12:00:00.000Z'),
    ...overrides,
  };
}

function settlementRecord(overrides: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    id: SETTLEMENT,
    merchantId: MERCHANT,
    window: '2026-07-27',
    assetId: 'USDT',
    gross: amt('100'),
    fees: amt('2.5'),
    net: amt('97.5'),
    payoutMethod: 'ledger',
    payoutRef: null,
    payoutAttempts: 0,
    status: 'posted',
    ...overrides,
  };
}

interface Stub {
  service: PayService;
  calls: Array<{ method: string; args: unknown[] }>;
  /** Make the next service call throw this. */
  fail(err: unknown): void;
}

function stubService(): Stub {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let nextError: unknown = null;

  const record = <T>(method: string, result: (...args: never[]) => T) =>
    ((...args: never[]) => {
      calls.push({ method, args });
      if (nextError) {
        const err = nextError;
        nextError = null;
        return Promise.reject(err);
      }
      return Promise.resolve(result(...args));
    }) as never;

  const service = {
    createMerchant: record('createMerchant', () => ({
      id: MERCHANT,
      userId: USER,
      mode: 'gateway' as const,
      tier: 0,
      kybStatus: 'none' as const,
      status: 'active' as const,
      pricing: { feeBps: 250 },
      settlementPrefs: {},
    })),
    createProfile: record('createProfile', () => ({ id: SETTLEMENT, merchantId: MERCHANT })),
    clearingBalance: record('clearingBalance', () => amt('100.5')),
    merchantBalance: record('merchantBalance', () => amt('97.5')),
    createPayment: record('createPayment', () => paymentView({ status: 'created', railRef: null })),
    authorize: record('authorize', () => paymentView()),
    capture: record('capture', () => paymentView({ status: 'captured', capturedAmount: amt('100') })),
    refund: record('refund', () => paymentView({ status: 'refunded', capturedAmount: amt('100'), refundedAmount: amt('100') })),
    getPayment: record('getPayment', () => paymentView()),
    history: record('history', () => [
      { id: PAYMENT, event: 'created', payload: { amount: '100' }, railEventId: null, ts: new Date('2026-07-27T12:00:00.000Z') },
    ]),
    settleWindow: record('settleWindow', () => settlementRecord()),
    payoutSettlement: record('payoutSettlement', () =>
      settlementRecord({ status: 'paid_out', payoutMethod: 'card-sandbox', payoutRef: 'po_1' }),
    ),
    getSettlement: record('getSettlement', () => settlementRecord()),
  } as unknown as PayService;

  return {
    service,
    calls,
    fail: (err) => {
      nextError = err;
    },
  };
}

const rails = new RailRegistry([new CardSandboxAdapter({ secret: 'router-test-secret-at-least-32-characters' })]);

let stub: Stub;
let router: ReturnType<typeof createPayRouter>;

beforeEach(() => {
  stub = stubService();
  router = createPayRouter(stub.service, rails);
});

const caller = async (scopes: string[], opts?: Parameters<typeof ctx>[1]) => router.createCaller(await ctx(scopes, opts));

// ── Money on the wire ────────────────────────────────────────────────────────

describe('money crosses this boundary as a decimal string', () => {
  it('accepts a decimal string and hands the service a scaled bigint', async () => {
    const api = await caller(['pay:write']);
    await api.payment.create({
      merchantId: MERCHANT,
      amount: '100.5',
      assetId: 'USDT',
      method: 'card',
      railAdapter: 'card-sandbox',
    });

    const call = stub.calls.find((c) => c.method === 'createPayment')!;
    const input = call.args[0] as { amount: unknown };
    // Parsed at the boundary, so the service never sees a string it has to
    // remember to parse — the one place a float could get in.
    expect(typeof input.amount).toBe('bigint');
    expect(input.amount).toBe(amt('100.5'));
  });

  it('REJECTS A JSON NUMBER, which is how a float gets into a payments book', async () => {
    const api = await caller(['pay:write']);
    await expect(
      api.payment.create({
        merchantId: MERCHANT,
        // An untyped HTTP caller doing arithmetic in JavaScript sends this.
        amount: 100.5 as never,
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
      }),
    ).rejects.toThrow();

    expect(stub.calls.filter((c) => c.method === 'createPayment')).toHaveLength(0);
  });

  it('rejects more precision than the ledger carries', async () => {
    const api = await caller(['pay:write']);
    await expect(
      api.payment.create({
        merchantId: MERCHANT,
        // 19 decimal places. The ledger reconciles to 18; silently truncating
        // the last digit is a rounding decision nobody made.
        amount: '1.0000000000000000001',
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
      }),
    ).rejects.toThrow();
  });

  it('accepts exactly 18 decimal places', async () => {
    const api = await caller(['pay:write']);
    await expect(
      api.payment.create({
        merchantId: MERCHANT,
        amount: '1.000000000000000001',
        assetId: 'USDT',
        method: 'card',
        railAdapter: 'card-sandbox',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a negative amount, an empty string, and prose', async () => {
    const api = await caller(['pay:write']);
    for (const amount of ['-1', '', 'one hundred', '1e3', '0x10', ' 1 ']) {
      await expect(
        api.payment.create({ merchantId: MERCHANT, amount, assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' }),
      ).rejects.toThrow();
    }
    expect(stub.calls.filter((c) => c.method === 'createPayment')).toHaveLength(0);
  });

  it('returns every amount as a decimal string, never a bigint or a number', async () => {
    const api = await caller(['pay:write']);
    const payment = await api.payment.capture({ paymentId: PAYMENT });

    expect(payment.amount).toBe('100');
    expect(payment.capturedAmount).toBe('100');
    expect(payment.refundedAmount).toBe('0');
    for (const value of [payment.amount, payment.capturedAmount, payment.refundedAmount]) {
      expect(typeof value).toBe('string');
    }
    // And the whole response survives JSON, which a bigint would not.
    expect(() => JSON.stringify(payment)).not.toThrow();
  });

  it('returns settlement gross, fees and net as decimal strings that still add up', async () => {
    const api = await caller(['pay:write']);
    const settlement = await api.settlement.run({ merchantId: MERCHANT, window: '2026-07-27', assetId: 'USDT' });

    expect(settlement).toMatchObject({ gross: '100', fees: '2.5', net: '97.5' });
    expect(formatAmount(amt(settlement.fees) + amt(settlement.net))).toBe(settlement.gross);
  });

  it('reports merchant balances from the ledger as decimal strings', async () => {
    const api = await caller(['pay:read']);
    await expect(api.merchant.balances({ merchantId: MERCHANT, assetId: 'USDT' })).resolves.toEqual({
      clearing: '100.5',
      available: '97.5',
    });
  });

  it('passes an optional capture amount through as a bigint, and omits it when absent', async () => {
    const api = await caller(['pay:write']);

    await api.payment.capture({ paymentId: PAYMENT, amount: '60' });
    expect((stub.calls.at(-1)!.args[1] as { amount: unknown }).amount).toBe(amt('60'));

    await api.payment.capture({ paymentId: PAYMENT });
    // Not `{ amount: undefined }` — the service branches on the key's presence,
    // and an explicit undefined would read as "capture zero".
    expect(stub.calls.at(-1)!.args[1]).toEqual({});
  });
});

// ── Error mapping ────────────────────────────────────────────────────────────

describe('a caller can tell the failures apart', () => {
  const codeOf = async (err: unknown) => (err as { code?: string }).code;

  it('maps a declined card to BAD_REQUEST — the merchant retries with another instrument', async () => {
    stub.fail(new PayError('Issuer declined', 'pay.rail_declined', { failureCode: 'card.declined' }));
    const api = await caller(['pay:write']);

    const err = await api.payment.authorize({ paymentId: PAYMENT }).catch((e: unknown) => e);
    expect(await codeOf(err)).toBe('BAD_REQUEST');
    // The code travels in the message so a client branches on it rather than
    // parsing prose.
    expect((err as Error).message).toContain('pay.rail_declined');
  });

  it('maps an over-capture to CONFLICT — the integration is wrong, retrying will not help', async () => {
    stub.fail(new PayError('too much', 'pay.capture_exceeds_authorized'));
    const api = await caller(['pay:write']);

    const err = await api.payment.capture({ paymentId: PAYMENT }).catch((e: unknown) => e);
    expect(await codeOf(err)).toBe('CONFLICT');
  });

  it('maps an over-refund and a double-spend guard to CONFLICT', async () => {
    for (const code of ['pay.refund_exceeds_captured', 'pay.refund_in_flight', 'pay.invalid_transition'] as const) {
      stub.fail(new PayError('nope', code));
      const api = await caller(['pay:refund']);
      const err = await api.payment.refund({ paymentId: PAYMENT, amount: '1' }).catch((e: unknown) => e);
      expect(await codeOf(err)).toBe('CONFLICT');
    }
  });

  it('maps an unavailable rail to BAD_REQUEST and keeps the rail code for the operator', async () => {
    stub.fail(new PayError('Acquirer unavailable', 'pay.rail_failed', { failureCode: 'acquirer.unavailable' }));
    const api = await caller(['pay:write']);

    const err = await api.payment.capture({ paymentId: PAYMENT }).catch((e: unknown) => e);
    expect(await codeOf(err)).toBe('BAD_REQUEST');
    expect((err as Error).message).toContain('pay.rail_failed');
  });

  it('maps a missing payment to NOT_FOUND', async () => {
    stub.fail(new PayError('gone', 'pay.payment_not_found'));
    const api = await caller(['pay:read']);
    expect(await codeOf(await api.payment.get({ paymentId: PAYMENT }).catch((e: unknown) => e))).toBe('NOT_FOUND');
  });

  it('maps a suspended merchant to FORBIDDEN, not to a validation error', async () => {
    stub.fail(new PayError('suspended', 'pay.merchant_inactive'));
    const api = await caller(['pay:write']);
    const err = await api.payment
      .create({ merchantId: MERCHANT, amount: '1', assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' })
      .catch((e: unknown) => e);
    expect(await codeOf(err)).toBe('FORBIDDEN');
  });

  it('maps a failed webhook verification to UNAUTHORIZED', async () => {
    stub.fail(new PayError('bad signature', 'pay.webhook_invalid'));
    const api = await caller(['pay:write']);
    const err = await api.settlement.run({ merchantId: MERCHANT, window: 'w', assetId: 'USDT' }).catch((e: unknown) => e);
    expect(await codeOf(err)).toBe('UNAUTHORIZED');
  });

  it('lets a non-PayError through untranslated rather than mislabelling it', async () => {
    // An InsufficientFundsError from the ledger is not a bad request; dressing
    // it up as one would tell a merchant to retry something that cannot succeed.
    stub.fail(new Error('ledger.insufficient_funds'));
    const api = await caller(['pay:refund']);
    const err = await api.payment.refund({ paymentId: PAYMENT, amount: '1' }).catch((e: unknown) => e);
    expect((err as Error).message).toContain('ledger.insufficient_funds');
  });
});

// ── Authority ────────────────────────────────────────────────────────────────

describe('authority', () => {
  it('serves health to anyone, and names the registered rails', async () => {
    const api = await caller([]);
    await expect(api.health()).resolves.toEqual({ ok: true, service: 'svc-pay', rails: ['card-sandbox'] });
  });

  it('refuses an anonymous caller everywhere else', async () => {
    const api = await caller([]);
    await expect(api.payment.get({ paymentId: PAYMENT })).rejects.toThrow(/Authentication required/);
    await expect(api.railHealth()).rejects.toThrow(/Authentication required/);
  });

  it('TAKING A PAYMENT DOES NOT GRANT REFUNDING IT', async () => {
    const api = await caller(['pay:write']);
    // `pay:write` implies `pay:read` and nothing else. Money going back out is
    // its own authority.
    await expect(api.payment.refund({ paymentId: PAYMENT, amount: '1' })).rejects.toThrow(/pay:refund/);
    expect(stub.calls.filter((c) => c.method === 'refund')).toHaveLength(0);
  });

  it('does not let a refunder move a settlement out of the book', async () => {
    const api = await caller(['pay:refund']);
    await expect(
      api.settlement.payout({ settlementId: SETTLEMENT, railId: 'card-sandbox', destination: { kind: 'bank', ref: 'X' } }),
    ).rejects.toThrow(/pay:payout/);
  });

  it('lets each write scope read, because seeing what you changed is implied', async () => {
    for (const scope of ['pay:write', 'pay:refund', 'pay:payout']) {
      const api = await caller([scope]);
      await expect(api.payment.get({ paymentId: PAYMENT })).resolves.toMatchObject({ id: PAYMENT });
    }
  });

  it('does not let a reader write', async () => {
    const api = await caller(['pay:read']);
    await expect(
      api.payment.create({ merchantId: MERCHANT, amount: '1', assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' }),
    ).rejects.toThrow(/pay:write/);
  });

  it('does not accept another module’s scope', async () => {
    const api = await caller(['trade:write']);
    await expect(api.payment.get({ paymentId: PAYMENT })).rejects.toThrow(/pay:read/);
  });

  it('applies the jurisdiction matrix: pay is custodial, so `full` verification is the floor', async () => {
    // §22 — the sovereignty law follows custody. Settlement lands in a ledger
    // account we control, so this is the Fiat Plane and tiering applies.
    for (const tier of ['none', 'basic'] as const) {
      const api = await caller(['pay:write'], { tier });
      await expect(
        api.payment.create({ merchantId: MERCHANT, amount: '1', assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' }),
      ).rejects.toThrow(/full/);
    }

    const verified = await caller(['pay:write'], { tier: 'full' });
    await expect(
      verified.payment.create({ merchantId: MERCHANT, amount: '1', assetId: 'USDT', method: 'card', railAdapter: 'card-sandbox' }),
    ).resolves.toBeDefined();
  });

  it('validates identifiers at the boundary before the service is touched', async () => {
    const api = await caller(['pay:read']);
    await expect(api.payment.get({ paymentId: 'not-a-uuid' })).rejects.toThrow();
    await expect(api.merchant.balances({ merchantId: MERCHANT, assetId: '' })).rejects.toThrow();
    expect(stub.calls).toHaveLength(0);
  });
});

// ── Read surfaces ────────────────────────────────────────────────────────────

describe('read surfaces', () => {
  it('serialises the append-only history with ISO timestamps', async () => {
    const api = await caller(['pay:read']);
    const history = await api.payment.history({ paymentId: PAYMENT });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ event: 'created', railEventId: null });
    expect(history[0]!.ts).toBe('2026-07-27T12:00:00.000Z');
  });

  it('reports rail capability and health for the operator console', async () => {
    const api = await caller(['pay:read']);
    const health = await api.railHealth();

    expect(health).toHaveLength(1);
    expect(health[0]).toMatchObject({ id: 'card-sandbox', healthy: true, usable: true });
    expect(health[0]!.capabilities).toContain('refund');
  });
});
