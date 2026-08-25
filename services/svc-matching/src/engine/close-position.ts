import { ZERO, type Amount } from '@intafaced/ledger-client/money';
import type { AccountId, EngineOrder, OrderId, RejectReason, SubmitResult } from './types.js';

/**
 * Close-position flatten. Position is net fills on that book.
 * The engine does not invent a mark. Fills come from the live book.
 */

export interface ClosePositionCommand {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
}

export function positionFlatRefuse(): RejectReason {
  return {
    code: 'position_flat',
    message: 'account is flat on this book; the engine does not invent a mark',
  };
}

export function positionFlatResult(): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: positionFlatRefuse(),
    cancellations: [],
    triggered: [],
  };
}

/**
 * Reduce-only market that flattens exactly the signed net.
 * Long → sell abs(net). Short → buy abs(net). No caller qty. No invented price.
 */
export function flattenCloseOrder(cmd: ClosePositionCommand, net: Amount): EngineOrder {
  const long = net > ZERO;
  return {
    orderId: cmd.orderId,
    accountId: cmd.accountId,
    type: 'market',
    side: long ? 'sell' : 'buy',
    qty: long ? net : -net,
    price: null,
    stopPrice: null,
    tif: 'IOC',
    reduceOnly: true,
  };
}
