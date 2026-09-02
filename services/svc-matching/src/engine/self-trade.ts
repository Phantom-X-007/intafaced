/**
 * Self-trade: expire the resting maker, continue the taker.
 * Do not invent a self-fill. Missing STP identity refuses the match.
 * v1 mode is CANCEL_RESTING_CONTINUE. No owner STP mode.
 * STP is the event source for a named self-trade surveillance case — not a silent drop.
 */
import type { Amount } from '@intafaced/ledger-client/money';
import { openSurveillanceCase, type OpenSurveillanceCaseResult } from './surveillance-case.js';
import type { AccountId, CancelledRef, MarketId, OrderId, RejectReason } from './types.js';

export const SELF_TRADE_PREVENTION = 'self_trade_prevention' as const;

export function stpIdentityPresent(accountId: string): boolean {
  return accountId.trim().length > 0;
}

/** Missing STP identity refuses the match. The engine does not invent an STP group. */
export function stpIdentityRefuse(accountId: string): RejectReason | null {
  if (stpIdentityPresent(accountId)) return null;
  return {
    code: 'self_trade',
    message: 'STP identity missing; the engine does not invent a group',
  };
}

/** Same live account. Empty ids are missing — they are not a self-trade. */
export function isSelfTrade(takerAccountId: string, makerAccountId: string): boolean {
  return stpIdentityPresent(takerAccountId) && stpIdentityPresent(makerAccountId) && takerAccountId === makerAccountId;
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

/** Named case for an STP event. Evidence only — expire still owns the rest. */
export function selfTradeSurveillanceCase(accountId: AccountId, marketId: MarketId): OpenSurveillanceCaseResult {
  return openSurveillanceCase({ accountId, marketId, reason: 'self_trade' });
}
