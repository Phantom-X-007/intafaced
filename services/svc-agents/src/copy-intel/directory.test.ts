import { describe, expect, it } from 'vitest';
import {
  directoryBoardCard,
  isMarketingBoardModeName,
  isReturnsRankSortKey,
  presentLeaderDirectory,
  RETURNS_RANK_SORT_KEYS,
  MARKETING_BOARD_MODES,
  sortDirectoryByLeaderId,
} from './directory.js';
import type { LeaderStat } from './stats.js';

const a: LeaderStat = {
  leaderId: 'zulu-leader',
  realisedPnl: '999.00',
  closedTrades: 50,
  winRate: '0.9000',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

const b: LeaderStat = {
  leaderId: 'alpha-leader',
  realisedPnl: '-10.00',
  closedTrades: 5,
  winRate: '0.2000',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

const c: LeaderStat = {
  leaderId: 'mike-leader',
  realisedPnl: '50.00',
  closedTrades: 20,
  winRate: '0.5500',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

describe('copy-intel directory (D26-P1-A5 — no returns-ranked board)', () => {
  it('orders by leaderId, never by PnL even when fixtures arrive PnL-desc', () => {
    // Caller handed a returns-ranked list — product must not echo it.
    const rankedByPnl = [a, c, b];
    const result = presentLeaderDirectory({ stats: rankedByPnl });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.presentation.kind).toBe('directory');
    expect(result.presentation.rankedByReturns).toBe(false);
    expect(result.presentation.sortKey).toBe('leaderId');
    expect(result.presentation.leaders.map((l) => l.leaderId)).toEqual(['alpha-leader', 'mike-leader', 'zulu-leader']);
    // Highest PnL is last after directory order — not first.
    expect(result.presentation.leaders[0]?.realisedPnl).toBe('-10.00');
    expect(result.presentation.leaders[2]?.realisedPnl).toBe('999.00');
  });

  it('refuses every returns-rank sort key', () => {
    for (const sortBy of RETURNS_RANK_SORT_KEYS) {
      const result = presentLeaderDirectory({ stats: [a, b], sortBy });
      expect(result, sortBy).toEqual({
        status: 'refuse',
        reason: 'returns_ranked_board',
        userMessageKey: 'agents.copy_intel.unavailable',
      });
      expect(isReturnsRankSortKey(sortBy)).toBe(true);
    }
  });

  it('refuses marketing / top-trader board modes', () => {
    for (const mode of MARKETING_BOARD_MODES) {
      const result = presentLeaderDirectory({ stats: [a, b], mode });
      expect(result, mode).toMatchObject({
        status: 'refuse',
        reason: 'marketing_board',
        userMessageKey: 'agents.copy_intel.unavailable',
      });
      expect(isMarketingBoardModeName(mode)).toBe(true);
    }
  });

  it('refuses unknown mode and unknown sort as ranking invent', () => {
    expect(presentLeaderDirectory({ stats: [a], mode: 'hot_list' }).status).toBe('refuse');
    expect(presentLeaderDirectory({ stats: [a], sortBy: 'followers' }).status).toBe('refuse');
  });

  it('allows directory mode with leaderId sort and optional filter', () => {
    const result = presentLeaderDirectory({
      stats: [a, b, c],
      mode: 'directory',
      sortBy: 'leaderId',
      leaderFilter: ['zulu-leader', 'alpha-leader'],
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.skippedFiltered).toBe(1);
    expect(result.presentation.leaders.map((l) => l.leaderId)).toEqual(['alpha-leader', 'zulu-leader']);
  });

  it('empty stats → empty (never invent a board)', () => {
    expect(presentLeaderDirectory({ stats: [] })).toEqual({
      status: 'empty',
      userMessageKey: 'agents.copy_intel.empty',
    });
  });

  it('filter that drops everyone → empty', () => {
    expect(presentLeaderDirectory({ stats: [a], leaderFilter: ['nobody'] })).toEqual({
      status: 'empty',
      userMessageKey: 'agents.copy_intel.empty',
    });
  });

  it('sortDirectoryByLeaderId is stable and non-performance', () => {
    expect(sortDirectoryByLeaderId([a, b, c]).map((l) => l.leaderId)).toEqual(['alpha-leader', 'mike-leader', 'zulu-leader']);
  });

  it('board card never reports rankedByReturns true', () => {
    const ok = presentLeaderDirectory({ stats: [a, b] });
    expect(directoryBoardCard(ok).rankedByReturns).toBe(false);
    const refused = presentLeaderDirectory({ stats: [a], sortBy: 'pnl' });
    expect(directoryBoardCard(refused)).toEqual({
      status: 'refuse',
      leaders: 0,
      rankedByReturns: false,
      reason: 'returns_ranked_board',
    });
  });
});
