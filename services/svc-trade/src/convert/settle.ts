/**
 * Convert settle — ledger-client recipes only (Doctrine §0.6).
 *
 * Principal house inventory at the **bound** quoted notional. Spread is
 * disclosed on the quote; fee bps stay 0 (no silent second markup). This is
 * not a book trade: matching is never called.
 */

import { recipes, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import type { BoundConvertFill } from './quote.js';

export interface ConvertSettlePlan {
  readonly hold: PostRequest;
  readonly mmHold: PostRequest;
  readonly fill: PostRequest;
}

export function planConvertSettle(input: {
  bound: BoundConvertFill;
  takerOrderId: string;
  makerOrderId: string;
  fillId: string;
}): ConvertSettlePlan {
  const q = input.bound.quote;
  const takerPaysAsset = q.side === 'buy' ? q.quoteAsset : q.baseAsset;
  const takerPaysAmount = q.side === 'buy' ? input.bound.fillNotional : q.filledQty;
  const makerPaysAsset = q.side === 'buy' ? q.baseAsset : q.quoteAsset;
  const makerPaysAmount = q.side === 'buy' ? q.filledQty : input.bound.fillNotional;

  return {
    hold: recipes.orderHold({
      orderId: input.takerOrderId,
      userId: q.userId,
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
      takerId: q.userId,
      makerOrderId: input.makerOrderId,
      takerOrderId: input.takerOrderId,
      baseAsset: q.baseAsset,
      quoteAsset: q.quoteAsset,
      qty: q.filledQty,
      quoteAmount: input.bound.fillNotional,
      takerSide: q.side,
      makerFeeBps: 0,
      takerFeeBps: 0,
    }),
  };
}

/** House inventory first — a house shortfall must not strand a customer hold. */
export async function postConvertSettle(ledger: LedgerClient, plan: ConvertSettlePlan): Promise<void> {
  await ledger.post(plan.mmHold);
  await ledger.post(plan.hold);
  await ledger.post(plan.fill);
}
