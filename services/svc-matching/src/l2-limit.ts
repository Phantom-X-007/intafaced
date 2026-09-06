/**
 * Owner-published public L2 top-N window. Blank / non-integer / out of 1..500
 * refuses. Never invent 50.
 *
 * Bounds 1..500 match milled WS_DEPTH_LIMIT — a cap, not a default.
 * Resting-order, surveillance-case, and public L3 HTTP pages reuse this window.
 */
export const MATCHING_L2_LIMIT_UNSET = 'matching.l2_limit_unset' as const;
export const MATCHING_RESTING_ORDERS_LIMIT_UNSET = 'matching.resting_orders_limit_unset' as const;
export const MATCHING_SURVEILLANCE_CASES_LIMIT_UNSET = 'matching.surveillance_cases_limit_unset' as const;
export const MATCHING_L3_DEPTH_LIMIT_UNSET = 'matching.l3_depth_limit_unset' as const;

export function isPublishedL2Limit(limit: number | undefined): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= 500;
}

/** Engine ctor-style: unset/null throws. Owner-explicit 50 is a published window. */
export function publishedEngineL2Limit(value: number | undefined | null): number {
  if (value === undefined || value === null) {
    throw new Error('MatchingEngine depth limit is unset — refuse to invent 50');
  }
  return value;
}

/** Query `limit`. Missing / blank / non-integer / out of 1..500 is unpublished. */
export function parsePublicL2QueryLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return isPublishedL2Limit(n) ? n : undefined;
}

/** Same 1..500 cap as public L2. HMAC list pages reuse it — never invent 50/100. */
export const parseMatchingListQueryLimit = parsePublicL2QueryLimit;
