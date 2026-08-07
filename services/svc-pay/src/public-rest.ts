import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { requireScope, type Principal } from '@intafaced/auth';
import { createEdgeContext, type EdgeRequest } from '@intafaced/contracts';
import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { assertMerchantOwnership } from './merchant-ownership.js';
import { PayError, type PayService, type PaymentStatus } from './payment-service.js';

/**
 * `pay.public-api` — the merchant REST surface. STEP 1: read paths only.
 *
 * Law: docs/adr/2026-08-07-pay-public-api-law.md. Every decision below is that
 * ADR's, not this file's; where the two disagree the ADR wins.
 *
 *   GET /api/pay/v1/payments/:id          scope pay:read
 *   GET /api/pay/v1/payments              scope pay:read   ?merchantId= &status= &limit=
 *   GET /api/pay/v1/balances              scope pay:read   ?merchantId= &assetId=
 *   GET /api/pay/v1/openapi.json          public — the spec
 *   GET /api/pay/v1/docs                  public — the reference
 *
 * ── A TRANSLATION, NOT A SECOND IMPLEMENTATION ───────────────────────────
 *
 * The ADR's rule: "any behaviour that differs between REST and tRPC is a defect
 * in the REST layer". So these routes call the same `PayService` methods the
 * tRPC router calls, gate on the same `assertMerchantOwnership`, and render
 * amounts through the same `formatAmount`. Nothing here recomputes anything.
 *
 * Read paths first, and only read paths, because they add NO new behaviour and
 * therefore no new money risk. Mutating paths are step 2 and arrive with the
 * required `Idempotency-Key` contract; that middleware is deliberately not
 * written yet, because a module nothing imports is exactly what the
 * reachability gate exists to reject.
 *
 * ── AUTH IS THE MOUNT BOUNDARY, UNCHANGED ────────────────────────────────
 *
 * ADR §2.1: merchants authenticate with `ifc_…` API keys, svc-edge exchanges
 * them at identity, and this service receives a SIGNED PRINCIPAL. It never sees
 * a raw key and there is no second auth path here — the same `createEdgeContext`
 * the tRPC mount uses, verifying the same signature. A self-asserted principal
 * header is anonymous.
 *
 * ── MONEY ON THE WIRE ────────────────────────────────────────────────────
 *
 * ADR §2.3: decimal strings with an explicit asset. Never minor units, never a
 * number. The conventional `amount: 110, currency: "usd"` shape is not available
 * to us because the ledger is not free to adopt it either (§4.2).
 */

/** OpenAPI mount point. `/api/pay` is the edge prefix; `/v1` is ADR §2.7. */
const BASE = '/api/pay/v1';

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['created', 'authorized', 'captured', 'settled', 'refunded', 'disputed', 'failed'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface PublicRestDeps {
  /** Shared EDGE_PRINCIPAL_SECRET — the same value the tRPC mount verifies. */
  edgeSecret: string;
  serviceName: string;
  pay: PayService;
  /** Version string for the OpenAPI document. */
  version?: string;
}

/**
 * The error envelope, and it is the internal vocabulary (ADR §2.6).
 *
 * `pay.*` codes are the public codes. No competitor taxonomy: `svc-trade`
 * speaks CCXT because bots already do and that is a real interop win, and there
 * is no equivalent lingua franca for payments — adopting one vendor's would
 * name a vendor (§0.7) and buy nothing.
 */
interface ErrorBody {
  error: { code: string; message: string };
}

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Stable `pay.*` code. Branch on this, never on the message.' },
        message: { type: 'string' },
      },
    },
  },
} as const;

const paymentSchema = {
  type: 'object',
  required: ['id', 'merchantId', 'amount', 'assetId', 'status', 'capturedAmount', 'refundedAmount', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    merchantId: { type: 'string', format: 'uuid' },
    profileId: { type: 'string', nullable: true },
    amount: { type: 'string', description: 'Decimal string. Never minor units, never a number (ADR §2.3).' },
    assetId: { type: 'string' },
    method: { type: 'string', nullable: true },
    railAdapter: { type: 'string', nullable: true },
    railRef: { type: 'string', nullable: true },
    status: { type: 'string', enum: [...PAYMENT_STATUSES] },
    capturedAmount: { type: 'string', description: 'Decimal string.' },
    refundedAmount: { type: 'string', description: 'Decimal string.' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

const balanceSchema = {
  type: 'object',
  required: ['merchantId', 'assetId', 'clearing', 'available'],
  properties: {
    merchantId: { type: 'string', format: 'uuid' },
    assetId: { type: 'string' },
    clearing: { type: 'string', description: 'Decimal string. Held against pending settlement.' },
    available: { type: 'string', description: 'Decimal string. Withdrawable.' },
  },
} as const;

/** HTTP status for a `pay.*` code — the REST half of `toTrpcError`'s job. */
function statusFor(code: string): number {
  switch (code) {
    case 'pay.merchant_not_found':
    case 'pay.payment_not_found':
    case 'pay.profile_not_found':
    case 'pay.settlement_not_found':
      return 404;
    case 'pay.merchant_forbidden':
    case 'pay.merchant_inactive':
    case 'pay.kyb_operator_required':
      return 403;
    default:
      return 400;
  }
}

function send(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof PayError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    return reply.code(statusFor(err.code)).send(body);
  }
  throw err;
}

export async function registerPublicPayRest(app: FastifyInstance, deps: PublicRestDeps): Promise<void> {
  const edge = createEdgeContext({ secret: deps.edgeSecret, serviceName: deps.serviceName });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Payments API',
        version: deps.version ?? '1.0.0',
        description: [
          'Merchant payments API.',
          '',
          '**Amounts are decimal strings** with an explicit `assetId` — never minor units and never a JSON number.',
          'A payment of one dollar ten is `"1.1"`, not `110` and not `1.1` as a number.',
          '',
          'Amounts are **canonical**: no trailing zeros. An amount created as `1.10` is returned as `"1.1"`.',
          'Compare amounts numerically or with a decimal library — never by string equality.',
          '',
          '**Authentication** is an `ifc_…` API key as a bearer token. Keys are exchanged for a short-lived',
          'principal at the edge; this service never sees the key itself.',
          '',
          '**Errors** carry a stable `pay.*` code. Branch on the code, never on the message.',
        ].join('\n'),
      },
      servers: [{ url: BASE }],
      components: {
        securitySchemes: {
          apiKey: { type: 'http', scheme: 'bearer', description: 'An `ifc_…` API key.' },
        },
      },
      security: [{ apiKey: [] }],
      tags: [{ name: 'payments' }, { name: 'balances' }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: `${BASE}/docs`,
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  /**
   * Resolve the caller, or refuse.
   *
   * `requireScope` throws when the principal lacks `pay:read`; an unsigned or
   * absent principal is anonymous and therefore also lacks it. Both land as 401
   * rather than 403, because from the caller's side "your key was not accepted"
   * and "your key lacks this scope" are the same next action: check the key.
   */
  function principalOf(req: FastifyRequest, reply: FastifyReply): Principal | null {
    const ctx = edge({ headers: req.headers } as EdgeRequest);
    try {
      // Absent principal first: an unsigned or self-asserted header is
      // anonymous, and `requireScope` takes a principal rather than deciding
      // that question. Both land in the same refusal below.
      if (!ctx.principal) throw new Error('anonymous');
      requireScope(ctx.principal, 'pay:read');
      return ctx.principal;
    } catch {
      reply.code(401).send({ error: { code: 'pay.unauthorized', message: 'A valid API key with the pay:read scope is required.' } });
      return null;
    }
  }

  app.get(
    `${BASE}/payments/:id`,
    {
      schema: {
        tags: ['payments'],
        summary: 'Fetch one payment',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: { 200: paymentSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const principal = principalOf(req, reply);
      if (!principal) return reply;
      try {
        /**
         * Fetched, then checked, then returned — the same order as the tRPC
         * procedure, and the comment there says why: the row must be read to
         * learn which merchant owns it, so the check protects the RESPONSE and
         * has to come before the return rather than after the caller has it.
         */
        const payment = await deps.pay.getPayment(req.params.id);
        await assertMerchantOwnership(deps.pay, principal.userId, payment.merchantId);
        return reply.send(toPaymentBody(payment));
      } catch (err) {
        return send(reply, err);
      }
    },
  );

  app.get(
    `${BASE}/payments`,
    {
      schema: {
        tags: ['payments'],
        summary: 'List a merchant’s payments, newest first',
        querystring: {
          type: 'object',
          required: ['merchantId'],
          properties: {
            merchantId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: [...PAYMENT_STATUSES] },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
          },
        },
        response: { 200: { type: 'array', items: paymentSchema }, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req: FastifyRequest<{ Querystring: { merchantId: string; status?: PaymentStatus; limit?: number } }>, reply) => {
      const principal = principalOf(req, reply);
      if (!principal) return reply;
      try {
        await assertMerchantOwnership(deps.pay, principal.userId, req.query.merchantId);
        const rows = await deps.pay.listPayments({
          merchantId: req.query.merchantId,
          status: req.query.status,
          limit: Math.min(req.query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
        });
        return reply.send(rows.map(toPaymentBody));
      } catch (err) {
        return send(reply, err);
      }
    },
  );

  app.get(
    `${BASE}/balances`,
    {
      schema: {
        tags: ['balances'],
        summary: 'Merchant balance for one asset',
        description:
          'A PROJECTION of the ledger, not a second book (Doctrine §0.6). `clearing` is held against pending settlement; `available` is withdrawable.',
        querystring: {
          type: 'object',
          required: ['merchantId', 'assetId'],
          properties: { merchantId: { type: 'string', format: 'uuid' }, assetId: { type: 'string', minLength: 1, maxLength: 16 } },
        },
        response: { 200: balanceSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req: FastifyRequest<{ Querystring: { merchantId: string; assetId: string } }>, reply) => {
      const principal = principalOf(req, reply);
      if (!principal) return reply;
      try {
        await assertMerchantOwnership(deps.pay, principal.userId, req.query.merchantId);
        const [clearing, available] = await Promise.all([
          deps.pay.clearingBalance(req.query.merchantId, req.query.assetId),
          deps.pay.merchantBalance(req.query.merchantId, req.query.assetId),
        ]);
        return reply.send({
          merchantId: req.query.merchantId,
          assetId: req.query.assetId,
          clearing: formatAmount(clearing),
          available: formatAmount(available),
        });
      } catch (err) {
        return send(reply, err);
      }
    },
  );
}

/** Identical field-for-field to the tRPC `toPaymentOut` — see the header. */
function toPaymentBody(view: {
  id: string;
  merchantId: string;
  profileId: string | null;
  amount: Amount;
  assetId: string;
  method: string | null;
  railAdapter: string | null;
  railRef: string | null;
  status: PaymentStatus;
  capturedAmount: Amount;
  refundedAmount: Amount;
  createdAt: Date;
}) {
  return {
    id: view.id,
    merchantId: view.merchantId,
    profileId: view.profileId,
    amount: formatAmount(view.amount),
    assetId: view.assetId,
    method: view.method,
    railAdapter: view.railAdapter,
    railRef: view.railRef,
    status: view.status,
    capturedAmount: formatAmount(view.capturedAmount),
    refundedAmount: formatAmount(view.refundedAmount),
    createdAt: view.createdAt.toISOString(),
  };
}
