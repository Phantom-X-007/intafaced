import { describe, expect, it } from 'vitest';
import { TournamentError, type StandingRecord } from './ladder.js';
import {
  allowedNextStatuses,
  countSeasonsByStatus,
  filterSeasonsByStatus,
  isSeasonTerminal,
  listEndedSeasons,
  listFrozenSeasonIds,
  frozenSeasonCount,
  listFrozenSeasons,
  listLiveSeasonIds,
  listLiveSeasons,
  liveSeasonCount,
  listScheduledSeasonIds,
  listScheduledSeasons,
  listSeasonIds,
  freezeSeasonWithSnapshot,
  isScoreWritable,
  listScoreWritableSeasons,
  snapshotStandingsAtFreeze,
  transitionSeason,
  listEndedSeasonIds,
  endedSeasonCount,
  hasLiveSeason,
  scheduledSeasonCount,
  hasFrozenSeason,
  hasEndedSeason,
  hasScheduledSeason,
  totalSeasonCount,
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

  it('L3 listScoreWritableSeasons is live-only', () => {
    const list = listScoreWritableSeasons([
      { ...base, id: 'a', status: 'scheduled' },
      { ...base, id: 'b', status: 'live' },
      { ...base, id: 'c', status: 'frozen' },
    ]);
    expect(list.map((s) => s.id)).toEqual(['b']);
    expect(listScoreWritableSeasons([])).toEqual([]);
  });

  it('L3 allowedNextStatuses ends empty; live may freeze', () => {
    expect(allowedNextStatuses('ended')).toEqual([]);
    expect(allowedNextStatuses('live')).toContain('frozen');
    expect(allowedNextStatuses('scheduled')).toContain('live');
  });

  it('L3 filterSeasonsByStatus does not invent rows', () => {
    const seasons = [
      { ...base, id: 'a', status: 'scheduled' as const },
      { ...base, id: 'b', status: 'live' as const },
    ];
    expect(filterSeasonsByStatus(seasons, 'live').map((s) => s.id)).toEqual(['b']);
    expect(filterSeasonsByStatus(seasons, 'ended')).toEqual([]);
    expect(filterSeasonsByStatus([], 'live')).toEqual([]);
  });

  it('L3 isSeasonTerminal + listSeasonIds without invent', () => {
    expect(isSeasonTerminal('ended')).toBe(true);
    expect(isSeasonTerminal('live')).toBe(false);
    expect(listSeasonIds([])).toEqual([]);
    expect(
      listSeasonIds([
        { ...base, id: 'b', status: 'live' },
        { ...base, id: 'a', status: 'scheduled' },
      ]),
    ).toEqual(['a', 'b']);
  });

  it('L3 listScheduledSeasons + listEndedSeasons without invent', () => {
    const seasons = [
      { ...base, id: 'a', status: 'scheduled' as const },
      { ...base, id: 'b', status: 'live' as const },
      { ...base, id: 'c', status: 'ended' as const },
    ];
    expect(listScheduledSeasons(seasons).map((s) => s.id)).toEqual(['a']);
    expect(listEndedSeasons(seasons).map((s) => s.id)).toEqual(['c']);
    expect(listScheduledSeasons([])).toEqual([]);
  });

  it('L3 listFrozenSeasons + listLiveSeasonIds without invent', () => {
    const seasons = [
      { ...base, id: 'a', status: 'live' as const },
      { ...base, id: 'b', status: 'frozen' as const },
      { ...base, id: 'c', status: 'ended' as const },
    ];
    expect(listFrozenSeasons(seasons).map((s) => s.id)).toEqual(['b']);
    expect(listLiveSeasonIds(seasons)).toEqual(['a']);
    expect(listFrozenSeasons([])).toEqual([]);
  });

  it('L3 listLiveSeasons without invent', () => {
    const seasons = [
      { ...base, id: 'a', status: 'live' as const },
      { ...base, id: 'b', status: 'scheduled' as const },
    ];
    expect(listLiveSeasons(seasons).map((s) => s.id)).toEqual(['a']);
    expect(listLiveSeasons([])).toEqual([]);
  });
  it('L3 listScheduledSeasonIds without invent', () => {
    const seasons = [
      { ...base, id: 'a', status: 'scheduled' as const },
      { ...base, id: 'b', status: 'live' as const },
    ];
    expect(listScheduledSeasonIds(seasons)).toEqual(['a']);
    expect(listScheduledSeasonIds([])).toEqual([]);
  });

  it('L3 wave16 listEndedSeasonIds without invent', () => {
    const seasons = [
      { ...base, id: 'a', status: 'live' as const },
      { ...base, id: 'b', status: 'ended' as const },
      { ...base, id: 'c', status: 'ended' as const },
    ];
    expect(listEndedSeasonIds(seasons)).toEqual(['b', 'c']);
    expect(listEndedSeasonIds([])).toEqual([]);
  });

  it('L3 listFrozenSeasonIds without invent', () => {
    const seasons = [
      { ...base, id: 'a', status: 'frozen' as const },
      { ...base, id: 'b', status: 'live' as const },
    ];
    expect(listFrozenSeasonIds(seasons)).toEqual(['a']);
    expect(listFrozenSeasonIds([])).toEqual([]);
  });

  it('L3 liveSeasonCount without invent', () => {
    expect(liveSeasonCount([])).toBe(0);
    const seasons = [
      { ...base, id: 'a', status: 'live' as const },
      { ...base, id: 'b', status: 'live' as const },
      { ...base, id: 'c', status: 'ended' as const },
    ];
    expect(liveSeasonCount(seasons)).toBe(2);
  });

  it('L3 frozenSeasonCount without invent', () => {
    expect(frozenSeasonCount([])).toBe(0);
    const seasons = [
      { ...base, id: 'a', status: 'frozen' as const },
      { ...base, id: 'b', status: 'live' as const },
    ];
    expect(frozenSeasonCount(seasons)).toBe(1);
  });

  it('L3 wave21 endedSeasonCount + hasLiveSeason', () => {
    const seasons = [
      { ...base, id: 'a', status: 'live' as const },
      { ...base, id: 'b', status: 'ended' as const },
      { ...base, id: 'c', status: 'ended' as const },
    ];
    expect(endedSeasonCount(seasons)).toBe(2);
    expect(hasLiveSeason(seasons)).toBe(true);
    expect(hasLiveSeason([])).toBe(false);
    expect(endedSeasonCount([])).toBe(0);
  });

  it('L3 scheduledSeasonCount without invent', () => {
    expect(scheduledSeasonCount([])).toBe(0);
    const seasons = [
      { ...base, id: 'a', status: 'scheduled' as const },
      { ...base, id: 'b', status: 'live' as const },
    ];
    expect(scheduledSeasonCount(seasons)).toBe(1);
  });
});

describe('L3 wave25 season presence helpers', () => {
  const mk = (id: string, status: 'scheduled' | 'live' | 'frozen' | 'ended'): import('./ladder.js').SeasonRecord => ({
    id,
    slug: id,
    title: id,
    status,
    rulesSummary: 'stage-1 non-money',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: null,
  });

  it('hasFrozen/Ended/Scheduled + totalSeasonCount', () => {
    expect(hasFrozenSeason([])).toBe(false);
    expect(hasEndedSeason([])).toBe(false);
    expect(hasScheduledSeason([])).toBe(false);
    expect(totalSeasonCount([])).toBe(0);
    const rows = [mk('s1', 'scheduled'), mk('s2', 'frozen'), mk('s3', 'ended')];
    expect(hasFrozenSeason(rows)).toBe(true);
    expect(hasEndedSeason(rows)).toBe(true);
    expect(hasScheduledSeason(rows)).toBe(true);
    expect(totalSeasonCount(rows)).toBe(3);
  });
});
