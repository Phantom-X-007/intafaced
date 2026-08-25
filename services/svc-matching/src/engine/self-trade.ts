/**
 * Self-trade: refuse the incoming taker. Do not invent a self-fill.
 * Resting maker stays. Missing or different accountIds match as today.
 * No owner STP mode — expire-taker only.
 */

export const SELF_TRADE = 'self_trade' as const;

export type SelfTradeRefuse = typeof SELF_TRADE;

/** Same live account. Empty ids are missing — they are not a self-trade. */
export function isSelfTrade(takerAccountId: string, makerAccountId: string): boolean {
  return takerAccountId.length > 0 && makerAccountId.length > 0 && takerAccountId === makerAccountId;
}

export function selfTradeRefuse(): { readonly code: typeof SELF_TRADE; readonly message: string } {
  return {
    code: SELF_TRADE,
    message: 'incoming order would match the same account; the engine does not invent a self-fill',
  };
}
