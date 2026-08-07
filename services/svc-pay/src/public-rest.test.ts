import Fastify, { type FastifyInstance } from 'fastify';
import type { Principal } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryMerchantWebhookStore, MerchantWebhookService } from './merchant-webhooks.js';
import { PayError, type PayService } from './payment-service.js';
import { registerPublicPayRest } from './public-rest.js';
import { MemoryRestIdempotencyStore } from './rest-idempotency.js';

/**
 * THE MERCHANT SURFACE — reads (step 1) and mutations (step 2).
 *
 * Law: docs/adr/2026-08-07-pay-public-api-law.md.
 *
 * Step 1 weighted the one catastrophic read question: can a merchant id in a
 * query string reach somebody else's payments.
 *
 * Step 2 adds the money-path questions: Idempotency-Key required, same-key
 * replay, different-body conflict, ownership before the rail runs, decimal
 * strings on write, and refund needing its own scope.
 */

const SECRET = 'a-pay-public-rest-edge-secret-long-enough-x';
const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const MERCHANT = '33333333-3333-4333-8333-333333333333';
const PAYMENT = '44444444-4444-4444-8444-444444444444';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OWNER,
    userId: OWNER,
    sid: '55555555-5555-4555-8555-555555555555',
    scopes: ['pay:read', 'pay:write', 'pay:refund'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signed(p: Principal = principal()): Record<string, string> {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

const paymentRow = {
  id: PAYMENT,
  merchantId: MERCHANT,
  profileId: null,
  amount: parseAmount('1.10'),
  assetId: 'USD',
  method: 'card',
  railAdapter: 'card-sandbox',
  railRef: 'ref-1',
  status: 'captured' as const,
  capturedAmount: parseAmount('1.10'),
  refundedAmount: parseAmount('0'),
  createdAt: new Date('2026-08-07T10:00:00.000Z'),
};

type Call = { method: string; args: unknown[] };

/** Only the methods this surface touches. Everything else would be unused weight. */
function stubPay(over: Partial<Record<string, unknown>> = {}): PayService & { calls: Call[] } {
  const calls: Call[] = [];
  const record =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R | Promise<R>) =>
    async (...args: A): Promise<R> => {
      calls.push({ method: name, args });
      return fn(...args);
    };

  return {
    calls,
    getMerchant: record('getMerchant', async (id: string) => {
      if (id !== MERCHANT) throw new PayError(`merchant ${id} not found`, 'pay.merchant_not_found');
      return { id: MERCHANT, userId: OWNER } as never;
    }),
    getPayment: record('getPayment', async (id: string) => {
      if (id !== PAYMENT) throw new PayError(`payment ${id} not found`, 'pay.payment_not_found');
      return paymentRow as never;
    }),
    listPayments: record('listPayments', async () => [paymentRow] as never),
    clearingBalance: record('clearingBalance', async () => parseAmount('2.5')),
    merchantBalance: record('merchantBalance', async () => parseAmount('7.25')),
    createPayment: record('createPayment', async () => ({
      ...paymentRow,
      status: 'created' as const,
      capturedAmount: parseAmount('0'),
      railRef: null,
    })),
    authorize: record('authorize', async () => ({
      ...paymentRow,
      status: 'authorized' as const,
      capturedAmount: parseAmount('0'),
    })),
    capture: record('capture', async () => paymentRow),
    refund: record('refund', async () => ({
      ...paymentRow,
      status: 'refunded' as const,
      refundedAmount: parseAmount('1.10'),
    })),
    ...over,
  } as unknown as PayService & { calls: Call[] };
}

async function build(
  pay: PayService = stubPay(),
  idempotency = new MemoryRestIdempotencyStore(),
  webhooks?: MerchantWebhookService,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerPublicPayRest(app, {
    edgeSecret: SECRET,
    serviceName: 'svc-pay',
    pay,
    idempotency,
    webhooks: webhooks ?? new MerchantWebhookService(new MemoryMerchantWebhookStore()),
  });
  await app.ready();
  return app;
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('ownership — the only thing standing between a query string and another merchant', () => {
  it('REFUSES a payment belonging to a merchant the caller does not own', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/payments/${PAYMENT}`,
      headers: signed(principal({ sub: STRANGER, userId: STRANGER })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('pay.merchant_forbidden');
    expect(res.body).not.toContain(MERCHANT);
    expect(res.body).not.toContain('1.10');
  });

  it('REFUSES a list for a merchant the caller does not own', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/payments?merchantId=${MERCHANT}`,
      headers: signed(principal({ sub: STRANGER, userId: STRANGER })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('pay.merchant_forbidden');
  });

  it('REFUSES a balance for a merchant the caller does not own', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/balances?merchantId=${MERCHANT}&assetId=USD`,
      headers: signed(principal({ sub: STRANGER, userId: STRANGER })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('7.25');
  });

  it('serves the owner', async () => {
    app = await build();

    const res = await app.inject({ method: 'GET', url: `/api/pay/v1/payments/${PAYMENT}`, headers: signed() });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: PAYMENT, merchantId: MERCHANT, status: 'captured' });
  });
});

describe('the mount boundary', () => {
  it('treats a SELF-ASSERTED principal as anonymous', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/payments/${PAYMENT}`,
      headers: { 'x-intafaced-principal': encodePrincipal(principal()) },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('pay.unauthorized');
  });

  it('refuses a principal signed with the WRONG secret', async () => {
    app = await build();
    const raw = encodePrincipal(principal());

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/payments/${PAYMENT}`,
      headers: {
        'x-intafaced-principal': raw,
        'x-intafaced-principal-sig': signPrincipalHeader(raw, 'a-different-secret-of-sufficient-length', 'DE'),
        'x-intafaced-region': 'DE',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('refuses a principal that carries no pay:read scope', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/payments/${PAYMENT}`,
      headers: signed(principal({ scopes: ['trade:read'] })),
    });

    expect(res.statusCode).toBe(401);
  });

  it('refuses an unauthenticated request outright', async () => {
    app = await build();
    const res = await app.inject({ method: 'GET', url: `/api/pay/v1/payments/${PAYMENT}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('money on the wire (ADR §2.3)', () => {
  it('sends amounts as DECIMAL STRINGS, never numbers and never minor units', async () => {
    app = await build();

    const res = await app.inject({ method: 'GET', url: `/api/pay/v1/payments/${PAYMENT}`, headers: signed() });
    const body = res.json();

    expect(body.amount).toBe('1.1');
    expect(typeof body.amount).toBe('string');
    expect(body.amount).not.toBe(110);
    expect(body.amount).not.toBe(1.1);
  });

  it('sends balances as decimal strings too', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/balances?merchantId=${MERCHANT}&assetId=USD`,
      headers: signed(),
    });

    expect(res.json()).toEqual({ merchantId: MERCHANT, assetId: 'USD', clearing: '2.5', available: '7.25' });
  });
});

describe('refusals keep the pay.* vocabulary (ADR §2.6)', () => {
  it('answers a missing payment 404 with its code', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: '/api/pay/v1/payments/66666666-6666-4666-8666-666666666666',
      headers: signed(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('pay.payment_not_found');
  });

  it('rejects a malformed uuid before it reaches the service', async () => {
    app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/pay/v1/payments?merchantId=not-a-uuid',
      headers: signed(),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('the spec is served, and describes what the routes actually do', () => {
  it('publishes an OpenAPI document naming the routes and the bearer scheme', async () => {
    app = await build();

    const spec = app.swagger() as {
      paths: Record<string, unknown>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/payments/{id}',
        '/payments',
        '/balances',
        '/payments/{id}/authorize',
        '/payments/{id}/capture',
        '/payments/{id}/refund',
      ]),
    );
    expect(spec.components?.securitySchemes).toHaveProperty('apiKey');
  });

  it('serves the spec over HTTP, without shipping a static file server', async () => {
    app = await build();

    const res = await app.inject({ method: 'GET', url: '/api/pay/v1/openapi.json' });

    expect(res.statusCode).toBe(200);
    expect(res.json().info.title).toBe('Payments API');
  });
});

describe('step 2 — mutating paths + Idempotency-Key (ADR §2.2)', () => {
  const createBody = {
    merchantId: MERCHANT,
    amount: '1.10',
    assetId: 'USD',
    method: 'card',
    railAdapter: 'card-sandbox',
  };

  it('REFUSES a mutating POST with no Idempotency-Key — NOTHING WAS ATTEMPTED', async () => {
    const pay = stubPay();
    app = await build(pay);

    const res = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/payments',
      headers: { ...signed(), 'content-type': 'application/json' },
      payload: createBody,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('pay.idempotency_required');
    expect(pay.calls.filter((c) => c.method === 'createPayment')).toHaveLength(0);
  });

  it('creates through the same PayService method, returns decimal strings', async () => {
    const pay = stubPay();
    app = await build(pay);

    const res = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/payments',
      headers: { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'create:order:42' },
      payload: createBody,
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().amount).toBe('string');
    expect(res.json().amount).toBe('1.1');
    expect(pay.calls.some((c) => c.method === 'createPayment')).toBe(true);
    const args = pay.calls.find((c) => c.method === 'createPayment')!.args[0] as { amount: bigint };
    // parseAmount('1.10') — scaled bigint, never a number on the wire.
    expect(typeof args.amount).toBe('bigint');
  });

  it('REPLAYS an identical retry and does not call createPayment twice', async () => {
    const pay = stubPay();
    app = await build(pay);
    const headers = { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'create:order:99' };

    const first = await app.inject({ method: 'POST', url: '/api/pay/v1/payments', headers, payload: createBody });
    const second = await app.inject({ method: 'POST', url: '/api/pay/v1/payments', headers, payload: createBody });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(pay.calls.filter((c) => c.method === 'createPayment')).toHaveLength(1);
  });

  it('CONFLICTS when the same key is reused with a DIFFERENT body', async () => {
    const pay = stubPay();
    app = await build(pay);
    const headers = { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'create:order:conflict' };

    await app.inject({ method: 'POST', url: '/api/pay/v1/payments', headers, payload: createBody });
    const res = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/payments',
      headers,
      payload: { ...createBody, amount: '2.00' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('pay.idempotency_conflict');
    expect(pay.calls.filter((c) => c.method === 'createPayment')).toHaveLength(1);
  });

  it('REFUSES create/capture/authorize on another merchant BEFORE the service mutates', async () => {
    const pay = stubPay();
    app = await build(pay);
    const stranger = signed(principal({ sub: STRANGER, userId: STRANGER }));

    const create = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/payments',
      headers: { ...stranger, 'content-type': 'application/json', 'idempotency-key': 'stranger:create' },
      payload: createBody,
    });
    expect(create.statusCode).toBe(403);
    expect(pay.calls.filter((c) => c.method === 'createPayment')).toHaveLength(0);

    const capture = await app.inject({
      method: 'POST',
      url: `/api/pay/v1/payments/${PAYMENT}/capture`,
      headers: { ...stranger, 'content-type': 'application/json', 'idempotency-key': 'stranger:capture' },
      payload: {},
    });
    expect(capture.statusCode).toBe(403);
    expect(pay.calls.filter((c) => c.method === 'capture')).toHaveLength(0);
  });

  it('authorizes, captures (optional amount), and refunds with the matching scopes', async () => {
    const pay = stubPay();
    app = await build(pay);

    const auth = await app.inject({
      method: 'POST',
      url: `/api/pay/v1/payments/${PAYMENT}/authorize`,
      headers: { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'auth:1' },
      payload: {},
    });
    expect(auth.statusCode).toBe(200);
    expect(auth.json().status).toBe('authorized');

    const capture = await app.inject({
      method: 'POST',
      url: `/api/pay/v1/payments/${PAYMENT}/capture`,
      headers: { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'cap:1' },
      payload: { amount: '0.50' },
    });
    expect(capture.statusCode).toBe(200);
    const capArgs = pay.calls.find((c) => c.method === 'capture')!.args;
    expect(capArgs[1]).toEqual({ amount: parseAmount('0.50') });

    const refund = await app.inject({
      method: 'POST',
      url: `/api/pay/v1/payments/${PAYMENT}/refund`,
      headers: { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'ref:1' },
      payload: { amount: '0.50', refundId: 'refund:order:1' },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().status).toBe('refunded');
  });

  it('does not let a writer refund — pay:refund is its own authority', async () => {
    const pay = stubPay();
    app = await build(pay);

    const res = await app.inject({
      method: 'POST',
      url: `/api/pay/v1/payments/${PAYMENT}/refund`,
      headers: {
        ...signed(principal({ scopes: ['pay:write'] })),
        'content-type': 'application/json',
        'idempotency-key': 'ref:forbidden',
      },
      payload: { amount: '0.50' },
    });

    expect(res.statusCode).toBe(401);
    expect(pay.calls.filter((c) => c.method === 'refund')).toHaveLength(0);
  });

  it('rejects a JSON-number amount on create — decimal strings only', async () => {
    app = await build();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/payments',
      headers: { ...signed(), 'content-type': 'application/json', 'idempotency-key': 'num:1' },
      payload: { ...createBody, amount: 1.1 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('pay.invalid_amount');
  });
});

describe('webhooks step 3 — register + ownership + dashboard', () => {
  it('registers an endpoint and returns the signing secret once', async () => {
    app = await build();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/webhook-endpoints',
      headers: { ...signed(), 'content-type': 'application/json' },
      payload: { merchantId: MERCHANT, url: 'https://merchant.example/hooks/pay' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { secret: string; status: string; url: string };
    expect(body.status).toBe('active');
    expect(body.url).toBe('https://merchant.example/hooks/pay');
    expect(body.secret).toHaveLength(64);
  });

  it('REFUSES webhook registration for a merchant the caller does not own', async () => {
    app = await build();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pay/v1/webhook-endpoints',
      headers: {
        ...signed(principal({ sub: STRANGER, userId: STRANGER })),
        'content-type': 'application/json',
      },
      payload: { merchantId: MERCHANT, url: 'https://evil.example/x' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('pay.merchant_forbidden');
  });

  it('lists deliveries for the failure dashboard under pay:read', async () => {
    app = await build();

    const res = await app.inject({
      method: 'GET',
      url: `/api/pay/v1/webhook-deliveries?merchantId=${MERCHANT}&status=failed`,
      headers: signed(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
