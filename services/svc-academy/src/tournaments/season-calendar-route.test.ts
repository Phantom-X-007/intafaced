import { describe, expect, it } from 'vitest';
import type { SeasonRecord } from './ladder.js';
import { seasonWindowAt } from './season-calendar.js';

function season(over: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 's1',
    title: 'Season 1',
    status: 'scheduled',
    rulesSummary: 'rules',
    startsAt: new Date('2026-08-01T00:00:00Z'),
    endsAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

describe('seasonCalendar router shape — academy.tournaments', () => {
  it('scoreWindowOpen only when live and in window', () => {
    const at = new Date('2026-08-15T12:00:00Z');
    const live = seasonWindowAt(season({ status: 'live' }), at);
    expect(live.inWindow).toBe(true);
    expect(live.scoreWindowOpen).toBe(true);

    const scheduled = seasonWindowAt(season({ status: 'scheduled' }), at);
    expect(scheduled.inWindow).toBe(true);
    expect(scheduled.scoreWindowOpen).toBe(false);
  });
});
