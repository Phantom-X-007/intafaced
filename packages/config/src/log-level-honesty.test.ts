import { describe, expect, it } from 'vitest';
import {
  logLevelCatalogBoardCard,
  logLevelCatalogStatusLine,
  parseLogLevelCatalogStatusLine,
  logLevelCatalogStatusLineMatches,
  logLevelCatalogStatusLineConsistent,
  logLevelCatalogExportHeader,
  logLevelCatalogExportLines,
  logLevelCatalogExportText,
  isDeclaredLogLevel,
  LOG_LEVELS,
} from './log-level-honesty.js';

describe('L3 wave212 log-level catalog honesty', () => {
  it('log level catalog boards', () => {
    expect(LOG_LEVELS).toEqual(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);
    expect(logLevelCatalogBoardCard()).toEqual({
      levels: 6,
      hasFatal: 1,
      hasError: 1,
      hasInfo: 1,
      hasTrace: 1,
    });
    expect(logLevelCatalogStatusLine()).toBe('levels=6 fatal=1 error=1 info=1 trace=1');
    expect(logLevelCatalogStatusLineMatches()).toBe(true);
    expect(logLevelCatalogStatusLineConsistent(logLevelCatalogStatusLine())).toBe(true);
    expect(logLevelCatalogExportText().startsWith(logLevelCatalogExportHeader())).toBe(true);
    expect(logLevelCatalogExportLines()).toEqual([...LOG_LEVELS]);
    expect(isDeclaredLogLevel('warn')).toBe(true);
    expect(isDeclaredLogLevel('verbose')).toBe(false);
    expect(parseLogLevelCatalogStatusLine('nope')).toBeNull();
  });
});
