import { describe, expect, it } from 'vitest';
import {
  TournamentError,
  assertMayWriteScore,
  assertScore,
  assertSeasonSlug,
  countStandingsAboveScore,
  bottomNStandings,
  maxScore,
  medianScore,
  minScore,
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
  averageScore,
  hasStanding,
  scoreSpread,
  scoreRange,
  scoreSpread,
  hasStanding,
  scoreRange,
  rankOfUser,
  isTopScorer,
  secondPlaceUser,
  lastPlaceUser,
  thirdPlaceUser,
  firstPlaceUser,
  thirdPlaceUser,
  lastPlaceUser,
  firstPlaceUser,
  scoreAtRank,
  userAtRank,
  podiumUserIds,
  isEmptyStandings,
  hasAnyStanding,
  bottomUser,
  scoresInRankOrder,
  hasPodiumDepth,
  rankedCount,
  averageTopNScore,
  isTiedForFirst,
  countAboveScore,
  hasUniqueLeader,
  firstSecondScoreGap,
  tiedForLeadUserIds,
  allScoresEqual,
  minRankForTopK,
  secondThirdScoreGap,
  userIdsBelowScore,
  userIdsAtOrAboveScore,
  hasClearLeader,
  lastTwoScoreGap,
  hasAtLeastStandings,
  midRankUser,
  totalScoreSum,
  standingCountLabel,
  maxScoreLabel,
  minScoreLabel,
  rankedUserIdsJoined,
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

  it('L3 maxScore/minScore null when empty', () => {
    expect(maxScore([])).toBeNull();
    expect(minScore([])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 30, '2026-08-01T13:00:00Z'), row('c', 20, '2026-08-01T11:00:00Z')];
    expect(maxScore(rows)).toBe(30);
    expect(minScore(rows)).toBe(10);
  });
  it('L3 averageScore null when empty', () => {
    expect(averageScore([])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(averageScore(rows)).toBe(15);
  });

  it('L3 wave16 scoreSpread + hasStanding', () => {
    expect(scoreSpread([])).toBeNull();
    expect(scoreSpread([row('a', 10, '2026-08-01T12:00:00Z')])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(scoreSpread(rows)).toBe(10);
    expect(hasStanding(rows, 'a')).toBe(true);
    expect(hasStanding(rows, 'missing')).toBe(false);
    expect(hasStanding(rows, '  ')).toBe(false);
  });

  it('L3 scoreRange matches scoreSpread', () => {
    expect(scoreRange([])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 30, '2026-08-01T13:00:00Z')];
    expect(scoreRange(rows)).toBe(20);
  });

  it('L3 rankOfUser null when missing', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(rankOfUser(rows, 'missing')).toBeNull();
    expect(rankOfUser(rows, 'b')).toBe(1);
  });

  it('L3 isTopScorer false when missing', () => {
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(isTopScorer(rows, 'missing')).toBe(false);
    expect(isTopScorer(rows, 'b')).toBe(true);
    expect(isTopScorer(rows, 'a')).toBe(false);
  });

  it('L3 secondPlaceUser null without podium', () => {
    expect(secondPlaceUser([])).toBeNull();
    expect(secondPlaceUser([row('a', 10, '2026-08-01T12:00:00Z')])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(secondPlaceUser(rows)).toBe('a');
  });

  it('L3 wave21 thirdPlaceUser + lastPlaceUser', () => {
    expect(thirdPlaceUser([])).toBeNull();
    expect(lastPlaceUser([])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(thirdPlaceUser(rows)).toBe('a');
    expect(lastPlaceUser(rows)).toBe('a');
    expect(thirdPlaceUser([row('b', 20, '2026-08-01T13:00:00Z')])).toBeNull();
  });

  it('L3 firstPlaceUser null when empty', () => {
    expect(firstPlaceUser([])).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(firstPlaceUser(rows)).toBe('b');
  });

  it('L3 scoreAtRank null when missing rank', () => {
    expect(scoreAtRank([], 1)).toBeNull();
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(scoreAtRank(rows, 1)).toBe(20);
    expect(scoreAtRank(rows, 2)).toBe(10);
    expect(scoreAtRank(rows, 3)).toBeNull();
  });

  it('L3 wave25 userAtRank + podium + empty guards', () => {
    expect(userAtRank([], 1)).toBeNull();
    expect(podiumUserIds([])).toEqual([]);
    expect(isEmptyStandings([])).toBe(true);
    expect(hasAnyStanding([])).toBe(false);
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(userAtRank(rows, 1)).toBe('b');
    expect(userAtRank(rows, 2)).toBe('c');
    expect(userAtRank(rows, 0)).toBeNull();
    expect(podiumUserIds(rows)).toEqual(['b', 'c', 'a']);
    expect(isEmptyStandings(rows)).toBe(false);
    expect(hasAnyStanding(rows)).toBe(true);
  });

  it('L3 wave26 bottomUser + scores order + podium depth + rankedCount', () => {
    expect(bottomUser([])).toBeNull();
    expect(scoresInRankOrder([])).toEqual([]);
    expect(hasPodiumDepth([], 1)).toBe(false);
    expect(rankedCount([])).toBe(0);
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 15, '2026-08-01T11:00:00Z')];
    expect(bottomUser(rows)).toBe('a');
    expect(scoresInRankOrder(rows)).toEqual([20, 15, 10]);
    expect(hasPodiumDepth(rows, 3)).toBe(true);
    expect(hasPodiumDepth(rows, 4)).toBe(false);
    expect(rankedCount(rows)).toBe(3);
  });

  it('L3 wave27 averageTopN + tied first + unique leader', () => {
    expect(averageTopNScore([], 3)).toBeNull();
    expect(isTiedForFirst([], 'a')).toBe(false);
    expect(hasUniqueLeader([])).toBe(false);
    const rows = [row('a', 20, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 10, '2026-08-01T11:00:00Z')];
    expect(averageTopNScore(rows, 2)).toBe(20);
    expect(isTiedForFirst(rows, 'a')).toBe(true);
    expect(hasUniqueLeader(rows)).toBe(false);
    expect(countAboveScore(rows, 10)).toBe(2);
    const uniq = [row('a', 30, '2026-08-01T12:00:00Z'), row('b', 10, '2026-08-01T13:00:00Z')];
    expect(hasUniqueLeader(uniq)).toBe(true);
  });

  it('L3 wave28 score gap + ties + equal + minRank', () => {
    expect(firstSecondScoreGap([])).toBeNull();
    expect(tiedForLeadUserIds([])).toEqual([]);
    expect(allScoresEqual([])).toBe(false);
    expect(minRankForTopK([], 1)).toBeNull();
    const rows = [row('a', 20, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 5, '2026-08-01T11:00:00Z')];
    expect(firstSecondScoreGap(rows)).toBe(0);
    expect(tiedForLeadUserIds(rows)).toEqual(['a', 'b']);
    expect(allScoresEqual(rows)).toBe(false);
    expect(minRankForTopK(rows, 2)).toBe(2);
    const equal = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 10, '2026-08-01T13:00:00Z')];
    expect(allScoresEqual(equal)).toBe(true);
  });

  it('L3 wave29 second-third gap + score filters + clear leader', () => {
    expect(secondThirdScoreGap([])).toBeNull();
    expect(userIdsBelowScore([], 10)).toEqual([]);
    expect(hasClearLeader([])).toBe(false);
    const rows = [row('a', 30, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z'), row('c', 10, '2026-08-01T11:00:00Z')];
    expect(secondThirdScoreGap(rows)).toBe(10);
    expect(userIdsBelowScore(rows, 25)).toEqual(['b', 'c']);
    expect(userIdsAtOrAboveScore(rows, 20)).toEqual(['a', 'b']);
    expect(hasClearLeader(rows)).toBe(true);
  });

  it('L3 wave30 last gap + at-least + mid user + sum', () => {
    expect(lastTwoScoreGap([])).toBeNull();
    expect(hasAtLeastStandings([], 1)).toBe(false);
    expect(midRankUser([])).toBeNull();
    expect(totalScoreSum([])).toBe(0);
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 30, '2026-08-01T13:00:00Z'), row('c', 20, '2026-08-01T11:00:00Z')];
    expect(hasAtLeastStandings(rows, 3)).toBe(true);
    expect(totalScoreSum(rows)).toBe(60);
    expect(midRankUser(rows)).toBe('c');
    expect(lastTwoScoreGap(rows)).toBe(10);
  });

  it('L3 wave31 score labels + ranked join', () => {
    expect(standingCountLabel([])).toBe('0');
    expect(maxScoreLabel([])).toBe('');
    expect(minScoreLabel([])).toBe('');
    expect(rankedUserIdsJoined([])).toBe('');
    const rows = [row('a', 10, '2026-08-01T12:00:00Z'), row('b', 20, '2026-08-01T13:00:00Z')];
    expect(standingCountLabel(rows)).toBe('2');
    expect(maxScoreLabel(rows)).toBe('20');
    expect(minScoreLabel(rows)).toBe('10');
    expect(rankedUserIdsJoined(rows)).toBe('b,a');
  });
});
