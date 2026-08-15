/**
 * Pin: Copy-Intel live leader plane stays refused until a sealed allowlist
 * exists. A fake PnL leaderboard cannot ship. Tracker stays not-done (Class X).
 */

import { describe, expect, it } from 'vitest';
import { AgentError } from '../errors.js';
import { presentLeaderDirectory } from './directory.js';
import {
  isLiveLeaderPlaneAllowlisted,
  LIVE_TRADE_COPY_LEADER_IDS,
  LIVE_TRADE_COPY_LEADER_PLANE_OPEN,
  presentLiveLeaderBoard,
  refuseLiveLeaderBoard,
  refuseLiveLeaderPlane,
  sealedLiveLeaderAllowlist,
} from './live-leader-plane-refuse.js';
import { buildLeaderStats, type LeaderPerformanceFixture } from './stats.js';
import type { LeaderStat } from './stats.js';

const NOW = new Date('2026-08-15T08:00:00.000Z');

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

const high: LeaderStat = {
  leaderId: 'ghost-high',
  realisedPnl: '9999.00',
  closedTrades: 80,
  winRate: '0.9900',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

const low: LeaderStat = {
  leaderId: 'ghost-low',
  realisedPnl: '-1.00',
  closedTrades: 3,
  winRate: '0.1000',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

describe('copy-intel live leader plane pin (Class X / no invent)', () => {
  it('sealed live plane is closed and the allowlist is empty', () => {
    expect(LIVE_TRADE_COPY_LEADER_PLANE_OPEN).toBe(false);
    expect(LIVE_TRADE_COPY_LEADER_IDS).toEqual([]);
    expect(sealedLiveLeaderAllowlist().size).toBe(0);
  });

  it('caller-invented leader ids do not open the live plane', () => {
    expect(isLiveLeaderPlaneAllowlisted(['ghost-high', 'ghost-low'])).toBe(false);
    expect(isLiveLeaderPlaneAllowlisted(new Set(['L1']))).toBe(false);
    expect(isLiveLeaderPlaneAllowlisted([])).toBe(false);
    expect(isLiveLeaderPlaneAllowlisted(undefined)).toBe(false);
  });

  it('refuseLiveLeaderPlane is no_live_leaders — never an ok board', () => {
    expect(refuseLiveLeaderPlane()).toEqual({
      status: 'refuse',
      reason: 'no_live_leaders',
      userMessageKey: 'agents.copy_intel.unavailable',
    });
  });

  it('refuseLiveLeaderBoard throws agents.refused (no PnL rank ship)', () => {
    try {
      refuseLiveLeaderBoard('realisedPnl');
      expect.unreachable('live board');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).code).toBe('agents.refused');
      expect((err as AgentError).userMessageKey).toBe('agents.copy_intel.unavailable');
      expect((err as AgentError).userMessageParams.reason).toBe('no_live_leaders');
      expect((err as AgentError).userMessageParams.rankBy).toBe('realisedPnl');
    }
  });

  it('PnL-desc fake leaders cannot present as a live board', () => {
    const ranked = [high, low];
    expect(() => presentLiveLeaderBoard(ranked, { rankBy: 'realisedPnl' })).toThrow(AgentError);
    expect(presentLiveLeaderBoard(ranked, { leaderAllowlist: ['ghost-high'] })).toEqual({
      status: 'refuse',
      reason: 'marketing_board',
      userMessageKey: 'agents.copy_intel.unavailable',
    });
  });

  it('presentDirectory stays a directory — not a live ranked plane', () => {
    const result = presentLeaderDirectory({ stats: [high, low] });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.presentation.kind).toBe('directory');
    expect(result.presentation.rankedByReturns).toBe(false);
    expect(result.presentation.sortKey).toBe('leaderId');
    expect(result.presentation.leaders.map((l) => l.leaderId)).toEqual(['ghost-high', 'ghost-low']);
  });

  it('explicit copyPlane live without sealed allowlist refuses invent (fixture-omit still audited)', () => {
    const live = buildLeaderStats([row({ leaderId: 'L1' })], { now: NOW, copyPlane: 'live', leaderAllowlist: ['L1'] });
    expect(live).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.copy_intel.unavailable',
      reason: 'copy_plane_dark',
    });

    const audited = buildLeaderStats([row({ leaderId: 'L1' })], { now: NOW });
    expect(audited.status).toBe('ok');
    if (audited.status !== 'ok') return;
    expect(audited.audit[0]?.provenance.fixture).toBe(true);
  });
});
