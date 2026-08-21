/**
 * OTC settle plan — ledger-client recipes only (Doctrine §0.6).
 *
 * Platform principal uses marketMakerMakerFill at the **bound** quoted notional.
 * Spread is disclosed on the quote; fee bps stay 0 (no silent second markup).
 * Desk law blank → refuse before any PostRequest is built.
 */

import { recipes, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import { requirePublishedOtcDeskLaw, type OtcDeskLaw } from './desk-law.js';
import { OtcError } from './errors.js';
import { OTC_MAKER_ROUTING_RESIDUAL, OTC_MAKER_ROUTING_SOCKET } from './maker-routing.js';
import type { BoundOtcFill } from './rfq.js';

export interface OtcSettlePlan {
  readonly hold: PostRequest;
  readonly mmHold: PostRequest;
  readonly fill: PostRequest;
}

/**
 * Build the three-post settle path for a bound fill.
 * Caller posts via LedgerClient — this module never holds balances.
 */
export function planOtcSettle(input: {
  law: OtcDeskLaw;
  bound: BoundOtcFill;
  /** Taker order id (user hold key). */
  takerOrderId: string;
  /** House MM order id (inventory hold key). */
  makerOrderId: string;
  fillId: string;
}): OtcSettlePlan {
  requirePublishedOtcDeskLaw(input.law);

  if (input.bound.counterparty !== 'platform') {
    throw new OtcError(
      `Maker-routed OTC settle is refuse-closed (${OTC_MAKER_ROUTING_SOCKET}) — never invent a maker ledger path`,
      'trade.otc_settle_refused',
      OTC_MAKER_ROUTING_RESIDUAL,
    );
  }

  const takerPaysAsset = input.bound.side === 'buy' ? input.bound.quoteAsset : input.bound.baseAsset;
  const takerPaysAmount = input.bound.side === 'buy' ? input.bound.fillNotional : input.bound.qty;
  const makerPaysAsset = input.bound.side === 'buy' ? input.bound.baseAsset : input.bound.quoteAsset;
  const makerPaysAmount = input.bound.side === 'buy' ? input.bound.qty : input.bound.fillNotional;

  return {
    hold: recipes.orderHold({
      orderId: input.takerOrderId,
      userId: input.bound.userId,
      assetId: takerPaysAsset,
      amount: takerPaysAmount,
    }),
    mmHold: recipes.marketMakerOrderHold({
      orderId: input.makerOrderId,
      assetId: makerPaysAsset,
      amount: makerPaysAmount,
    }),
    fill: recipes.marketMakerMakerFill({
      fillId: input.fillId,
      takerId: input.bound.userId,
      makerOrderId: input.makerOrderId,
      takerOrderId: input.takerOrderId,
      baseAsset: input.bound.baseAsset,
      quoteAsset: input.bound.quoteAsset,
      qty: input.bound.qty,
      quoteAmount: input.bound.fillNotional,
      takerSide: input.bound.side,
      makerFeeBps: 0,
      takerFeeBps: 0,
    }),
  };
}

/**
 * Post settle plan in order. Idempotent via recipe keys (see `otcSettleIdsFor`).
 *
 * HOUSE MONEY MOVES FIRST, and the order is the point. If the desk is short the
 * asset it is selling, the failure has to land on the house, not the customer:
 * posting the taker hold first takes the customer's funds into a hold pot that
 * this module has no path to release — there is no OTC cancel and no
 * `orderHoldRelease` call anywhere in `otc/` — so a house inventory shortfall
 * stranded a customer's balance behind a refusal they did not cause.
 *
 * With `mmHold` first, an inventory shortfall refuses before anything of the
 * customer's has moved. A shortfall on the taker side instead leaves house
 * funds in a house hold pot, which ops can see and recover.
 */
export async function postOtcSettle(ledger: LedgerClient, plan: OtcSettlePlan): Promise<void> {
  await ledger.post(plan.mmHold);
  await ledger.post(plan.hold);
  await ledger.post(plan.fill);
}
