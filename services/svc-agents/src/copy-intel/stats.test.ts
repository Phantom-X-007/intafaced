import { describe, expect, it } from 'vitest';
import { buildLeaderStats, type LeaderPerformanceFixture } from './stats.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

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

describe('copy-intel buildLeaderStats (Stage-1 fixtures)', () => {
  it('returns empty when no fixtures — no invented leaders', () => {
    expect(buildLeaderStats([], { now: NOW })).toEqual({
      status: 'empty',
      userMessageKey: 'agents.copy_intel.empty',
    });
  });

  it('builds stats + audit provenance from complete fixtures', () => {
    const r = buildLeaderStats([row({ leaderId: 'L1' }), row({ leaderId: 'L2', winningTrades: 10, realisedPnl: '-3' })], {
      now: NOW,
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.stats).toHaveLength(2);
    expect(r.stats[0]!.winRate).toBe('0.6000');
    expect(r.audit[0]!.provenance.fixture).toBe(true);
    expect(r.audit[0]!.source).toBe('trade.copy.fixture');
  });

  it('refuses invent path when all rows incomplete', () => {
    const r = buildLeaderStats([row({ leaderId: 'L1', realisedPnl: null, closedTrades: null, winningTrades: null })], {
      now: NOW,
    });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.copy_intel.unavailable',
      reason: 'no_data',
    });
  });

  it('refuses invalid windows', () => {
    const r = buildLeaderStats([row({ leaderId: 'L1', windowStart: '2026-08-05T00:00:00.000Z', windowEnd: '2026-08-01T00:00:00.000Z' })], {
      now: NOW,
    });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.copy_intel.unavailable',
      reason: 'invalid_window',
    });
  });

  it('does not invent win rate when winning > closed', () => {
    const r = buildLeaderStats([row({ leaderId: 'L1', closedTrades: 5, winningTrades: 9 })], { now: NOW });
    expect(r.status).toBe('unavailable');
  });

  it('Stage-2: copy plane dark → refuse invent PnL', () => {
    const r = buildLeaderStats([row({ leaderId: 'L1' })], { now: NOW, copyPlane: 'dark' });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.copy_intel.unavailable',
      reason: 'copy_plane_dark',
    });
  });
});
