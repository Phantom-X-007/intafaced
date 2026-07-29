import { parseAmount, type Amount } from '@intafaced/ledger-client';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { AcademyError } from './errors.js';

/**
 * STAKED LOBBIES (§8.3, §XIII "free tier + premium + staked lobbies").
 *
 * svc-token owns staking; this service reads one number from it and compares it
 * against a room's threshold. It never stores the stake — a cached stake is a
 * gate that keeps admitting someone after they have unstaked.
 *
 * ── FAILS CLOSED, but only where it has to ──────────────────────────────────
 *
 * If the stake cannot be read, the seat is refused. Admitting on an unreadable
 * stake would open every staked lobby to everyone for the length of an outage,
 * which is precisely the outage during which nobody would notice.
 *
 * `needsStakeCheck` (access/room-access.ts) is what keeps that strictness
 * confined: free and invite-only lobbies never ask, so svc-token being down
 * does not close the whole Academy.
 */
export interface StakeSource {
  stakeOf(userId: string): Promise<Amount>;
}

/**
 * HTTP client for svc-token's `/internal/stake/:userId`.
 *
 * The internal S2S path rather than the tRPC procedure: `token.stakeOf` is a
 * `scopedProcedure` and would require this service to forward a user principal
 * it does not hold.
 */
export function createStakeSource(baseUrl: string, internalSecret: string): StakeSource {
  const url = baseUrl.replace(/\/$/, '');

  return {
    async stakeOf(userId: string): Promise<Amount> {
      let response: Response;
      try {
        response = await fetch(`${url}/internal/stake/${encodeURIComponent(userId)}`, {
          method: 'GET',
          headers: { 'content-type': 'application/json', ...serviceAuthHeaders('svc-academy', internalSecret) },
        });
      } catch (err) {
        throw new AcademyError(`Stake gate unavailable: ${(err as Error).message}`, 'academy.stake_unavailable');
      }

      if (!response.ok) {
        throw new AcademyError(`Stake gate unavailable (${response.status})`, 'academy.stake_unavailable');
      }

      const body = (await response.json().catch(() => null)) as { staked?: unknown } | null;
      if (typeof body?.staked !== 'string') {
        throw new AcademyError('Stake gate returned an unusable payload', 'academy.stake_unavailable');
      }

      try {
        return parseAmount(body.staked);
      } catch {
        throw new AcademyError('Stake gate returned an unparseable amount', 'academy.stake_unavailable');
      }
    },
  };
}

/**
 * A fixed stake for every caller. Tests and a dev stack running without
 * svc-token — never a production fallback, which is why it must be constructed
 * explicitly rather than reached by a catch block.
 */
export class FixedStake implements StakeSource {
  constructor(private readonly staked: Amount) {}

  async stakeOf(): Promise<Amount> {
    return this.staked;
  }
}
