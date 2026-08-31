/**
 * Rest a linked OCO with take-profit and stop-loss.
 * First fill cancels the sibling (existing ocoSiblingId path).
 * Refuse if either sibling trigger is missing. The engine does not invent a trigger.
 */
import { ZERO, type Amount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder, SubmitResult } from './types.js';

export const TAKE_PROFIT_MISSING = 'missing_stop_price' as const;
export const STOP_LOSS_MISSING = 'missing_stop_price' as const;

const FLAG = Symbol.for('intafaced.matching.ocoLink');

type OcoOrder = EngineOrder & {
  readonly oco?: boolean;
  readonly takeProfit?: Amount | null;
  readonly stopLoss?: Amount | null;
  readonly takeProfitOrderId?: string | null;
  readonly stopLossOrderId?: string | null;
};

export function wantsOco(order: {
  readonly oco?: boolean;
  readonly takeProfit?: Amount | null;
  readonly stopLoss?: Amount | null;
}): boolean {
  return order.oco === true || order.takeProfit !== undefined || order.stopLoss !== undefined;
}

/** Caller take-profit. Null/zero is missing — never last, mid, or mark. */
export function readTakeProfit(order: { readonly takeProfit?: Amount | null }): Amount | null {
  if (order.takeProfit === undefined || order.takeProfit === null || order.takeProfit <= ZERO) return null;
  return order.takeProfit;
}

/** Caller stop-loss. Null/zero is missing — never last, mid, or mark. */
export function readStopLoss(order: { readonly stopLoss?: Amount | null }): Amount | null {
  if (order.stopLoss === undefined || order.stopLoss === null || order.stopLoss <= ZERO) return null;
  return order.stopLoss;
}

export function takeProfitRefuse(
  takeProfit: Amount | null,
): { readonly code: typeof TAKE_PROFIT_MISSING; readonly message: string } | null {
  if (takeProfit !== null) return null;
  return {
    code: TAKE_PROFIT_MISSING,
    message: 'an OCO take-profit is missing; the engine does not invent a trigger',
  };
}

export function stopLossRefuse(
  stopLoss: Amount | null,
): { readonly code: typeof STOP_LOSS_MISSING; readonly message: string } | null {
  if (stopLoss !== null) return null;
  return {
    code: STOP_LOSS_MISSING,
    message: 'an OCO stop-loss is missing; the engine does not invent a trigger',
  };
}

function rejected(code: NonNullable<SubmitResult['rejected']>['code'], message: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { code, message },
    cancellations: [],
    triggered: [],
  };
}

function baseOrder(extra: OcoOrder): EngineOrder {
  const {
    takeProfit: _takeProfit,
    stopLoss: _stopLoss,
    oco: _oco,
    takeProfitOrderId: _takeProfitOrderId,
    stopLossOrderId: _stopLossOrderId,
    ...base
  } = extra;
  return base;
}

export function installOcoLink(ctor: typeof OrderBook): void {
  const proto = ctor.prototype as {
    submit: (order: EngineOrder, now?: Date | null) => SubmitResult;
    cancel: (orderId: string) => { cancellation: { orderId: string } | null };
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const orig = proto.submit;
  proto.submit = function (this: OrderBook, order: EngineOrder, now?: Date | null) {
    const extra = order as OcoOrder;
    if (!wantsOco(extra)) return orig.call(this, order, now);

    const takeProfit = readTakeProfit(extra);
    if (takeProfit === null) {
      const missingTp = takeProfitRefuse(takeProfit);
      return rejected(missingTp!.code, missingTp!.message);
    }
    const stopLoss = readStopLoss(extra);
    if (stopLoss === null) {
      const missingSl = stopLossRefuse(stopLoss);
      return rejected(missingSl!.code, missingSl!.message);
    }

    const tpId =
      extra.takeProfitOrderId && extra.takeProfitOrderId.length > 0 ? extra.takeProfitOrderId : `${order.orderId}:tp`;
    const slId =
      extra.stopLossOrderId && extra.stopLossOrderId.length > 0 ? extra.stopLossOrderId : `${order.orderId}:sl`;
    const base = baseOrder(extra);

    const sl = orig.call(
      this,
      {
        ...base,
        orderId: slId,
        type: 'stop',
        price: null,
        stopPrice: stopLoss,
        ocoSiblingId: tpId,
      },
      now,
    );
    if (!sl.accepted) return sl;

    const tp = orig.call(
      this,
      {
        ...base,
        orderId: tpId,
        type: 'limit',
        price: takeProfit,
        stopPrice: null,
        ocoSiblingId: slId,
      },
      now,
    );
    if (!tp.accepted) {
      proto.cancel.call(this, slId);
      return tp;
    }

    return {
      accepted: true,
      sequence: tp.sequence ?? sl.sequence,
      fills: [...sl.fills, ...tp.fills],
      resting: tp.resting ?? sl.resting,
      cancellations: [...sl.cancellations, ...tp.cancellations],
      triggered: [...sl.triggered, ...tp.triggered],
    };
  };
}

installOcoLink(OrderBook);
