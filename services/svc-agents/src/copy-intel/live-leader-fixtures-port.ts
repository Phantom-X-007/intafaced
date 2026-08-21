/**
 * Live trade.copy leader performance fixtures door for copy-intel stats runs.
 *
 * Production leave this unset: live leader stats are Class X. An unset port is
 * the honest refuse (`no_live_leaders`) — never invented PnL or win rates.
 *
 * Caller-supplied fixtures stay fixture/dark only. Live truth is this port.
 */

import type { LeaderPerformanceFixture } from './stats.js';

export type CopyLeaderFixturesPort = {
  /**
   * Grounded live leader fixtures. Empty array or throw = unavailable.
   * Never invent PnL inside the port.
   */
  sample(): Promise<readonly LeaderPerformanceFixture[]>;
};

export type LiveLeaderFixtures =
  | { readonly ok: true; readonly fixtures: readonly LeaderPerformanceFixture[] }
  | { readonly ok: false; readonly reason: 'no_live_leaders' };

/**
 * Resolve live fixtures. Missing port, empty series, or sample failure all
 * collapse to the same named refuse — not an empty board and not invented PnL.
 */
export async function readLiveLeaderFixtures(port: CopyLeaderFixturesPort | undefined): Promise<LiveLeaderFixtures> {
  if (port === undefined) {
    return { ok: false, reason: 'no_live_leaders' };
  }
  try {
    const fixtures = await port.sample();
    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      return { ok: false, reason: 'no_live_leaders' };
    }
    return { ok: true, fixtures };
  } catch {
    return { ok: false, reason: 'no_live_leaders' };
  }
}
