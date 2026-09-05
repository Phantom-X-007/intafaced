/**
 * D26-P1-A5 — audited leader stats may be written; returns-ranked marketing
 * boards are forbidden (SPEC-SOVEREIGN §4 / trade.copy mirror).
 *
 * Scope: copy-intel presentation only. Never invents PnL; never sorts by
 * realisedPnl / winRate / "returns" for a marketing leaderboard.
 */

import { parseAmount } from '@intafaced/ledger-client';
import { AgentError } from '../errors.js';
import type { IntelOk, IntelResult, LeaderStat } from './stats.js';

/** Rank keys that would produce a returns-ranked marketing board. Named refuse surface. */
export const FORBIDDEN_RETURNS_RANK_KEYS = [
  'realisedPnl',
  'realizedPnl',
  'winRate',
  'win_rate',
  'returns',
  'return',
  'pnl',
  'performance',
  'profit',
  'roi',
  'rank',
] as const;

/** Machine reason on the named throw (`rankLeadersByReturns`). */
export const RETURNS_RANKED_BOARD_REFUSE_REASON = 'returns_ranked_board_forbidden' as const;

export type ForbiddenReturnsRankKey = (typeof FORBIDDEN_RETURNS_RANK_KEYS)[number];

/** Safe presentation orders — never performance-ranked. */
export type AuditedStatsOrder = 'input' | 'leaderId';

export function isForbiddenReturnsRankKey(rankBy: string): rankBy is ForbiddenReturnsRankKey {
  return (FORBIDDEN_RETURNS_RANK_KEYS as readonly string[]).includes(rankBy);
}

/**
 * Explicit refuse — mirrors `trade.copy` `rankLeadersByReturns`.
 * Machine code stays `agents.refused`; user copy stays unavailable (no marketing pitch).
 */
export function refuseReturnsRankedMarketingBoard(rankBy = 'returns'): never {
  throw new AgentError(
    `Returns-ranked marketing board refused (rankBy=${rankBy}) — D26-P1-A5 / SPEC-SOVEREIGN §4; audited stats only, never sort by PnL or win rate`,
    'agents.refused',
    'agents.copy_intel.unavailable',
    { reason: RETURNS_RANKED_BOARD_REFUSE_REASON, rankBy },
  );
}

/** Named mountain surface — same refuse as trade.copy ranking ban. */
export function rankLeadersByReturns(): never {
  return refuseReturnsRankedMarketingBoard('returns');
}

/** Alias — the board named `returnsRankedBoard` always refuses. */
export function returnsRankedBoard(): never {
  return rankLeadersByReturns();
}

/**
 * Present audited stats without a marketing board.
 * `rankBy` in the forbidden set → hard refuse.
 * Otherwise returns ok stats in input order or stable leaderId order.
 */
export function presentAuditedLeaderStats(
  result: IntelResult,
  options: { readonly order?: AuditedStatsOrder; readonly rankBy?: string } = {},
): IntelResult {
  if (options.rankBy !== undefined && isForbiddenReturnsRankKey(options.rankBy)) {
    return refuseReturnsRankedMarketingBoard(options.rankBy);
  }
  if (result.status !== 'ok') return result;

  const order: AuditedStatsOrder = options.order ?? 'input';
  if (order === 'input') return result;

  const stats = [...result.stats].sort((a, b) => (a.leaderId < b.leaderId ? -1 : a.leaderId > b.leaderId ? 1 : 0));
  const byId = new Map(result.audit.map((a) => [a.leaderId, a]));
  const audit = stats.map((s) => byId.get(s.leaderId)!).filter(Boolean);
  return { ...result, stats, audit };
}

/** True when stats order matches input order (not returns-ranked). */
export function auditedStatsPreserveInputOrder(stats: readonly LeaderStat[], inputLeaderIds: readonly string[]): boolean {
  const present = inputLeaderIds.filter((id) => stats.some((s) => s.leaderId === id));
  if (present.length !== stats.length) return false;
  return stats.every((s, i) => s.leaderId === present[i]);
}

/** True when a sequence is strictly descending by realised PnL (marketing rank smell). */
export function isReturnsDescending(stats: readonly LeaderStat[]): boolean {
  if (stats.length < 2) return false;
  for (let i = 1; i < stats.length; i += 1) {
    let prev: bigint;
    let cur: bigint;
    try {
      prev = parseAmount(stats[i - 1]!.realisedPnl);
      cur = parseAmount(stats[i]!.realisedPnl);
    } catch {
      return false;
    }
    if (!(prev > cur)) return false;
  }
  return true;
}

/** Ok board: audited write count only — never a ranked marketing strip. */
export function auditedWriteBoardCard(result: IntelOk): {
  readonly status: 'ok';
  readonly auditedWrites: number;
  readonly ranking: 'forbidden';
} {
  return { status: 'ok', auditedWrites: result.audit.length, ranking: 'forbidden' };
}
