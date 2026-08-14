/**
 * orderFilled accountId recovery (trade.mm-bot residual).
 *
 * Matching STP ids are user UUIDs for customers and `house:market-maker` for
 * house MM seed. Older / stripped events may omit makerAccountId. The
 * bookkeeping row uses HOUSE_MM_USER_UUID — that UUID must never travel as
 * the fill accountId or a house print looks like a live customer.
 *
 * Never invents house MM from an unknown maker (empty event + no house row).
 * Never invents mids.
 */
import { HOUSE_MM_USER_UUID } from '../spot/ids.js';

/** Matching STP account for house market-maker — distinct from user UUIDs. */
export const MM_MATCHING_ACCOUNT_ID = 'house:market-maker';

export { HOUSE_MM_USER_UUID };

/**
 * Recover the matching STP account for a fill leg.
 *
 * Event payload wins when present and non-empty, except the house bookkeeping
 * UUID which is rewritten to `house:market-maker`. Missing event id falls
 * back to the order row's userId the same way — house UUID → house STP id,
 * customer UUID stays the customer, empty stays empty (caller refuses).
 */
export function recoverMatchingAccountId(input: { eventAccountId?: string | null; orderUserId?: string | null }): string {
  const fromEvent = (input.eventAccountId ?? '').trim();
  if (fromEvent === HOUSE_MM_USER_UUID) return MM_MATCHING_ACCOUNT_ID;
  if (fromEvent.length > 0) return fromEvent;
  const fromOrder = (input.orderUserId ?? '').trim();
  if (fromOrder === HOUSE_MM_USER_UUID) return MM_MATCHING_ACCOUNT_ID;
  return fromOrder;
}

/**
 * True when a fill accountId is missing or is the house bookkeeping UUID.
 * A seeded MM fill that answers true here looks like an anonymous customer.
 */
export function looksLikeAnonymousCustomerFill(accountId: string): boolean {
  const id = accountId.trim();
  return id.length === 0 || id === HOUSE_MM_USER_UUID;
}
