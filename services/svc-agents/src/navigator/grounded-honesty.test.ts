import { describe, expect, it } from 'vitest';
import {
  groundedBoardCard,
  groundedStatusLine,
  parseGroundedStatusLine,
  groundedStatusLineMatches,
  groundedStatusLineConsistent,
  groundedExportHeader,
  groundedExportLine,
  groundedExportText,
  liveGroundedResult,
  darkGroundedResult,
  groundedTaskCountInRange,
} from './grounded-honesty.js';

describe('L3 wave96 navigator grounded honesty', () => {
  it('live and dark plane boards', () => {
    const live = liveGroundedResult();
    expect(groundedBoardCard(live)).toEqual({
      status: 'ok',
      plane: 'live',
      tasks: 2,
      dark: 0,
    });
    expect(groundedStatusLine(live)).toBe('status=ok plane=live tasks=2 dark=0');
    expect(groundedStatusLineMatches(live)).toBe(true);
    expect(groundedStatusLineConsistent(groundedStatusLine(live))).toBe(true);
    expect(groundedExportText(live).startsWith(groundedExportHeader())).toBe(true);
    expect(groundedExportLine(live)).toBe('ok,live,2,0');
    expect(groundedTaskCountInRange(live, 2, 2)).toBe(true);

    const dark = darkGroundedResult();
    expect(groundedBoardCard(dark)).toEqual({
      status: 'refuse',
      plane: 'dark',
      tasks: 0,
      dark: 1,
    });
    expect(groundedStatusLine(dark)).toBe('status=refuse plane=dark tasks=0 dark=1');
    expect(groundedStatusLineMatches(dark)).toBe(true);
    expect(groundedStatusLineConsistent(groundedStatusLine(dark))).toBe(true);
    expect(parseGroundedStatusLine('nope')).toBeNull();
  });
});
