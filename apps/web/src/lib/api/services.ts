import { z } from 'zod';
import type { EdgeClient } from './edge-client';
import type { Result } from '../result';
import {
  fiatCurrencySchema,
  fillSchema,
  kycStatusSchema,
  marketSchema,
  orderSchema,
  otcDisputeOpenedSchema,
  otcDisputeSchema,
  otcOfferSchema,
  otcReputationSchema,
  otcTradeSchema,
  predictedAccountSchema,
  protocolHealthSchema,
  serviceHealthSchema,
  sessionSchema,
  type FiatCurrency,
  type Fill,
  type KycStatus,
  type Market,
  type Order,
  type OrderSide,
  type OtcDispute,
  type OtcDisputeOpened,
  type OtcOffer,
  type OtcReputation,
  type OtcSide,
  type OtcTrade,
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

// ── svc-p2p (the OTC desk) ───────────────────────────────────────────────────

/**
 * THE OTC DESK — the platform's fiat on/off ramp (§6.2).
 *
 * Every call here is `/api/p2p` through the edge, and every one that moves
 * value ends in a ledger recipe inside svc-p2p: `escrowLock` on take,
 * `escrowRelease` on confirm, `escrowRefund` on cancel or a moderator's refund.
 * This app never sees a balance and never posts one — Doctrine §0.6 — which is
 * why there is no `otcBalance()` on this list and never will be.
 *
 * The vendored Java OTC at `/otc/*` is NOT reachable from here on purpose. It
 * settles by mutating `member_wallet` in place, which is a second set of books;
 * see `docs/adr/2026-07-29-otc-desk-ownership.md`.
 */

/** Public. The currency registry is config, and reading it needs no session. */
export function listFiat(edge: EdgeClient): Promise<Result<FiatCurrency[]>> {
  return edge.query('p2p', 'fiat.list', z.array(fiatCurrencySchema));
}

/**
 * The order book of the desk.
 *
 * `p2p:read` + the jurisdiction matrix, which requires verification tier
 * `basic` for the `p2p` module. A caller short of it gets FORBIDDEN carrying
 * `denied.kyc_required` and `requiredTier`, which `classify()` turns into
 * `needs-verification` — the one refusal on the list a user can clear
 * themselves. That is why browsing the desk is gated and reading the currency
 * list above is not.
 */
export function listOtcOffers(
  edge: EdgeClient,
  filter: { asset?: string; fiatCurrency?: string; side?: OtcSide; limit?: number } = {},
): Promise<Result<OtcOffer[]>> {
  return edge.query('p2p', 'offers.list', z.array(otcOfferSchema), filter);
}

export function getOtcOffer(edge: EdgeClient, offerId: string): Promise<Result<OtcOffer>> {
  return edge.query('p2p', 'offers.get', otcOfferSchema, { offerId });
}

export interface CreateOtcOfferInput {
  readonly side: OtcSide;
  readonly asset: string;
  readonly fiatCurrency: string;
  readonly priceType: 'fixed' | 'float';
  /** Decimal strings, all of them. */
  readonly price: string;
  readonly minAmount: string;
  readonly maxAmount: string;
  readonly totalAmount?: string;
  readonly methods?: readonly string[];
  readonly terms?: string;
}

export function createOtcOffer(edge: EdgeClient, input: CreateOtcOfferInput): Promise<Result<OtcOffer>> {
  return edge.mutate('p2p', 'offers.create', otcOfferSchema, input);
}

export function closeOtcOffer(edge: EdgeClient, offerId: string): Promise<Result<OtcOffer>> {
  return edge.mutate('p2p', 'offers.close', otcOfferSchema, { offerId });
}

/**
 * THE MONEY PATH. Taking an offer locks the seller's asset into the ledger's
 * `escrow` account kind before this call returns.
 *
 * If it returns a failure, nothing is held: svc-p2p validates bounds, liquidity
 * and pricing under a row lock BEFORE `escrowLock`, so every rejection here
 * happens with the seller's balance untouched. If it times out rather than
 * failing, the trade is either `created` (and the sweeper unwinds it within the
 * escrow deadline) or `escrowed` (and it appears in `myOtcTrades`). There is no
 * third outcome, which is why this function does not retry.
 */
export function takeOtcOffer(edge: EdgeClient, input: { offerId: string; amount: string; method: string }): Promise<Result<OtcTrade>> {
  return edge.mutate('p2p', 'trades.take', otcTradeSchema, input);
}

/** Buyer: "I have sent the fiat." Moves `escrowed` → `fiat_sent`. Moves no value. */
export function markOtcFiatSent(edge: EdgeClient, tradeId: string): Promise<Result<OtcTrade>> {
  return edge.mutate('p2p', 'trades.markFiatSent', otcTradeSchema, { tradeId });
}

/** Seller: "the fiat landed." → `escrowRelease` to the buyer, minus fee. */
export function confirmOtcReceived(edge: EdgeClient, tradeId: string): Promise<Result<OtcTrade>> {
  return edge.mutate('p2p', 'trades.confirmReceived', otcTradeSchema, { tradeId });
}

/** → `escrowRefund`, in full, to the seller. */
export function cancelOtcTrade(edge: EdgeClient, tradeId: string, reason?: string): Promise<Result<OtcTrade>> {
  return edge.mutate('p2p', 'trades.cancel', otcTradeSchema, reason ? { tradeId, reason } : { tradeId });
}

export function getOtcTrade(edge: EdgeClient, tradeId: string): Promise<Result<OtcTrade>> {
  return edge.query('p2p', 'trades.get', otcTradeSchema, { tradeId });
}

export function myOtcTrades(edge: EdgeClient, limit = 50): Promise<Result<OtcTrade[]>> {
  return edge.query('p2p', 'trades.list', z.array(otcTradeSchema), { limit });
}

/**
 * Escalate to a moderator. Freezes nothing extra — the asset is already in
 * escrow — but replaces the release clock with the dispute clock, which the
 * backstop resolves if no human ever rules.
 */
export function openOtcDispute(
  edge: EdgeClient,
  input: { tradeId: string; reason: string; evidence?: readonly unknown[] },
): Promise<Result<OtcDisputeOpened>> {
  return edge.mutate('p2p', 'disputes.open', otcDisputeOpenedSchema, input);
}

export function getOtcDispute(edge: EdgeClient, tradeId: string): Promise<Result<OtcDispute>> {
  return edge.query('p2p', 'disputes.get', otcDisputeSchema, { tradeId });
}

/** What a counterparty is judged on before anyone trades with them (§6.2 → §4.1). */
export function otcReputation(edge: EdgeClient, userId: string): Promise<Result<OtcReputation>> {
  return edge.query('p2p', 'reputation.get', otcReputationSchema, { userId });
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
