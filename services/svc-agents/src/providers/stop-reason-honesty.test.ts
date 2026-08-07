import { describe, expect, it } from 'vitest';
import {
  stopReasonCatalogBoardCard,
  stopReasonCatalogStatusLine,
  parseStopReasonCatalogStatusLine,
  stopReasonCatalogStatusLineMatches,
  stopReasonCatalogStatusLineConsistent,
  stopReasonCatalogExportHeader,
  stopReasonCatalogExportLines,
  stopReasonCatalogExportText,
  isDeclaredStopReason,
  STOP_REASONS,
} from './stop-reason-honesty.js';

describe('L3 wave176 stop-reason catalog honesty', () => {
  it('stop reason catalog boards', () => {
    expect(STOP_REASONS).toEqual(['end', 'max_tokens', 'stop_sequence', 'refusal']);
    expect(stopReasonCatalogBoardCard()).toEqual({
      reasons: 4,
      hasEnd: 1,
      hasMaxTokens: 1,
      hasStopSequence: 1,
      hasRefusal: 1,
    });
    expect(stopReasonCatalogStatusLine()).toBe('reasons=4 end=1 max_tokens=1 stop_sequence=1 refusal=1');
    expect(stopReasonCatalogStatusLineMatches()).toBe(true);
    expect(stopReasonCatalogStatusLineConsistent(stopReasonCatalogStatusLine())).toBe(true);
    expect(stopReasonCatalogExportText().startsWith(stopReasonCatalogExportHeader())).toBe(true);
    expect(stopReasonCatalogExportLines()).toEqual([...STOP_REASONS]);
    expect(isDeclaredStopReason('refusal')).toBe(true);
    expect(isDeclaredStopReason('timeout')).toBe(false);
    expect(parseStopReasonCatalogStatusLine('nope')).toBeNull();
  });
});
