/**
 * Live trade.copy leader plane — Class X residual pin.
 *
 * Tracker `agents.copy-intel` stays audited-refuse until a live leaders
 * allowlist exists (Shehzad M4 / Class X). This module is the load-bearing
 * closed door: an empty sealed allowlist cannot be bypassed by caller ids,
 * invented PnL, or a fake ranked board.
 *
 * Phase A: existing `returns-board-refuse` + `presentLeaderDirectory`.
 * Do not invent leader stats. Do not mark the tracker done from this pin.
 */

import { AgentError } from '../errors.js';
import type { LeaderStat } from './stats.js';
import { presentLeaderDirectory, type DirectoryResult } from './directory.js';
import { isForbiddenReturnsRankKey } from './returns-board-refuse.js';

/**
 * Sealed product flag. Flip only when a live trade.copy leader plane exists
 * (Class X). Agents must not set this true to ship a fixture leaderboard.
 */
export const LIVE_TRADE_COPY_LEADER_PLANE_OPEN = false;

/**
 * Sealed live leader ids. Empty until Class X names real allowlisted leaders.
 * Caller-supplied ids never populate this list.
 */
export const LIVE_TRADE_COPY_LEADER_IDS: readonly string[] = Object.freeze([]);

export type LiveLeaderIds = ReadonlySet<string> | readonly string[];

function asSet(ids: LiveLeaderIds | undefined): ReadonlySet<string> {
  if (ids === undefined) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

/** Sealed allowlist only — never the caller's invented ids. */
export function sealedLiveLeaderAllowlist(): ReadonlySet<string> {
  return new Set(LIVE_TRADE_COPY_LEADER_IDS);
}

/**
 * True only when the sealed live plane is open AND the caller named a
 * non-empty subset of sealed ids. Fake / extra ids fail closed.
 */
export function isLiveLeaderPlaneAllowlisted(requested?: LiveLeaderIds): boolean {
  if (!LIVE_TRADE_COPY_LEADER_PLANE_OPEN) return false;
  const sealed = sealedLiveLeaderAllowlist();
  if (sealed.size === 0) return false;
  const asked = asSet(requested);
  if (asked.size === 0) return false;
  for (const id of asked) {
    if (!sealed.has(id)) return false;
  }
  return true;
}

export type LiveLeaderPlaneRefuse = {
  readonly status: 'refuse';
  readonly reason: 'no_live_leaders';
  readonly userMessageKey: 'agents.copy_intel.unavailable';
};

/** Cheap refuse — live leader plane is not allowlisted (Class X residual). */
export function refuseLiveLeaderPlane(): LiveLeaderPlaneRefuse {
  return {
    status: 'refuse',
    reason: 'no_live_leaders',
    userMessageKey: 'agents.copy_intel.unavailable',
  };
}

/**
 * Hard refuse of a live / ranked marketing board. Never returns invented
 * leader stats or a PnL rank. Machine code stays `agents.refused`.
 */
export function refuseLiveLeaderBoard(rankBy = 'live'): never {
  throw new AgentError(
    `Live leader plane refused (rankBy=${rankBy}) — agents.copy-intel Class X; no live trade.copy leaders allowlist`,
    'agents.refused',
    'agents.copy_intel.unavailable',
    { reason: 'no_live_leaders', rankBy },
  );
}

/**
 * Present a "live" leader board. Always refuse until the sealed allowlist
 * opens — including when the caller hands PnL-desc fixtures or fake ids.
 */
export function presentLiveLeaderBoard(
  stats: readonly LeaderStat[],
  options: { readonly rankBy?: string; readonly leaderAllowlist?: LiveLeaderIds } = {},
): DirectoryResult | never {
  if (options.rankBy !== undefined && isForbiddenReturnsRankKey(options.rankBy)) {
    return refuseLiveLeaderBoard(options.rankBy);
  }
  if (!isLiveLeaderPlaneAllowlisted(options.leaderAllowlist)) {
    return {
      status: 'refuse',
      reason: 'marketing_board',
      userMessageKey: 'agents.copy_intel.unavailable',
    };
  }
  // Unreachable while LIVE_TRADE_COPY_LEADER_PLANE_OPEN is false / ids empty.
  // Directory only — never a returns rank — if Class X later opens the seal.
  return presentLeaderDirectory({ stats, mode: 'directory', sortBy: 'leaderId' });
}
