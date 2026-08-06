import { describe, expect, it } from 'vitest';
import {
  mentorMatchStatusCatalogBoardCard,
  mentorMatchStatusCatalogStatusLine,
  parseMentorMatchStatusCatalogStatusLine,
  mentorMatchStatusCatalogStatusLineMatches,
  mentorMatchStatusCatalogStatusLineConsistent,
  mentorMatchStatusCatalogExportHeader,
  mentorMatchStatusCatalogExportLines,
  mentorMatchStatusCatalogExportText,
  isDeclaredMentorMatchStatus,
  MENTOR_MATCH_STATUSES,
} from './mentor-match-status-honesty.js';

describe('L3 wave160 mentor-match status catalog honesty', () => {
  it('status catalog boards', () => {
    expect(MENTOR_MATCH_STATUSES).toEqual(['shortlisted', 'accepted', 'declined', 'ended']);
    expect(mentorMatchStatusCatalogBoardCard()).toEqual({
      statuses: 4,
      hasShortlisted: 1,
      hasAccepted: 1,
      hasDeclined: 1,
      hasEnded: 1,
    });
    expect(mentorMatchStatusCatalogStatusLine()).toBe('statuses=4 shortlisted=1 accepted=1 declined=1 ended=1');
    expect(mentorMatchStatusCatalogStatusLineMatches()).toBe(true);
    expect(mentorMatchStatusCatalogStatusLineConsistent(mentorMatchStatusCatalogStatusLine())).toBe(true);
    expect(mentorMatchStatusCatalogExportText().startsWith(mentorMatchStatusCatalogExportHeader())).toBe(true);
    expect(mentorMatchStatusCatalogExportLines()).toEqual([...MENTOR_MATCH_STATUSES]);
    expect(isDeclaredMentorMatchStatus('accepted')).toBe(true);
    expect(isDeclaredMentorMatchStatus('pending')).toBe(false);
    expect(parseMentorMatchStatusCatalogStatusLine('nope')).toBeNull();
  });
});
