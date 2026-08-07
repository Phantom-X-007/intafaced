import Fastify, { type FastifyInstance } from 'fastify';
import type { Principal } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client';
import { afterEach, describe, expect, it } from 'vitest';
import { PayError, type PayService } from './payment-service.js';
import { registerPublicPayRest } from './public-rest.js';

/**
 * THE MERCHANT SURFACE, AND THE ONE QUESTION IT MUST NEVER GET WRONG.
 *
 * `pay.public-api` step 1 (docs/adr/2026-08-07-pay-public-api-law.md). These
 * are read paths, so there is no money to move and no idempotency to honour —
 * which leaves exactly one thing worth testing hard: **can a merchant id in a
 * query string reach somebody else's payments.**
 *
 * The mount boundary is the same one `svc-trade`'s private REST test defends:
 * the principal arrives through `createEdgeContext` over REAL headers, signed
 * with the edge secret. A self-asserted header must stay anonymous — otherwise
 * every scope check on this surface is decorative.
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
    scopes: ['pay:read'],
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

/** Only the methods this surface touches. Everything else would be unused weight. */
function stubPay(over: Partial<Record<string, unknown>> = {}): PayService {
  return {
    getMerchant: async (id: string) => {
      if (id !== MERCHANT) throw new PayError(`merchant ${id} not found`, 'pay.merchant_not_found');
      return { id: MERCHANT, userId: OWNER } as never;
    },
    getPayment: async (id: string) => {
      if (id !== PAYMENT) throw new PayError(`payment ${id} not found`, 'pay.payment_not_found');
      return paymentRow as never;
    },
    listPayments: async () => [paymentRow] as never,
    clearingBalance: async () => parseAmount('2.5'),
    merchantBalance: async () => parseAmount('7.25'),
    ...over,
  } as unknown as PayService;
}

async function build(pay: PayService = stubPay()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerPublicPayRest(app, { edgeSecret: SECRET, serviceName: 'svc-pay', pay });
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
    // And it does NOT leak the payment it just read in order to check.
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

    // The header without the signature — what a caller can forge on their own.
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

    /**
     * CANONICAL, not as-supplied. The payment was created as `1.10` and comes
     * back `"1.1"` — `formatAmount` emits no trailing zeros, which is the form
     * `money.ts` guarantees and #891 property-tested.
     *
     * That is a contract detail a merchant will otherwise discover by diffing
     * strings and finding a mismatch that is not one, so the OpenAPI
     * description says it out loud: compare amounts numerically, never
     * stringwise.
     */
    expect(body.amount).toBe('1.1');
    expect(typeof body.amount).toBe('string');
    // The two failure modes this rule exists to prevent, asserted by name.
    expect(body.amount).not.toBe(110);
    expect(body.amount).not.toBe(1.1);
  });

  it('sends balances as decimal strings too', async () => {
    app = await build();

    const res = await app.inject({ method: 'GET', url: `/api/pay/v1/balances?merchantId=${MERCHANT}&assetId=USD`, headers: signed() });

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
    const res = await app.inject({ method: 'GET', url: '/api/pay/v1/payments?merchantId=not-a-uuid', headers: signed() });
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

    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/payments/{id}', '/payments', '/balances']));
    expect(spec.components?.securitySchemes).toHaveProperty('apiKey');
  });

  it('serves the spec over HTTP, without shipping a static file server', async () => {
    // `@fastify/swagger-ui` would have rendered a reference here and would have
    // brought `@fastify/static` — a HIGH advisory — into the service that holds
    // payments. The spec is the artefact; anything can render it.
    app = await build();

    const res = await app.inject({ method: 'GET', url: '/api/pay/v1/openapi.json' });

    expect(res.statusCode).toBe(200);
    expect(res.json().info.title).toBe('Payments API');
  });
});
