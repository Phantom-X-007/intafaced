/**
 * svc-launch's own failure vocabulary.
 *
 * Codes are stable strings because they are what an SLO dashboard groups by and
 * what a client branches on. `launch.hard_cap_reached` (the raise is full — a
 * normal, expected outcome for a popular sale) and `launch.tier_not_met` (this
 * caller does not stake enough) are both "your commitment was refused", and
 * collapsing them into one message would leave the user unable to tell whether
 * to stake more or simply go home.
 */
export type LaunchErrorCode =
  | 'launch.raise_not_found'
  | 'launch.not_issuer'
  | 'launch.bad_status'
  | 'launch.window_closed'
  | 'launch.window_not_closed'
  | 'launch.hard_cap_reached'
  | 'launch.tier_not_met'
  | 'launch.no_tiers'
  | 'launch.allocation_cap_reached'
  | 'launch.below_minimum'
  | 'launch.stake_unavailable'
  | 'launch.contribution_not_found'
  | 'launch.schedule_not_found'
  | 'launch.nothing_claimable'
  | 'launch.no_supply'
  | 'launch.no_price'
  | 'launch.invalid_contribution'
  | 'launch.vesting_empty'
  | 'launch.vesting_window'
  | 'launch.vesting_cliff'
  | 'launch.vesting_released'
  | 'launch.vesting_overreleased'
  | 'launch.settle_count_failed';

export class LaunchError extends Error {
  constructor(
    message: string,
    readonly code: LaunchErrorCode,
  ) {
    super(message);
    this.name = 'LaunchError';
  }
}
