import { describe, expect, it } from 'vitest';
import { TournamentError, type SeasonRecord } from './ladder.js';
import {
  isSeasonCalendarEnded,
  listScoreWindowOpenSeasons,
  listSeasonsInCalendarWindow,
  refusePrizeOnSeasonClose,
  scoreWindowOpenCount,
  seasonWindowAt,
} from './season-calendar.js';
import { PRIZE_REFUSE_CODE } from './prize-refuse.js';

const season = (partial: Partial<SeasonRecord> & Pick<SeasonRecord, 'status'>): SeasonRecord => ({
  id: 's1',
  slug: 'summer-26',
  title: 'Summer',
  rulesSummary: 'Paper scores only — no prizes',
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: new Date('2026-08-31T00:00:00.000Z'),
  ...partial,
});

describe('tournament Stage-3 season calendar (no prizes)', () => {
  it('score window open only when live and inside [start,end)', () => {
    const live = season({ status: 'live' });
    const mid = new Date('2026-08-15T12:00:00.000Z');
    const w = seasonWindowAt(live, mid);
    expect(w.inWindow).toBe(true);
    expect(w.scoreWindowOpen).toBe(true);

    const before = seasonWindowAt(live, new Date('2026-07-01T00:00:00.000Z'));
    expect(before.inWindow).toBe(false);
    expect(before.scoreWindowOpen).toBe(false);

    const scheduled = seasonWindowAt(season({ status: 'scheduled' }), mid);
    expect(scheduled.inWindow).toBe(true);
    expect(scheduled.scoreWindowOpen).toBe(false);
  });

  it('lists score-open seasons without invent', () => {
    const at = new Date('2026-08-15T00:00:00.000Z');
    const seasons = [season({ status: 'live' }), season({ id: 's2', status: 'frozen' })];
    expect(listScoreWindowOpenSeasons(seasons, at).map((s) => s.id)).toEqual(['s1']);
    expect(scoreWindowOpenCount(seasons, at)).toBe(1);
    expect(listSeasonsInCalendarWindow(seasons, at)).toHaveLength(2);
    expect(listScoreWindowOpenSeasons([], at)).toEqual([]);
  });

  it('calendar end never invents IFC prize fund', () => {
    const ended = season({ status: 'ended' });
    const d = refusePrizeOnSeasonClose(ended);
    expect(d.status).toBe('refuse');
    expect(d.code).toBe(PRIZE_REFUSE_CODE);
    expect(d.kind).toBe('fund_pool');
    expect(isSeasonCalendarEnded(ended, new Date('2026-09-01T00:00:00.000Z'))).toBe(true);
    expect(isSeasonCalendarEnded(ended, new Date('2026-08-15T00:00:00.000Z'))).toBe(false);
  });

  it('refuses blank season id', () => {
    expect(() => seasonWindowAt(season({ id: '  ', status: 'live' }))).toThrow(TournamentError);
  });
});
