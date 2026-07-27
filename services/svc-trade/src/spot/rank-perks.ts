import { BASE_PERKS, rankPerksSchema, type RankPerks } from '@intafaced/contracts';
import { TradeError } from './types.js';

/**
 * RANK PERKS (§4.1, §5.2 "fee-tier").
 *
 * svc-identity owns the ladder; this service reads one field from it. The
 * contract shape lives in `packages/contracts`, so a change to the perk table
 * is a compile error here rather than a silently ignored field.
 *
 * WHEN this is read matters more than how. It is read ONCE, at order placement,
 * and the result is snapshotted onto the order row. Two consequences, both
 * deliberate:
 *
 *   1. A rank change cannot retroactively re-price an order that was already
 *      accepted on the old terms — the same reason `token.stakes` snapshots its
 *      multiplier at open.
 *   2. The fill path makes no network call. A fill must settle even when
 *      svc-identity is down, because by then the match has already printed and
 *      the counterparty is already owed.
 */
export interface RankPerksSource {
  perksOf(userId: string): Promise<RankPerks>;
}

/** Rank 0 for everyone. Used by tests and by a dev stack running without svc-identity. */
export class BasePerks implements RankPerksSource {
  async perksOf(): Promise<RankPerks> {
    return BASE_PERKS;
  }
}

/**
 * HTTP client for svc-identity's `rank.perks`.
 *
 * FAILS CLOSED. If the perk table cannot be read, the order is refused before
 * anything is held — the alternative is charging a discounted trader the full
 * rate because a service they cannot see was unavailable, and a fee taken in
 * error is far harder to unwind than an order that was never placed. Nothing
 * has moved at this point in the flow, which is exactly why this is the right
 * place to be strict.
 */
export function createRankPerksClient(baseUrl: string): RankPerksSource {
  const url = baseUrl.replace(/\/$/, '');

  return {
    async perksOf(userId: string): Promise<RankPerks> {
      let response: Response;
      try {
        response = await fetch(`${url}/trpc/rank.perks?input=${encodeURIComponent(JSON.stringify({ userId }))}`, {
          method: 'GET',
          headers: { 'content-type': 'application/json' },
        });
      } catch (err) {
        throw new TradeError(`rank perks unavailable: ${(err as Error).message}`, 'trade.perks_unavailable');
      }

      if (!response.ok) {
        throw new TradeError(`rank perks unavailable (${response.status})`, 'trade.perks_unavailable');
      }

      const body = (await response.json()) as { result?: { data?: unknown } };
      const parsed = rankPerksSchema.safeParse(body.result?.data);
      if (!parsed.success) {
        // A perk table we cannot parse is a perk table we must not guess at.
        throw new TradeError('rank perks payload did not match the published contract', 'trade.perks_unavailable');
      }

      return parsed.data;
    },
  };
}
