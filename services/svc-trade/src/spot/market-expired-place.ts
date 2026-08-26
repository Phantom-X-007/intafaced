import type { Principal } from '@intafaced/auth';
import { TradeError } from './types.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import type { EngineSubmitResult } from './matching-client.js';
import type { Market } from './types.js';

/**
 * Matching operator expire of one market (`market_expired`).
 * New submits refuse. Cancels stay. Other markets stay open.
 * Distinct from halt: `resume` does not reopen expire.
 * Distinct from prelaunch: `open` does not clear expire.
 * Trade does not swallow the refuse as a fill.
 */

const FLAG = Symbol.for('intafaced.trade.marketExpiredPlace');

export const MARKET_EXPIRED = 'market_expired' as const;

const MARKET_EXPIRED_MESSAGE = 'market is expired — new submits are refused; trade does not swallow this as a fill';

export function matchingMarketExpiredRefuse(
  rejected: { readonly code: string; readonly message?: string } | null | undefined,
): TradeError | null {
  if (rejected?.code !== MARKET_EXPIRED) return null;
  return new TradeError(
    rejected.message && rejected.message.length > 0 ? rejected.message : MARKET_EXPIRED_MESSAGE,
    'trade.market_expired',
  );
}

export function matchingSubmitMarketExpiredRefuse(
  result:
    | {
        readonly rejected?: { readonly code: string; readonly message?: string } | null;
      }
    | null
    | undefined,
): TradeError | null {
  if (result == null) return null;
  return matchingMarketExpiredRefuse(result.rejected);
}

function expiredRejectResult(): EngineSubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { code: MARKET_EXPIRED, message: MARKET_EXPIRED_MESSAGE },
    cancellations: [],
    triggered: [],
  };
}

export function installMarketExpiredPlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string; rejectCode?: string | null }>;
    applySubmitResult: (market: Market, orderId: string, result: EngineSubmitResult) => Promise<void>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const order = await origPlace.call(this, principal, input);
    const refuse = matchingMarketExpiredRefuse(order.rejectCode ? { code: order.rejectCode } : null);
    if (refuse) throw refuse;
    return order;
  };

  if (typeof proto.applySubmitResult === 'function') {
    const origApply = proto.applySubmitResult;
    proto.applySubmitResult = async function (this: TradeService, market: Market, orderId: string, result: EngineSubmitResult) {
      const refuse = matchingSubmitMarketExpiredRefuse(result);
      if (refuse) {
        await origApply.call(this, market, orderId, expiredRejectResult());
        throw refuse;
      }
      return origApply.call(this, market, orderId, result);
    };
  }
}

installMarketExpiredPlace(TradeService);
