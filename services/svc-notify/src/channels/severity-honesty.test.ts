import { describe, expect, it } from 'vitest';
import {
  notifySeverityCatalogBoardCard,
  notifySeverityCatalogStatusLine,
  parseNotifySeverityCatalogStatusLine,
  notifySeverityCatalogStatusLineMatches,
  notifySeverityCatalogStatusLineConsistent,
  notifySeverityCatalogExportHeader,
  notifySeverityCatalogExportLines,
  notifySeverityCatalogExportText,
  isDeclaredNotifySeverity,
  NOTIFY_SEVERITIES,
} from './severity-honesty.js';

describe('L3 wave155 notify severity catalog honesty', () => {
  it('severity catalog boards', () => {
    expect(NOTIFY_SEVERITIES).toEqual(['info', 'action', 'critical']);
    expect(notifySeverityCatalogBoardCard()).toEqual({
      severities: 3,
      hasInfo: 1,
      hasAction: 1,
      hasCritical: 1,
    });
    expect(notifySeverityCatalogStatusLine()).toBe('severities=3 info=1 action=1 critical=1');
    expect(notifySeverityCatalogStatusLineMatches()).toBe(true);
    expect(notifySeverityCatalogStatusLineConsistent(notifySeverityCatalogStatusLine())).toBe(true);
    expect(notifySeverityCatalogExportText().startsWith(notifySeverityCatalogExportHeader())).toBe(true);
    expect(notifySeverityCatalogExportLines()).toEqual([...NOTIFY_SEVERITIES]);
    expect(isDeclaredNotifySeverity('critical')).toBe(true);
    expect(isDeclaredNotifySeverity('debug')).toBe(false);
    expect(parseNotifySeverityCatalogStatusLine('nope')).toBeNull();
  });
});
