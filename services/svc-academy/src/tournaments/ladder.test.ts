import { describe, expect, it } from 'vitest';
import {
  TournamentError,
  assertMayWriteScore,
  assertScore,
  assertSeasonSlug,
  countStandingsAboveScore,
  bottomNStandings,
  medianScore,
  standingCount,
  pageStandings,
  rankStandings,
  scoreOfUser,
  isInTopN,
  listStandingUserIds,
  standingNeighbors,
  standingOfUser,
  topNStandings,
  type StandingRecord,
} from './ladder.js';

const row = (userId: string, score: number, t: string): StandingRecord => ({
  seasonId: 's',
  userId,
  score,
  updatedAt: new Date(t),
});

describe('rankStandings', () => {
  it('orders by score DESC then earlier update first', () => {
    const ranked = rankStandings([
      row('a', 10, '2026-08-01T12:00:00Z'),
      row('b', 20, '2026-08-01T13:00:00Z'),
      row('c', 20, '2026-08-01T11:00:00Z'),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['c', 'b', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('validators', () => {
  it('accepts a clean slug', () => {
    expect(assertSeasonSlug('Summer-2026')).toBe('summer-2026');
  });
  it('refuses bad slug / score / frozen write', () => {
    expect(() => assertSeasonSlug('x')).toThrow(TournamentError);
    expect(() => assertScore(-1)).toThrow(TournamentError);
    expect(() => assertMayWriteScore('frozen')).toThrow(TournamentError);
    expect(() => assertMayWriteScore('live')).not.toThrow();
  });

  it('L3 pageStandings does not invent rows past total', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    const page = pageStandings(rows, { offset: 1, limit: 1 });
    expect(page.total).toBe(3);
    expect(page.standings).toHaveLength(1);
    expect(page.standings[0]!.userId).toBe('c');
    expect(pageStandings(rows, { offset: 50, limit: 10 }).standings).toEqual([]);
  });

  it('L3 standingOfUser returns null when missing — never invent', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(standingOfUser(rows, 'b')?.rank).toBe(1);
    expect(standingOfUser(rows, 'missing')).toBeNull();
    expect(standingOfUser(rows, '  ')).toBeNull();
  });

  it('L3 topNStandings clamps without invent podium', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(topNStandings(rows, 1).map((r) => r.userId)).toEqual(['b']);
    expect(topNStandings(rows, 0)).toEqual([]);
  });
});

describe('L3 standings board helpers', () => {
  it('standingNeighbors never invents missing place', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(standingNeighbors(rows, 'missing')).toBeNull();
    const n = standingNeighbors(rows, 'c');
    expect(n?.self.userId).toBe('c');
    expect(n?.above?.userId).toBe('b');
    expect(n?.below?.userId).toBe('a');
  });

  it('scoreOfUser + countStandingsAboveScore without invent', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(scoreOfUser(rows, 'b')).toBe(20);
    expect(scoreOfUser(rows, 'missing')).toBeNull();
    expect(scoreOfUser(rows, '  ')).toBeNull();
    expect(countStandingsAboveScore(rows, 15)).toBe(1);
    expect(countStandingsAboveScore([], 0)).toBe(0);
  });

  it('standingCount is length without invent', () => {
    expect(standingCount([])).toBe(0);
    expect(standingCount([row('a', 1, '2026-08-01T12:00:00Z')])).toBe(1);
  });

  it('L3 bottomNStandings empty when n<=0; never invents podium', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(bottomNStandings(rows, 0)).toEqual([]);
    const bot = bottomNStandings(rows, 1);
    expect(bot).toHaveLength(1);
    expect(bot[0]!.userId).toBe('a');
  });
});

it('L3 wave13 isInTopN + listStandingUserIds', () => {
  const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
  expect(isInTopN(rows, 'b', 1)).toBe(true);
  expect(isInTopN(rows, 'a', 1)).toBe(false);
  expect(isInTopN(rows, 'missing', 3)).toBe(false);
  expect(isInTopN(rows, 'b', 0)).toBe(false);
  expect(listStandingUserIds(rows)).toEqual(['a', 'b', 'c']);
  expect(listStandingUserIds([])).toEqual([]);
});

it('L3 medianScore null when empty; never invent 0', () => {
  expect(medianScore([])).toBeNull();
  const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 30, '2026-08-01T11:00:00Z')];
  expect(medianScore(rows)).toBe(20);
});
