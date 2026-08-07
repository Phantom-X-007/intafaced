/**
 * Stake gate source for OTC (token.stakeOf via S2S).
 * Fails closed — never invent a stake total.
 */

import { parseAmount, type Amount } from '@intafaced/ledger-client';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { OtcError } from './errors.js';

export interface OtcStakeSource {
  stakeOf(userId: string): Promise<Amount>;
}

export function createOtcStakeSource(baseUrl: string, internalSecret: string): OtcStakeSource {
  const url = baseUrl.replace(/\/$/, '');

  return {
    async stakeOf(userId: string): Promise<Amount> {
      let response: Response;
      try {
        response = await fetch(`${url}/internal/stake/${encodeURIComponent(userId)}`, {
          method: 'GET',
          headers: { 'content-type': 'application/json', ...serviceAuthHeaders('svc-trade', internalSecret) },
        });
      } catch (err) {
        throw new OtcError(`OTC stake gate unavailable: ${(err as Error).message}`, 'trade.otc_stake_unavailable');
      }

      if (!response.ok) {
        throw new OtcError(`OTC stake gate unavailable (${response.status})`, 'trade.otc_stake_unavailable');
      }

      const body = (await response.json().catch(() => null)) as { staked?: unknown } | null;
      if (typeof body?.staked !== 'string') {
        throw new OtcError('OTC stake gate returned an unusable payload', 'trade.otc_stake_unavailable');
      }

      try {
        return parseAmount(body.staked);
      } catch {
        throw new OtcError('OTC stake gate returned an unparseable amount', 'trade.otc_stake_unavailable');
      }
    },
  };
}

/** Explicit fixed stake for tests — never a production fallback. */
export class FixedOtcStake implements OtcStakeSource {
  constructor(private readonly staked: Amount) {}
  async stakeOf(): Promise<Amount> {
    return this.staked;
  }
}
