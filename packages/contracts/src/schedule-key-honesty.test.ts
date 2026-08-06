import { describe, expect, it } from 'vitest';
import {
  scheduleKeyCatalogBoardCard,
  scheduleKeyCatalogStatusLine,
  parseScheduleKeyCatalogStatusLine,
  scheduleKeyCatalogStatusLineMatches,
  scheduleKeyCatalogStatusLineConsistent,
  scheduleKeyCatalogExportHeader,
  scheduleKeyCatalogExportLines,
  scheduleKeyCatalogExportText,
  isDeclaredScheduleKey,
  SCHEDULE_KEYS,
} from './schedule-key-honesty.js';

describe('L3 wave145 schedule key catalog honesty', () => {
  it('schedule key catalog boards', () => {
    expect(SCHEDULE_KEYS).toHaveLength(3);
    expect(scheduleKeyCatalogBoardCard()).toEqual({
      schedules: 3,
      hasCrypto: 1,
      hasFx: 1,
      hasCme: 1,
    });
    expect(scheduleKeyCatalogStatusLine()).toBe('schedules=3 crypto=1 fx=1 cme=1');
    expect(scheduleKeyCatalogStatusLineMatches()).toBe(true);
    expect(scheduleKeyCatalogStatusLineConsistent(scheduleKeyCatalogStatusLine())).toBe(true);
    expect(scheduleKeyCatalogExportText().startsWith(scheduleKeyCatalogExportHeader())).toBe(true);
    expect(scheduleKeyCatalogExportLines()).toEqual([...SCHEDULE_KEYS]);
    expect(isDeclaredScheduleKey('fx-global')).toBe(true);
    expect(isDeclaredScheduleKey('always-open')).toBe(false);
    expect(parseScheduleKeyCatalogStatusLine('nope')).toBeNull();
  });
});
