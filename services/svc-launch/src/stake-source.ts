import { parseAmount, type Amount } from '@intafaced/ledger-client';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { LaunchError } from './errors.js';

/**
 * ALLOCATION TIERS BY `token.stakeOf` (§8.4, §4.3).
 *
 * svc-token owns staking; this service reads one number from it and compares it
 * against a threshold. It never stores the stake, and there is deliberately no
 * table here that could — a cached tier is a tier that keeps admitting someone
 * after they have unstaked.
 *
 * ── FAILS CLOSED, and why that is not merely cautious ───────────────────────
 *
 * If the stake cannot be read, the commitment is refused. The alternative —
 * treating an unreachable svc-token as "stake unknown, admit at the lowest
 * gate" — sells a staked allocation to someone who does not hold the stake, and
 * unwinding that means asking people to hand tokens back after a raise has
 * already settled. Nothing has moved at the moment of refusal, which is exactly
 * why refusal is cheap here and expensive everywhere later.
 */
export interface StakeSource {
  stakeOf(userId: string): Promise<Amount>;
}

/**
 * HTTP client for svc-token's `/internal/stake/:userId`.
 *
 * The internal S2S path rather than the tRPC procedure: `token.stakeOf` is a
 * `scopedProcedure` and needs a user principal, which a settlement job running
 * on nobody's behalf does not have.
 */
export function createStakeSource(baseUrl: string, internalSecret: string): StakeSource {
  const url = baseUrl.replace(/\/$/, '');

  return {
    async stakeOf(userId: string): Promise<Amount> {
      let response: Response;
      try {
        response = await fetch(`${url}/internal/stake/${encodeURIComponent(userId)}`, {
          method: 'GET',
          headers: { 'content-type': 'application/json', ...serviceAuthHeaders('svc-launch', internalSecret) },
        });
      } catch (err) {
        throw new LaunchError(`Stake gate unavailable: ${(err as Error).message}`, 'launch.stake_unavailable');
      }

      if (!response.ok) {
        throw new LaunchError(`Stake gate unavailable (${response.status})`, 'launch.stake_unavailable');
      }

      const body = (await response.json().catch(() => null)) as { staked?: unknown } | null;
      if (typeof body?.staked !== 'string') {
        // A stake we cannot parse is a stake we must not guess at.
        throw new LaunchError('Stake gate returned an unusable payload', 'launch.stake_unavailable');
      }

      try {
        return parseAmount(body.staked);
      } catch {
        throw new LaunchError('Stake gate returned an unparseable amount', 'launch.stake_unavailable');
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
