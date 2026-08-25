/**
 * Self-trade: expire the resting maker, continue the taker.
 * Do not invent a self-fill. Missing or different accountIds match as today.
 * No owner STP mode — cancel-resting is the only rule.
 */
import type { Amount } from '@intafaced/ledger-client/money';
import type { AccountId, CancelledRef, OrderId } from './types.js';

export const SELF_TRADE_PREVENTION = 'self_trade_prevention' as const;

/** Same live account. Empty ids are missing — they are not a self-trade. */
export function isSelfTrade(takerAccountId: string, makerAccountId: string): boolean {
  return takerAccountId.length > 0 && makerAccountId.length > 0 && takerAccountId === makerAccountId;
}

export function selfTradeExpire(orderId: OrderId, accountId: AccountId, remainingQty: Amount, sequence: number): CancelledRef {
  return {
    orderId,
    accountId,
    remainingQty,
    sequence,
    reason: SELF_TRADE_PREVENTION,
  };
}
