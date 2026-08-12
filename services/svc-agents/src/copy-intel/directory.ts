/**
 * Copy-Intel directory presentation — audited stats without returns ranking.
 *
 * Done bar (D26-P1-A5 / SPEC-SOVEREIGN §4):
 *   · Followers may search / filter / view verified history.
 *   · We do NOT sort the world by who made the most money.
 *   · No "top trader" / marketing leaderboard surfacing.
 *
 * Order is always stable by `leaderId` (lexicographic). Performance fields stay
 * on each row for history display — they are never a sort key here.
 */

import type { LeaderStat } from './stats.js';

/** Allowed presentation modes. Anything else is a marketing/rank invent path. */
export type DirectoryMode = 'directory';

/** Sort keys that would create a returns-ranked board — always refused. */
export const RETURNS_RANK_SORT_KEYS = [
  'returns',
  'return',
  'pnl',
  'realisedPnl',
  'realizedPnl',
  'winRate',
  'win_rate',
  'performance',
  'rank',
  'profit',
  'roi',
] as const;

export type ReturnsRankSortKey = (typeof RETURNS_RANK_SORT_KEYS)[number];

/** Marketing / recommendation board shapes — always refused. */
export const MARKETING_BOARD_MODES = [
  'marketing_board',
  'leaderboard',
  'top_traders',
  'top_trader',
  'recommended',
  'recommended_for_you',
  'ranked',
] as const;

export type MarketingBoardMode = (typeof MARKETING_BOARD_MODES)[number];

export type DirectoryPresentation = {
  readonly kind: 'directory';
  readonly rankedByReturns: false;
  readonly sortKey: 'leaderId';
  readonly leaders: readonly LeaderStat[];
};

export type DirectoryOk = {
  readonly status: 'ok';
  readonly presentation: DirectoryPresentation;
  readonly skippedFiltered: number;
};

export type DirectoryEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.copy_intel.empty';
};

export type DirectoryRefuse = {
  readonly status: 'refuse';
  readonly reason: 'returns_ranked_board' | 'marketing_board';
  readonly userMessageKey: 'agents.copy_intel.unavailable';
};

export type DirectoryResult = DirectoryOk | DirectoryEmpty | DirectoryRefuse;

export type PresentDirectoryInput = {
  readonly stats: readonly LeaderStat[];
  /**
   * Presentation mode. Only `directory` is buildable. Omit → directory.
   * Marketing / top-trader strings refuse (never invent a ranked board).
   */
  readonly mode?: string;
  /**
   * Sort key. Only `leaderId` (or omit) is allowed. Returns / PnL / winRate
   * refuse — that is the §4 load-bearing ban.
   */
  readonly sortBy?: string;
  /** Optional leader-id filter (search). Empty/missing → all stats. */
  readonly leaderFilter?: ReadonlySet<string> | readonly string[];
};

function isReturnsRankSort(sortBy: string | undefined): sortBy is ReturnsRankSortKey {
  if (sortBy === undefined || sortBy === '') return false;
  return (RETURNS_RANK_SORT_KEYS as readonly string[]).includes(sortBy);
}

function isMarketingBoardMode(mode: string | undefined): mode is MarketingBoardMode {
  if (mode === undefined || mode === '') return false;
  return (MARKETING_BOARD_MODES as readonly string[]).includes(mode);
}

function filterByLeaderId(
  stats: readonly LeaderStat[],
  filter: ReadonlySet<string> | readonly string[] | undefined,
): { readonly kept: readonly LeaderStat[]; readonly skippedFiltered: number } {
  if (!filter) return { kept: stats, skippedFiltered: 0 };
  const set = filter instanceof Set ? filter : new Set(filter);
  if (set.size === 0) return { kept: stats, skippedFiltered: 0 };
  const kept: LeaderStat[] = [];
  let skippedFiltered = 0;
  for (const row of stats) {
    if (set.has(row.leaderId)) kept.push(row);
    else skippedFiltered += 1;
  }
  return { kept, skippedFiltered };
}

/**
 * Stable non-performance order. Never by PnL / winRate / returns.
 */
export function sortDirectoryByLeaderId(stats: readonly LeaderStat[]): readonly LeaderStat[] {
  return [...stats].sort((a, b) => (a.leaderId < b.leaderId ? -1 : a.leaderId > b.leaderId ? 1 : 0));
}

/**
 * Present audited leader stats as a searchable directory.
 * Refuses returns-ranked and marketing-board shapes outright.
 */
export function presentLeaderDirectory(input: PresentDirectoryInput): DirectoryResult {
  const mode = input.mode === undefined || input.mode === '' ? 'directory' : input.mode;
  if (mode !== 'directory') {
    // Only `directory` is law. Marketing / top-trader / unknown = refuse invent.
    return {
      status: 'refuse',
      reason: isMarketingBoardMode(mode) ? 'marketing_board' : 'returns_ranked_board',
      userMessageKey: 'agents.copy_intel.unavailable',
    };
  }

  if (isReturnsRankSort(input.sortBy)) {
    return {
      status: 'refuse',
      reason: 'returns_ranked_board',
      userMessageKey: 'agents.copy_intel.unavailable',
    };
  }
  if (input.sortBy !== undefined && input.sortBy !== '' && input.sortBy !== 'leaderId') {
    // Any non-leaderId sort is a ranking invent path.
    return {
      status: 'refuse',
      reason: 'returns_ranked_board',
      userMessageKey: 'agents.copy_intel.unavailable',
    };
  }

  if (input.stats.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.copy_intel.empty' };
  }

  const { kept, skippedFiltered } = filterByLeaderId(input.stats, input.leaderFilter);
  if (kept.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.copy_intel.empty' };
  }

  const leaders = sortDirectoryByLeaderId(kept);
  return {
    status: 'ok',
    skippedFiltered,
    presentation: {
      kind: 'directory',
      rankedByReturns: false,
      sortKey: 'leaderId',
      leaders,
    },
  };
}

/** True when a sort key is on the returns-rank denylist. */
export function isReturnsRankSortKey(sortBy: string): boolean {
  return isReturnsRankSort(sortBy);
}

/** True when a mode is a marketing / top-trader board. */
export function isMarketingBoardModeName(mode: string): boolean {
  return isMarketingBoardMode(mode);
}

/** Board card for ops honesty. */
export function directoryBoardCard(result: DirectoryResult): {
  readonly status: DirectoryResult['status'];
  readonly leaders: number;
  readonly rankedByReturns: false;
  readonly reason: string | null;
} {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      leaders: result.presentation.leaders.length,
      rankedByReturns: false,
      reason: null,
    };
  }
  if (result.status === 'empty') {
    return { status: 'empty', leaders: 0, rankedByReturns: false, reason: null };
  }
  return { status: 'refuse', leaders: 0, rankedByReturns: false, reason: result.reason };
}
