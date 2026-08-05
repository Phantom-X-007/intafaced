import { describe, expect, it } from 'vitest';
import { TournamentError, assertMayWriteScore, assertScore, assertSeasonSlug, rankStandings, type StandingRecord } from './ladder.js';

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
});
