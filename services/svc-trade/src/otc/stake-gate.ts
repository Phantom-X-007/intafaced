/**
 * OTC staked-tier gate (doctrine §5.2 / D-S-02).
 *
 * minStake comes only from published desk law — never invented here.
 */

import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { OtcError } from './errors.js';

export type StakeGateOk = { readonly status: 'ok'; readonly stake: Amount; readonly minStake: Amount };
export type StakeGateRefuse = {
  readonly status: 'refuse';
  readonly reason: 'below_min' | 'stake_unread';
  readonly stake: Amount | null;
  readonly minStake: Amount;
};
export type StakeGateResult = StakeGateOk | StakeGateRefuse;

export function otcStakeGate(input: { stake: Amount; minStake: Amount }): StakeGateResult {
  if (input.stake < input.minStake) {
    return { status: 'refuse', reason: 'below_min', stake: input.stake, minStake: input.minStake };
  }
  return { status: 'ok', stake: input.stake, minStake: input.minStake };
}

export function assertOtcStakeGate(result: StakeGateResult): asserts result is StakeGateOk {
  if (result.status === 'ok') return;
  const stakeLabel = result.stake === null ? 'unread' : formatAmount(result.stake);
  throw new OtcError(`OTC staked-tier gate refused: stake ${stakeLabel} < min ${formatAmount(result.minStake)}`, 'trade.otc_stake_gate');
}
