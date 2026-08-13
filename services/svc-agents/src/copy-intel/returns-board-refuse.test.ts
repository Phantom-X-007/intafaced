/**
 * D26-P1-A5 — audited write path + explicit refuse of returns-ranked boards.
 */

import { describe, expect, it } from 'vitest';
import { AgentError } from '../errors.js';
import { buildLeaderStats, type LeaderPerformanceFixture } from './stats.js';
import {
  auditedStatsPreserveInputOrder,
  auditedWriteBoardCard,
  FORBIDDEN_RETURNS_RANK_KEYS,
  isForbiddenReturnsRankKey,
  isReturnsDescending,
  presentAuditedLeaderStats,
  rankLeadersByReturns,
  refuseReturnsRankedMarketingBoard,
} from './returns-board-refuse.js';

const NOW = new Date('2026-08-12T08:00:00.000Z');

function row(partial: Partial<LeaderPerformanceFixture> & Pick<LeaderPerformanceFixture, 'leaderId'>): LeaderPerformanceFixture {
  return {
    realisedPnl: '12.5',
    closedTrades: 10,
    winningTrades: 6,
    windowStart: '2026-08-01T00:00:00.000Z',
    windowEnd: '2026-08-05T00:00:00.000Z',
    source: 'trade.copy.fixture',
    ...partial,
  };
}

describe('D26-P1-A5 returns-ranked marketing board refuse', () => {
  it('rankLeadersByReturns throws agents.refused (trade.copy mirror)', () => {
    try {
      rankLeadersByReturns();
      expect.unreachable('rank');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe('agents.refused');
      expect((err as AgentError).userMessageKey).toBe('agents.copy_intel.unavailable');
      expect((err as AgentError).userMessageParams.reason).toBe('returns_ranked_board_forbidden');
    }
  });

  it('refuseReturnsRankedMarketingBoard names the forbidden rankBy', () => {
    try {
      refuseReturnsRankedMarketingBoard('winRate');
      expect.unreachable('refuse');
    } catch (err) {
      expect((err as AgentError).userMessageParams.rankBy).toBe('winRate');
    }
  });

  it('every forbidden rank key is detected', () => {
    for (const key of FORBIDDEN_RETURNS_RANK_KEYS) {
      expect(isForbiddenReturnsRankKey(key)).toBe(true);
    }
    expect(isForbiddenReturnsRankKey('leaderId')).toBe(false);
    expect(isForbiddenReturnsRankKey('input')).toBe(false);
  });

  it('presentAuditedLeaderStats refuses realisedPnl / winRate / returns ranking', () => {
    const built = buildLeaderStats([row({ leaderId: 'low', realisedPnl: '1' }), row({ leaderId: 'high', realisedPnl: '99' })], {
      now: NOW,
    });
    expect(built.status).toBe('ok');
    for (const rankBy of ['realisedPnl', 'winRate', 'returns', 'pnl', 'roi'] as const) {
      expect(() => presentAuditedLeaderStats(built, { rankBy })).toThrow(AgentError);
    }
  });

  it('buildLeaderStats preserves fixture order — high PnL last stays last', () => {
    const built = buildLeaderStats(
      [
        row({ leaderId: 'low', realisedPnl: '1.0' }),
        row({ leaderId: 'mid', realisedPnl: '50.0' }),
        row({ leaderId: 'high', realisedPnl: '999.0' }),
      ],
      { now: NOW },
    );
    expect(built.status).toBe('ok');
    if (built.status !== 'ok') return;
    expect(built.stats.map((s) => s.leaderId)).toEqual(['low', 'mid', 'high']);
    expect(auditedStatsPreserveInputOrder(built.stats, ['low', 'mid', 'high'])).toBe(true);
    // Ascending PnL in input order is the opposite of a marketing board.
    expect(isReturnsDescending(built.stats)).toBe(false);
  });

  it('presentAuditedLeaderStats may sort by leaderId only — never by returns', () => {
    const built = buildLeaderStats([row({ leaderId: 'Z', realisedPnl: '1' }), row({ leaderId: 'A', realisedPnl: '900' })], { now: NOW });
    expect(built.status).toBe('ok');
    const presented = presentAuditedLeaderStats(built, { order: 'leaderId' });
    expect(presented.status).toBe('ok');
    if (presented.status !== 'ok') return;
    expect(presented.stats.map((s) => s.leaderId)).toEqual(['A', 'Z']);
    // A has higher PnL and comes first only because of leaderId — still not a returns board.
    expect(presented.stats[0]!.realisedPnl).toBe('900');
  });

  it('auditedWriteBoardCard reports ranking forbidden', () => {
    const built = buildLeaderStats([row({ leaderId: 'L1' })], { now: NOW });
    expect(built.status).toBe('ok');
    if (built.status !== 'ok') return;
    expect(auditedWriteBoardCard(built)).toEqual({
      status: 'ok',
      auditedWrites: 1,
      ranking: 'forbidden',
    });
  });
});
