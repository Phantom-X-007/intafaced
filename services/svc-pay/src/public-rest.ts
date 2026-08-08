import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import { requireScope, type Principal, type Scope } from '@intafaced/auth';
import { createEdgeContext, type EdgeRequest } from '@intafaced/contracts';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { assertMerchantOwnership } from './merchant-ownership.js';
import { type MerchantWebhookService, type WebhookDeliveryStatus } from './merchant-webhooks.js';
import { PayError, type PayService, type PaymentStatus } from './payment-service.js';
import { SandboxRailRefusal } from './rails/posture.js';
import { fingerprintRequest, MemoryRestIdempotencyStore, type RestIdempotencyStore } from './rest-idempotency.js';
import { resolveMerchantRail } from './sandbox-key-routing.js';

/**
 * `pay.public-api` — the merchant REST surface.
 *
 * Law: docs/adr/2026-08-07-pay-public-api-law.md. Every decision below is that
 * ADR's, not this file's; where the two disagree the ADR wins.
 *
 * STEP 1 — reads:
 *   GET /api/pay/v1/payments/:id          scope pay:read
 *   GET /api/pay/v1/payments              scope pay:read   ?merchantId= &status= &limit=
 *   GET /api/pay/v1/balances              scope pay:read   ?merchantId= &assetId=
 *   GET /api/pay/v1/openapi.json          public — the spec
 *
 * STEP 2 — mutations (this PR), every POST requires `Idempotency-Key` (ADR §2.2):
 *   POST /api/pay/v1/payments                    scope pay:write
 *   POST /api/pay/v1/payments/:id/authorize      scope pay:write
 *   POST /api/pay/v1/payments/:id/capture        scope pay:write
 *   POST /api/pay/v1/payments/:id/refund         scope pay:refund
 *
 * ── A TRANSLATION, NOT A SECOND IMPLEMENTATION ───────────────────────────
 *
 * The ADR's rule: "any behaviour that differs between REST and tRPC is a defect
 * in the REST layer". So these routes call the same `PayService` methods the
 * tRPC router calls, gate on the same `assertMerchantOwnership`, and render
 * amounts through the same `formatAmount`. Nothing here recomputes anything.
 *
 * ── AUTH IS THE MOUNT BOUNDARY, UNCHANGED ────────────────────────────────
 *
 * ADR §2.1: merchants authenticate with `ifc_…` API keys, svc-edge exchanges
 * them at identity, and this service receives a SIGNED PRINCIPAL. It never sees
 * a raw key and there is no second auth path here.
 *
 * ── MONEY ON THE WIRE ────────────────────────────────────────────────────
 *
 * ADR §2.3: decimal strings with an explicit asset. Never minor units, never a
 * number.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
 *
 * STEP 3 — outbound merchant webhooks (this PR residual after tip #994):
 *   POST   /api/pay/v1/webhook-endpoints              pay:write
 *   GET    /api/pay/v1/webhook-endpoints              pay:read
 *   DELETE /api/pay/v1/webhook-endpoints/:id          pay:write
 *   GET    /api/pay/v1/webhook-deliveries             pay:read   (failure dashboard)
 *
 * STEP 4 — sandbox keys: principal `key_env` from the API-key exchange routes
 * createPayment onto the sandbox rail (`card-sandbox`). A live key may not name
 * a sandbox rail. `assertRailMayMoveValue` remains the second gate for
 * value-leaving caps — REST acquires no exception. No parallel stack.
 *
 * STEP 5 — public docs + merchant quickstart (this residual):
 *   docs/pay/MERCHANT-PUBLIC-API-QUICKSTART.md — callable without monorepo.
 *   OpenAPI description below stays the machine contract (must match behaviour).
 *
 * Not Class X go-live. Not a live acquirer. Outbound webhooks do not move value.
 */

/** OpenAPI mount point. `/api/pay` is the edge prefix; `/v1` is ADR §2.7. */
const BASE = '/api/pay/v1';

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['created', 'authorized', 'captured', 'settled', 'refunded', 'disputed', 'failed'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Same decimal-string rule as the tRPC `amountSchema`. */
const AMOUNT_PATTERN = '^\\d+(\\.\\d{1,18})?$';

export interface PublicRestDeps {
  /** Shared EDGE_PRINCIPAL_SECRET — the same value the tRPC mount verifies. */
  edgeSecret: string;
  serviceName: string;
  pay: PayService;
  /** Version string for the OpenAPI document. */
  version?: string;
  /**
   * Idempotency journal for mutating POSTs. Defaults to in-memory (tests /
   * single-process). Production wires `PostgresRestIdempotencyStore`.
   */
  idempotency?: RestIdempotencyStore;
  /** Outbound merchant webhooks (step 3). Optional so read/mutate tests stay light. */
  webhooks?: MerchantWebhookService;
}

/**
 * The error envelope, and it is the internal vocabulary (ADR §2.6).
 *
 * `pay.*` codes are the public codes. No competitor taxonomy.
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

const createBodySchema = {
  type: 'object',
  required: ['merchantId', 'amount', 'assetId', 'method', 'railAdapter'],
  additionalProperties: false,
  properties: {
    merchantId: { type: 'string', format: 'uuid' },
    profileId: { type: 'string', format: 'uuid', nullable: true },
    // No `type: string` here on purpose: Fastify/Ajv coerceTypes would turn a
    // JSON number into `"1.1"` before the handler runs, and ADR §2.3 would be
    // decorative. `requireDecimalString` enforces the wire shape.
    amount: { description: 'Decimal string. Never a JSON number (ADR §2.3).' },
    assetId: { type: 'string', minLength: 1, maxLength: 16 },
    method: { type: 'string', minLength: 1 },
    railAdapter: { type: 'string', minLength: 1 },
    instrument: {
      type: 'object',
      required: ['kind'],
      additionalProperties: false,
      properties: {
        kind: { type: 'string' },
        token: { type: 'string' },
        address: { type: 'string' },
      },
    },
    customerRef: { type: 'string' },
    metadata: { type: 'object', additionalProperties: { type: 'string' } },
  },
} as const;

const captureBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    amount: {
      description: 'Optional partial capture as a decimal string. Omit to capture the full authorized amount. Never a JSON number.',
    },
  },
} as const;

const refundBodySchema = {
  type: 'object',
  required: ['amount'],
  additionalProperties: false,
  properties: {
    amount: { description: 'Decimal string. Never a JSON number (ADR §2.3).' },
    refundId: { type: 'string', description: 'Optional business refund id (business key, never a random UUID).' },
  },
} as const;

const idempotencyHeaderSchema = {
  type: 'object',
  // Not `required` here: Fastify's header-validation error envelope is not our
  // `pay.*` shape and serialization then 500s. Enforcement is `requireIdempotencyKey`.
  properties: {
    'idempotency-key': {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      description: 'Required on every mutating POST (ADR §2.2). A business key — never a random UUID per attempt.',
    },
  },
} as const;

/** Reject JSON numbers / anything that is not already a decimal string (ADR §2.3). */
function requireDecimalString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !new RegExp(AMOUNT_PATTERN).test(value)) {
    throw new PayError(`${field} must be an unsigned decimal string (never a JSON number). NOTHING WAS ATTEMPTED.`, 'pay.invalid_amount');
  }
  return value;
}
function statusFor(code: string): number {
  switch (code) {
    case 'pay.merchant_not_found':
    case 'pay.payment_not_found':
    case 'pay.profile_not_found':
    case 'pay.settlement_not_found':
    case 'pay.webhook_endpoint_not_found':
      return 404;
    case 'pay.merchant_forbidden':
    case 'pay.merchant_inactive':
    case 'pay.kyb_operator_required':
      return 403;
    case 'pay.invalid_transition':
    case 'pay.capture_exceeds_authorized':
    case 'pay.refund_exceeds_captured':
    case 'pay.refund_in_flight':
    case 'pay.idempotency_conflict':
    case 'pay.partial_capture_unsupported':
      return 409;
    case 'pay.rail_operation_unsupported':
    case 'pay.sandbox_rail_refused':
      return 503;
    default:
      return 400;
  }
}

function send(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof SandboxRailRefusal) {
    const body: ErrorBody = {
      error: {
        code: 'pay.sandbox_rail_refused',
        message: err.message,
      },
    };
    return reply.code(503).send(body);
  }
  if (err instanceof PayError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    return reply.code(statusFor(err.code)).send(body);
  }
  throw err;
}

export async function registerPublicPayRest(app: FastifyInstance, deps: PublicRestDeps): Promise<void> {
  const edge = createEdgeContext({ secret: deps.edgeSecret, serviceName: deps.serviceName });
  const idempotency = deps.idempotency ?? new MemoryRestIdempotencyStore();

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Payments API',
        version: deps.version ?? '1.0.0',
        description: [
          'Merchant payments API.',
          '',
          'Human quickstart (no monorepo required): docs/pay/MERCHANT-PUBLIC-API-QUICKSTART.md',
          '',
          '**Amounts are decimal strings** with an explicit `assetId` — never minor units and never a JSON number.',
          'A payment of one dollar ten is `"1.1"`, not `110` and not `1.1` as a number.',
          '',
          'Amounts are **canonical**: no trailing zeros. An amount created as `1.10` is returned as `"1.1"`.',
          'Compare amounts numerically or with a decimal library — never by string equality.',
          '',
          '**Authentication** is an `ifc_…` (live) or `ifc_test_…` (sandbox) API key as a bearer token.',
          'Keys are exchanged for a short-lived principal at the edge; this service never sees the key itself.',
          '',
          '**Sandbox keys** (mode=sandbox / `key_env=sandbox`): createPayment always uses the sandbox rail',
          '(`card-sandbox`). A **live** key that names a sandbox rail is refused (`pay.sandbox_rail_refused`).',
          'There is no parallel sandbox deployment — same API, rail posture only.',
          '',
          '**Idempotency-Key** is required on every mutating POST. A repeated key with the same body returns',
          'the original result; a repeated key with a different body is `409 pay.idempotency_conflict`.',
          '',
          '**Errors** carry a stable `pay.*` code. Branch on the code, never on the message.',
          '',
          '**Webhooks** (ADR §2.4): HMAC-SHA256 over `timestamp + "." + raw body` in',
          '`X-Intafaced-Signature`, with `X-Intafaced-Timestamp`. At-least-once — dedupe on event `id`.',
          'Bodies carry payment **state**, not instructions. Permanently failing endpoints are disabled',
          'and listed under webhook-deliveries.',
          '',
          'This surface does **not** imply a live card acquirer (Class X / `socket.psp-partners`).',
        ].join('\n'),
      },
      servers: [{ url: BASE }],
      components: {
        securitySchemes: {
          apiKey: { type: 'http', scheme: 'bearer', description: 'An `ifc_…` API key.' },
        },
        parameters: {
          IdempotencyKey: {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 255 },
            description: 'Required on mutating POSTs (ADR §2.2). Business key — never random per attempt.',
          },
        },
      },
      security: [{ apiKey: [] }],
      tags: [{ name: 'payments' }, { name: 'balances' }, { name: 'webhooks' }],
    },
  });

  /**
   * THE SPEC, NOT A UI.
   *
   * `@fastify/swagger-ui` was refused: `@fastify/static` carried advisories, and
   * rendering docs is not a reason to run a static file server inside the
   * payments service. The spec is the artefact.
   */
  app.get(`${BASE}/openapi.json`, { schema: { hide: true } }, async () => app.swagger());

  /**
   * Resolve the caller, or refuse.
   *
   * An unsigned or absent principal is anonymous. Missing scope and missing
   * auth both land as 401 — from the caller's side the next action is the same.
   */
  function principalOf(req: FastifyRequest, reply: FastifyReply, scope: Scope): Principal | null {
    const ctx = edge({ headers: req.headers } as EdgeRequest);
    try {
      if (!ctx.principal) throw new Error('anonymous');
      requireScope(ctx.principal, scope);
      return ctx.principal;
    } catch {
      reply.code(401).send({
        error: {
          code: 'pay.unauthorized',
          message: `A valid API key with the ${scope} scope is required.`,
        },
      });
      return null;
    }
  }

  function requireIdempotencyKey(req: FastifyRequest, reply: FastifyReply): string | null {
    const raw = req.headers['idempotency-key'];
    const key = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() : '';
    if (!key) {
      reply.code(400).send({
        error: {
          code: 'pay.idempotency_required',
          message: 'Idempotency-Key header is required on every mutating POST. NOTHING WAS ATTEMPTED.',
        },
      });
      return null;
    }
    if (key.length > 255) {
      reply.code(400).send({
        error: {
          code: 'pay.idempotency_required',
          message: 'Idempotency-Key must be at most 255 characters. NOTHING WAS ATTEMPTED.',
        },
      });
      return null;
    }
    return key;
  }

  /**
   * Run a mutating handler behind the Idempotency-Key claim→put journal.
   * 5xx abandons the claim so a retry may execute; 2xx/4xx are stored and replayed.
   */
  async function withIdempotency(
    req: FastifyRequest,
    reply: FastifyReply,
    ownerId: string,
    key: string,
    body: unknown,
    run: () => Promise<void>,
  ): Promise<FastifyReply> {
    const path = req.url.split('?')[0] ?? req.url;
    const fingerprint = fingerprintRequest(req.method, path, body ?? {});
    const claim = await idempotency.claim(ownerId, key, fingerprint);
    if (claim.kind === 'conflict') {
      return reply.code(409).send({
        error: {
          code: 'pay.idempotency_conflict',
          message: 'Idempotency-Key was already used with a different request body. Refusing rather than guessing which result you wanted.',
        },
      });
    }
    if (claim.kind === 'replay') {
      return reply.code(claim.record.statusCode).send(claim.record.body);
    }

    // Capture whatever Fastify sends so we can journal it.
    let captured: { statusCode: number; body: unknown } | undefined;
    const originalSend = reply.send.bind(reply);
    reply.send = ((payload: unknown) => {
      captured = { statusCode: reply.statusCode, body: payload };
      return originalSend(payload);
    }) as typeof reply.send;

    try {
      await run();
      if (captured && captured.statusCode < 500) {
        await idempotency.put(ownerId, key, { statusCode: captured.statusCode, body: captured.body }, claim.token);
      } else {
        await idempotency.abandon(ownerId, key, claim.token);
      }
      return reply;
    } catch (err) {
      await idempotency.abandon(ownerId, key, claim.token);
      throw err;
    }
  }

  // ── READS (step 1) ────────────────────────────────────────────────────────

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
      const principal = principalOf(req, reply, 'pay:read');
      if (!principal) return reply;
      try {
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
      const principal = principalOf(req, reply, 'pay:read');
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
      const principal = principalOf(req, reply, 'pay:read');
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

  // ── MUTATIONS (step 2) ────────────────────────────────────────────────────

  type CreateBody = {
    merchantId: string;
    profileId?: string | null;
    amount: unknown;
    assetId: string;
    method: string;
    railAdapter: string;
    instrument?: { kind: string; token?: string; address?: string };
    customerRef?: string;
    metadata?: Record<string, string>;
  };

  app.post(
    `${BASE}/payments`,
    {
      schema: {
        tags: ['payments'],
        summary: 'Create a payment',
        description: 'Requires `Idempotency-Key`. Calls the same `PayService.createPayment` the tRPC router uses.',
        headers: idempotencyHeaderSchema,
        body: createBodySchema,
        response: {
          200: paymentSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (req: FastifyRequest<{ Body: CreateBody }>, reply) => {
      const principal = principalOf(req, reply, 'pay:write');
      if (!principal) return reply;
      const key = requireIdempotencyKey(req, reply);
      if (!key) return reply;

      return withIdempotency(req, reply, principal.userId, key, req.body, async () => {
        try {
          await assertMerchantOwnership(deps.pay, principal.userId, req.body.merchantId);
          const amount = requireDecimalString(req.body.amount, 'amount');
          // ADR §2.5 step 4 — sandbox key → sandbox rail; live key may not.
          const railAdapter = resolveMerchantRail({
            keyEnv: principal.key_env,
            requestedRail: req.body.railAdapter,
          });
          const payment = await deps.pay.createPayment({
            merchantId: req.body.merchantId,
            profileId: req.body.profileId ?? null,
            amount: parseAmount(amount),
            assetId: req.body.assetId,
            method: req.body.method,
            railAdapter,
            instrument: req.body.instrument,
            customerRef: req.body.customerRef,
            metadata: req.body.metadata,
          });
          return reply.send(toPaymentBody(payment));
        } catch (err) {
          return send(reply, err);
        }
      });
    },
  );

  app.post(
    `${BASE}/payments/:id/authorize`,
    {
      schema: {
        tags: ['payments'],
        summary: 'Authorize a payment',
        description: 'Requires `Idempotency-Key`. No value moves on authorize — ledger untouched.',
        headers: idempotencyHeaderSchema,
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: { type: 'object', additionalProperties: false, properties: {} },
        response: {
          200: paymentSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string }; Body?: Record<string, never> }>, reply) => {
      const principal = principalOf(req, reply, 'pay:write');
      if (!principal) return reply;
      const key = requireIdempotencyKey(req, reply);
      if (!key) return reply;

      return withIdempotency(req, reply, principal.userId, key, req.body ?? {}, async () => {
        try {
          const existing = await deps.pay.getPayment(req.params.id);
          await assertMerchantOwnership(deps.pay, principal.userId, existing.merchantId);
          const payment = await deps.pay.authorize(req.params.id);
          return reply.send(toPaymentBody(payment));
        } catch (err) {
          return send(reply, err);
        }
      });
    },
  );

  app.post(
    `${BASE}/payments/:id/capture`,
    {
      schema: {
        tags: ['payments'],
        summary: 'Capture an authorized payment',
        description: 'Requires `Idempotency-Key`. Value moves only through ledger-client recipes inside `PayService.capture`.',
        headers: idempotencyHeaderSchema,
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: captureBodySchema,
        response: {
          200: paymentSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string }; Body: { amount?: unknown } }>, reply) => {
      const principal = principalOf(req, reply, 'pay:write');
      if (!principal) return reply;
      const key = requireIdempotencyKey(req, reply);
      if (!key) return reply;

      return withIdempotency(req, reply, principal.userId, key, req.body ?? {}, async () => {
        try {
          const existing = await deps.pay.getPayment(req.params.id);
          await assertMerchantOwnership(deps.pay, principal.userId, existing.merchantId);
          const opts = req.body?.amount === undefined ? {} : { amount: parseAmount(requireDecimalString(req.body.amount, 'amount')) };
          const payment = await deps.pay.capture(req.params.id, opts);
          return reply.send(toPaymentBody(payment));
        } catch (err) {
          return send(reply, err);
        }
      });
    },
  );

  app.post(
    `${BASE}/payments/:id/refund`,
    {
      schema: {
        tags: ['payments'],
        summary: 'Refund a captured payment',
        description: 'Requires `Idempotency-Key` and `pay:refund` (not the same authority as taking payment). Ledger-only.',
        headers: idempotencyHeaderSchema,
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: refundBodySchema,
        response: {
          200: paymentSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string }; Body: { amount: unknown; refundId?: string } }>, reply) => {
      const principal = principalOf(req, reply, 'pay:refund');
      if (!principal) return reply;
      const key = requireIdempotencyKey(req, reply);
      if (!key) return reply;

      return withIdempotency(req, reply, principal.userId, key, req.body, async () => {
        try {
          const existing = await deps.pay.getPayment(req.params.id);
          await assertMerchantOwnership(deps.pay, principal.userId, existing.merchantId);
          const amount = requireDecimalString(req.body.amount, 'amount');
          const payment = await deps.pay.refund(
            req.params.id,
            parseAmount(amount),
            req.body.refundId ? { refundId: req.body.refundId } : {},
          );
          return reply.send(toPaymentBody(payment));
        } catch (err) {
          return send(reply, err);
        }
      });
    },
  );

  // ── WEBHOOKS (step 3) ─────────────────────────────────────────────────────

  if (deps.webhooks) {
    const webhooks = deps.webhooks;

    const endpointSchema = {
      type: 'object',
      required: ['id', 'merchantId', 'url', 'status', 'consecutiveFailures', 'createdAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        merchantId: { type: 'string', format: 'uuid' },
        url: { type: 'string' },
        status: { type: 'string', enum: ['active', 'disabled'] },
        disabledReason: { type: 'string', nullable: true },
        consecutiveFailures: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        secret: {
          type: 'string',
          description: 'Signing secret — returned ONLY on create. Store it; we will not show it again.',
        },
      },
    } as const;

    const deliverySchema = {
      type: 'object',
      required: ['id', 'endpointId', 'merchantId', 'eventId', 'eventType', 'status', 'attempts', 'createdAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        endpointId: { type: 'string', format: 'uuid' },
        merchantId: { type: 'string', format: 'uuid' },
        eventId: { type: 'string', description: 'Merchant dedupe key (ADR §2.4).' },
        eventType: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'delivered', 'failed', 'dead'] },
        attempts: { type: 'integer' },
        nextAttemptAt: { type: 'string', format: 'date-time' },
        lastStatusCode: { type: 'integer', nullable: true },
        lastError: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        deliveredAt: { type: 'string', format: 'date-time', nullable: true },
      },
    } as const;

    app.post(
      `${BASE}/webhook-endpoints`,
      {
        schema: {
          tags: ['webhooks'],
          summary: 'Register an outbound webhook endpoint',
          description: 'HTTPS required (localhost http allowed). Signing secret returned once. ADR §2.4 — no value moves.',
          body: {
            type: 'object',
            required: ['merchantId', 'url'],
            additionalProperties: false,
            properties: {
              merchantId: { type: 'string', format: 'uuid' },
              url: { type: 'string', minLength: 8, maxLength: 2048 },
            },
          },
          response: { 200: endpointSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
        },
      },
      async (req: FastifyRequest<{ Body: { merchantId: string; url: string } }>, reply) => {
        const principal = principalOf(req, reply, 'pay:write');
        if (!principal) return reply;
        try {
          await assertMerchantOwnership(deps.pay, principal.userId, req.body.merchantId);
          const created = await webhooks.registerEndpoint(req.body.merchantId, req.body.url);
          return reply.send({
            id: created.id,
            merchantId: created.merchantId,
            url: created.url,
            status: created.status,
            disabledReason: created.disabledReason,
            consecutiveFailures: created.consecutiveFailures,
            createdAt: created.createdAt.toISOString(),
            updatedAt: created.updatedAt.toISOString(),
            secret: created.secret,
          });
        } catch (err) {
          return send(reply, err);
        }
      },
    );

    app.get(
      `${BASE}/webhook-endpoints`,
      {
        schema: {
          tags: ['webhooks'],
          summary: 'List webhook endpoints for a merchant',
          querystring: {
            type: 'object',
            required: ['merchantId'],
            properties: { merchantId: { type: 'string', format: 'uuid' } },
          },
          response: { 200: { type: 'array', items: endpointSchema }, 401: errorSchema, 403: errorSchema, 404: errorSchema },
        },
      },
      async (req: FastifyRequest<{ Querystring: { merchantId: string } }>, reply) => {
        const principal = principalOf(req, reply, 'pay:read');
        if (!principal) return reply;
        try {
          await assertMerchantOwnership(deps.pay, principal.userId, req.query.merchantId);
          const rows = await webhooks.listEndpoints(req.query.merchantId);
          return reply.send(
            rows.map((e) => ({
              id: e.id,
              merchantId: e.merchantId,
              url: e.url,
              status: e.status,
              disabledReason: e.disabledReason,
              consecutiveFailures: e.consecutiveFailures,
              createdAt: e.createdAt.toISOString(),
              updatedAt: e.updatedAt.toISOString(),
            })),
          );
        } catch (err) {
          return send(reply, err);
        }
      },
    );

    app.delete(
      `${BASE}/webhook-endpoints/:id`,
      {
        schema: {
          tags: ['webhooks'],
          summary: 'Disable a webhook endpoint',
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
          querystring: {
            type: 'object',
            required: ['merchantId'],
            properties: { merchantId: { type: 'string', format: 'uuid' } },
          },
          response: {
            200: { type: 'object', properties: { disabled: { type: 'boolean' } } },
            401: errorSchema,
            403: errorSchema,
            404: errorSchema,
          },
        },
      },
      async (req: FastifyRequest<{ Params: { id: string }; Querystring: { merchantId: string } }>, reply) => {
        const principal = principalOf(req, reply, 'pay:write');
        if (!principal) return reply;
        try {
          await assertMerchantOwnership(deps.pay, principal.userId, req.query.merchantId);
          await webhooks.disableEndpoint(req.query.merchantId, req.params.id);
          return reply.send({ disabled: true });
        } catch (err) {
          return send(reply, err);
        }
      },
    );

    app.get(
      `${BASE}/webhook-deliveries`,
      {
        schema: {
          tags: ['webhooks'],
          summary: 'Webhook delivery dashboard (failures / dead / all)',
          description:
            'Permanently failing endpoints are disabled rather than silently dropped (ADR §2.4). Filter with `status=failed` or `status=dead`.',
          querystring: {
            type: 'object',
            required: ['merchantId'],
            properties: {
              merchantId: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['pending', 'delivered', 'failed', 'dead'] },
              limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
            },
          },
          response: { 200: { type: 'array', items: deliverySchema }, 401: errorSchema, 403: errorSchema, 404: errorSchema },
        },
      },
      async (
        req: FastifyRequest<{
          Querystring: { merchantId: string; status?: WebhookDeliveryStatus; limit?: number };
        }>,
        reply,
      ) => {
        const principal = principalOf(req, reply, 'pay:read');
        if (!principal) return reply;
        try {
          await assertMerchantOwnership(deps.pay, principal.userId, req.query.merchantId);
          const rows = await webhooks.listDeliveries(req.query.merchantId, {
            status: req.query.status,
            limit: req.query.limit,
          });
          return reply.send(
            rows.map((d) => ({
              id: d.id,
              endpointId: d.endpointId,
              merchantId: d.merchantId,
              eventId: d.eventId,
              eventType: d.eventType,
              status: d.status,
              attempts: d.attempts,
              nextAttemptAt: d.nextAttemptAt.toISOString(),
              lastStatusCode: d.lastStatusCode,
              lastError: d.lastError,
              createdAt: d.createdAt.toISOString(),
              deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
            })),
          );
        } catch (err) {
          return send(reply, err);
        }
      },
    );
  }
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
