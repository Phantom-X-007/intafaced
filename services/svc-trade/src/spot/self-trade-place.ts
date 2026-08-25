import type { Principal } from '@intafaced/auth';
import { TradeError } from './types.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';

/**
 * Matching expire-taker self-trade. Incoming that would match the same account
 * is refused. Resting stays. Trade does not invent a self-fill or cancel the rest.
 * No owner STP mode.
 */

const FLAG = Symbol.for('intafaced.trade.selfTradePlace');

export const SELF_TRADE = 'self_trade' as const;

export function matchingSelfTradeRefuse(
  rejected: { readonly code: string; readonly message?: string } | null | undefined,
): TradeError | null {
  if (rejected?.code !== SELF_TRADE) return null;
  return new TradeError('incoming order would match the same account; trade does not invent a self-fill', 'trade.self_trade');
}

export function installSelfTradePlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string; rejectCode?: string | null }>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const order = await origPlace.call(this, principal, input);
    const refuse = matchingSelfTradeRefuse(order.rejectCode ? { code: order.rejectCode } : null);
    if (refuse) throw refuse;
    return order;
  };
}

installSelfTradePlace(TradeService);
