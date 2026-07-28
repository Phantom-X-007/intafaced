import { z } from 'zod';
import type { EdgeClient } from './edge-client';
import type { Result } from '../result';
import {
  fillSchema,
  kycStatusSchema,
  marketSchema,
  orderSchema,
  predictedAccountSchema,
  protocolHealthSchema,
  serviceHealthSchema,
  sessionSchema,
  type Fill,
  type KycStatus,
  type Market,
  type Order,
  type OrderSide,
  type PredictedAccount,
  type ProtocolHealth,
  type Session,
} from './wire';

/**
 * THE CALLS THIS TERMINAL ACTUALLY MAKES.
 *
 * One function per procedure that exists on a mounted router today. There is
 * deliberately no wrapper for anything that does not: a function named
 * `depth()` that returned a stub would be the exact lie this app is built not
 * to tell. What is missing is missing in the UI, with a reason.
 *
 * Every one returns `Result`, so a caller cannot forget that a service can be
 * down.
 */

// ── svc-identity ─────────────────────────────────────────────────────────────

export function login(edge: EdgeClient, input: { identifier: string; password: string; totpCode?: string }): Promise<Result<Session>> {
  return edge.mutate('identity', 'auth.login', sessionSchema, input);
}

export function refreshSession(edge: EdgeClient, refreshToken: string): Promise<Result<Session>> {
  return edge.mutate('identity', 'auth.refresh', sessionSchema, { refreshToken });
}

export function logout(edge: EdgeClient, refreshToken: string): Promise<Result<{ ok: true }>> {
  return edge.mutate('identity', 'auth.logout', z.object({ ok: z.literal(true) }), { refreshToken });
}

/**
 * The caller's verification tier — the gate on every custodial surface.
 *
 * `identity:read`, so it only answers for a signed-in session. There is no
 * `me` procedure on svc-identity's router (the `IdentityContract` in
 * `packages/contracts` declares one; the service does not implement it), so
 * this is where the terminal learns what the session may do.
 */
export function kycStatus(edge: EdgeClient): Promise<Result<KycStatus>> {
  return edge.query('identity', 'kyc.status', kycStatusSchema);
}

// ── svc-trade (Fiat Plane) ───────────────────────────────────────────────────

/** Public. Reading what is listed needs no authentication (§9). */
export function listMarkets(edge: EdgeClient): Promise<Result<Market[]>> {
  return edge.query('trade', 'markets.list', z.array(marketSchema));
}

export function openOrders(edge: EdgeClient, marketId?: string): Promise<Result<Order[]>> {
  return edge.query('trade', 'orders.open', z.array(orderSchema), marketId ? { marketId } : undefined);
}

export function myFills(edge: EdgeClient, limit = 50): Promise<Result<Fill[]>> {
  return edge.query('trade', 'fills.mine', z.array(fillSchema), { limit });
}

export interface PlaceOrderInput {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly type: 'market' | 'limit';
  /** Decimal string. Never a number — see `lib/money.ts`. */
  readonly qty: string;
  readonly price?: string;
  readonly clientOrderId?: string;
}

/**
 * THE MONEY PATH. `trade:write` + verification tier + jurisdiction matrix,
 * checked by `scopedProcedure` before svc-trade does anything at all.
 *
 * `clientOrderId` is passed by every caller in this app: without one, a retry
 * on a flaky connection opens a second order.
 */
export function placeOrder(edge: EdgeClient, input: PlaceOrderInput): Promise<Result<Order>> {
  return edge.mutate('trade', 'orders.create', orderSchema, input);
}

export function cancelOrder(edge: EdgeClient, orderId: string): Promise<Result<Order>> {
  return edge.mutate('trade', 'orders.cancel', orderSchema, { orderId });
}

// ── svc-protocol (Protocol Plane) ────────────────────────────────────────────

export function protocolHealth(edge: EdgeClient): Promise<Result<ProtocolHealth>> {
  return edge.query('protocol', 'health', protocolHealthSchema);
}

/**
 * The address a key will own, before anything is deployed.
 *
 * Permissionless — no session, no tier, no account. It is arithmetic over
 * public constants, and this app calls it exactly that way: the DEX plane never
 * sends an Authorization header it does not need.
 */
export function predictAccount(edge: EdgeClient, owner: string): Promise<Result<PredictedAccount>> {
  return edge.query('protocol', 'predictAddress', predictedAccountSchema, { owner });
}

// ── reachability ─────────────────────────────────────────────────────────────

/**
 * `health` on a service's own router, through the edge.
 *
 * This is the real reachability probe the status rail renders: it proves the
 * edge is up, the prefix is routed, AND the upstream answered — three separate
 * things that fail separately.
 */
export function serviceHealth(
  edge: EdgeClient,
  service: 'identity' | 'trade' | 'protocol',
): Promise<Result<{ ok: boolean; service: string }>> {
  return edge.query(service, 'health', serviceHealthSchema);
}
