/**
 * Live trade.copy leader plane — Class X residual pin.
 *
 * Tracker `agents.copy-intel` stays audited-refuse until a live leaders
 * allowlist exists (Shehzad M4 / Class X). This module is the load-bearing
 * closed door: an empty sealed allowlist cannot be bypassed by caller ids,
 * invented PnL, or a fake ranked board.
 *
 * Owner opens the plane via env only — unset / blank env stays refuse-closed.
 */

import { AgentError } from '../errors.js';
import type { LeaderStat } from './stats.js';
import { presentLeaderDirectory, type DirectoryResult } from './directory.js';
import { isForbiddenReturnsRankKey } from './returns-board-refuse.js';

/** Refuse-closed unless owner sets LIVE_TRADE_COPY_LEADER_PLANE_OPEN=true. */
export function liveTradeCopyLeaderPlaneOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LIVE_TRADE_COPY_LEADER_PLANE_OPEN?.trim() === 'true';
}

/** Comma-separated owner allowlist — blank env → empty (refuse). */
export function liveTradeCopyLeaderIds(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const raw = env.LIVE_TRADE_COPY_LEADER_IDS?.trim();
  if (!raw) return Object.freeze([]);
  return Object.freeze(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/** Default refuse-closed snapshot at module load (tests pin this stays false). */
export const LIVE_TRADE_COPY_LEADER_PLANE_OPEN = liveTradeCopyLeaderPlaneOpen();

/** Default empty allowlist at module load. */
export const LIVE_TRADE_COPY_LEADER_IDS = liveTradeCopyLeaderIds();

export type LiveLeaderIds = ReadonlySet<string> | readonly string[];

function asSet(ids: LiveLeaderIds | undefined): ReadonlySet<string> {
  if (ids === undefined) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

/** Sealed allowlist only — never the caller's invented ids. */
export function sealedLiveLeaderAllowlist(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  return new Set(liveTradeCopyLeaderIds(env));
}

/**
 * True only when the sealed live plane is open AND the caller named a
 * non-empty subset of sealed ids. Fake / extra ids fail closed.
 */
export function isLiveLeaderPlaneAllowlisted(requested?: LiveLeaderIds, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!liveTradeCopyLeaderPlaneOpen(env)) return false;
  const sealed = sealedLiveLeaderAllowlist(env);
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
  options: { readonly rankBy?: string; readonly leaderAllowlist?: LiveLeaderIds; readonly env?: NodeJS.ProcessEnv } = {},
): DirectoryResult | LiveLeaderPlaneRefuse | never {
  const env = options.env ?? process.env;
  if (options.rankBy !== undefined && isForbiddenReturnsRankKey(options.rankBy)) {
    return refuseLiveLeaderBoard(options.rankBy);
  }
  if (!isLiveLeaderPlaneAllowlisted(options.leaderAllowlist, env)) {
    return refuseLiveLeaderPlane();
  }
  return presentLeaderDirectory({ stats, mode: 'directory', sortBy: 'leaderId' });
}
