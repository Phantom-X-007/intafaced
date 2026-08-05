import { describe, expect, it } from 'vitest';
import { TournamentError } from './ladder.js';
import { isScoreWritable, transitionSeason } from './season-lifecycle.js';

const base = {
  id: 's1',
  slug: 'summer-26',
  title: 'Summer',
  rulesSummary: 'Paper scores only',
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: null,
};

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
});
