import { z } from 'zod';
import { kycTierSchema } from '@intafaced/contracts/identity';

/**
 * THE WIRE SCHEMAS — what this client will accept as an answer.
 *
 * These mirror the outputs declared in the service routers (svc-trade
 * `markets/orders/fills`, svc-identity `auth/kyc`, svc-protocol
 * `health/predictAddress`). They are written here rather than imported for the
 * reason `packages/contracts/src/index.ts` gives: a caller imports contracts,
 * never an implementation, and those output schemas currently live inside the
 * services. Where a schema IS in contracts — `kycTierSchema` — it is imported,
 * because a second definition of the tier ladder is a second definition of who
 * may trade.
 *
 * Being a mirror is a feature. When a service changes shape, the parse fails
 * and the panel renders `invalid-response` with the offending field. The
 * failure lands on the screen instead of inside a number.
 *
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * `decimal` is a STRING and stays one. `z.number()` appears in this file only
 * for basis points and millisecond timestamps — quantities that are counts, not
 * money. Nothing here ever parses a price into a JS number; that conversion
 * happens in `money.ts`, into a scaled bigint, and only there.
 */

/** Unsigned decimal string, ≤18dp. The same rule svc-trade's router enforces. */
export const decimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'expected an unsigned decimal string with at most 18 decimal places');

// ── svc-identity ─────────────────────────────────────────────────────────────

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string(),
  userId: z.string().uuid(),
});
export type Session = z.infer<typeof sessionSchema>;

export const kycStatusSchema = z.object({
  tier: kycTierSchema,
  records: z.array(
    z.object({
      id: z.string().uuid(),
      tier: kycTierSchema,
      jurisdiction: z.string(),
      status: z.enum(['pending', 'approved', 'rejected', 'expired']),
      createdAt: z.string(),
    }),
  ),
});
export type KycStatus = z.infer<typeof kycStatusSchema>;

// ── svc-trade ────────────────────────────────────────────────────────────────

export const marketSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  base: z.string(),
  quote: z.string(),
  kind: z.enum(['spot', 'futures', 'options']),
  status: z.enum(['pending', 'active', 'halted', 'delisted']),
  tickSize: decimal,
  lotSize: decimal,
  minQty: decimal,
  maxQty: decimal.nullable(),
  minNotional: decimal,
  makerBps: z.number().int(),
  takerBps: z.number().int(),
  listedAt: z.string().nullable(),
});
export type Market = z.infer<typeof marketSchema>;

export const orderSideSchema = z.enum(['buy', 'sell']);
export type OrderSide = z.infer<typeof orderSideSchema>;

export const orderSchema = z.object({
  id: z.string().uuid(),
  clientOrderId: z.string().nullable(),
  marketId: z.string().uuid(),
  side: orderSideSchema,
  type: z.enum(['market', 'limit']),
  price: decimal.nullable(),
  qty: decimal,
  filled: decimal,
  remaining: decimal,
  status: z.enum(['pending', 'open', 'filled', 'cancelled', 'rejected', 'expired']),
  timeInForce: z.string(),
  holdAsset: z.string(),
  holdAmount: decimal,
  feeDiscountBps: z.number().int(),
  rejectCode: z.string().nullable(),
  timestamp: z.number().int(),
});
export type Order = z.infer<typeof orderSchema>;

export const fillSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  marketId: z.string().uuid(),
  side: orderSideSchema,
  takerOrMaker: z.enum(['maker', 'taker']),
  price: decimal,
  amount: decimal,
  cost: decimal,
  fee: z.object({ cost: decimal, currency: z.string(), rateBps: z.number().int() }),
  timestamp: z.number().int(),
});
export type Fill = z.infer<typeof fillSchema>;

// ── svc-protocol (the Protocol Plane) ────────────────────────────────────────

/**
 * `custodial: false` is a literal, not a boolean.
 *
 * The plane's entire claim is that the platform holds nothing here. If a
 * deployment ever answered `true`, this client must refuse the response rather
 * than render a custody badge that contradicts it — so the schema makes `true`
 * an invalid answer, exactly as svc-protocol's own router does.
 */
export const protocolHealthSchema = z.object({
  ok: z.boolean(),
  service: z.literal('svc-protocol'),
  chainId: z.number().int(),
  custodial: z.literal(false),
  relayEnabled: z.boolean(),
});
export type ProtocolHealth = z.infer<typeof protocolHealthSchema>;

export const predictedAccountSchema = z.object({
  address: z.string(),
  chainId: z.number().int(),
  factory: z.string(),
  implementation: z.string(),
  deployed: z.boolean(),
});
export type PredictedAccount = z.infer<typeof predictedAccountSchema>;

// ── health ───────────────────────────────────────────────────────────────────

export const serviceHealthSchema = z.object({ ok: z.boolean(), service: z.string() }).passthrough();
