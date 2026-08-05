import { describe, expect, it } from 'vitest';
import { TournamentError, type StandingRecord } from './ladder.js';
import {
  countSeasonsByStatus,
  freezeSeasonWithSnapshot,
  isScoreWritable,
  snapshotStandingsAtFreeze,
  transitionSeason,
} from './season-lifecycle.js';

const base = {
  id: 's1',
  slug: 'summer-26',
  title: 'Summer',
  rulesSummary: 'Paper scores only',
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: null,
};

const row = (userId: string, score: number, t: string): StandingRecord => ({
  seasonId: 's1',
  userId,
  score,
  updatedAt: new Date(t),
});

describe('tournament Stage-2 season lifecycle (no prizes)', () => {
  it('scheduled → live → frozen → ended', () => {
    let s = { ...base, status: 'scheduled' as const };
    s = transitionSeason(s, 'live');
    expect(s.status).toBe('live');
    expect(isScoreWritable(s.status)).toBe(true);
    s = transitionSeason(s, 'frozen');
    expect(isScoreWritable(s.status)).toBe(false);
    s = transitionSeason(s, 'ended');
    expect(s.status).toBe('ended');
  });

  it('refuses scheduled → frozen', () => {
    const s = { ...base, status: 'scheduled' as const };
    expect(() => transitionSeason(s, 'frozen')).toThrow(TournamentError);
  });

  it('ended is terminal', () => {
    const s = { ...base, status: 'ended' as const };
    expect(() => transitionSeason(s, 'live')).toThrow(TournamentError);
  });

  it('freeze snapshot ranks standings with no money fields', () => {
    const live = { ...base, status: 'live' as const };
    const rows = [
      row('a', 10, '2026-08-01T12:00:00Z'),
      row('b', 50, '2026-08-01T13:00:00Z'),
      row('other-season', 99, '2026-08-01T10:00:00Z'),
    ];
    // foreign seasonId should be ignored by filter
    rows[2] = { ...rows[2]!, seasonId: 'other' };
    const snap = snapshotStandingsAtFreeze({
      seasonId: 's1',
      status: 'live',
      rows,
      frozenAt: new Date('2026-08-05T00:00:00.000Z'),
    });
    expect(snap.standings.map((r) => r.userId)).toEqual(['b', 'a']);
    expect(snap.standings[0]).toMatchObject({ rank: 1, score: 50, userId: 'b' });
    expect(snap).not.toHaveProperty('prize');
    expect(snap).not.toHaveProperty('payout');
    expect(() => snapshotStandingsAtFreeze({ seasonId: 's1', status: 'scheduled', rows: [] })).toThrow(TournamentError);
  });

  it('freezeSeasonWithSnapshot freezes + captures rank table', () => {
    const live = { ...base, status: 'live' as const };
    const { season, snapshot } = freezeSeasonWithSnapshot(live, [row('z', 1, '2026-08-01T00:00:00Z')]);
    expect(season.status).toBe('frozen');
    expect(snapshot.standings).toHaveLength(1);
    expect(isScoreWritable(season.status)).toBe(false);
  });

  it('L3 countSeasonsByStatus histogram without invent', () => {
    expect(countSeasonsByStatus([])).toEqual({
      scheduled: 0,
      live: 0,
      frozen: 0,
      ended: 0,
      total: 0,
      scoreWritable: 0,
    });
    const h = countSeasonsByStatus([
      { ...base, id: 'a', status: 'scheduled' },
      { ...base, id: 'b', status: 'live' },
      { ...base, id: 'c', status: 'live' },
      { ...base, id: 'd', status: 'frozen' },
      { ...base, id: 'e', status: 'ended' },
    ]);
    expect(h).toEqual({ scheduled: 1, live: 2, frozen: 1, ended: 1, total: 5, scoreWritable: 2 });
  });
});
