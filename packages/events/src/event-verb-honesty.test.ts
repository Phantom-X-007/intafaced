import { describe, expect, it } from 'vitest';
import {
  eventVerbCatalogBoardCard,
  eventVerbCatalogStatusLine,
  parseEventVerbCatalogStatusLine,
  eventVerbCatalogStatusLineMatches,
  eventVerbCatalogStatusLineConsistent,
  eventVerbCatalogExportHeader,
  eventVerbCatalogExportLines,
  eventVerbCatalogExportText,
  isDeclaredEventVerb,
  EVENT_VERBS,
} from './event-verb-honesty.js';

describe('L3 wave215 event-verb catalog honesty', () => {
  it('event verb catalog boards', () => {
    expect(EVENT_VERBS).toHaveLength(28);
    expect(EVENT_VERBS[0]).toBe('created');
    expect(EVENT_VERBS[EVENT_VERBS.length - 1]).toBe('attested');
    expect(eventVerbCatalogBoardCard()).toEqual({
      verbs: 28,
      hasPosted: 1,
      hasSettled: 1,
      hasLiquidated: 1,
      hasAttested: 1,
    });
    expect(eventVerbCatalogStatusLine()).toBe('verbs=28 posted=1 settled=1 liquidated=1 attested=1');
    expect(eventVerbCatalogStatusLineMatches()).toBe(true);
    expect(eventVerbCatalogStatusLineConsistent(eventVerbCatalogStatusLine())).toBe(true);
    expect(eventVerbCatalogExportText().startsWith(eventVerbCatalogExportHeader())).toBe(true);
    expect(eventVerbCatalogExportLines()).toEqual([...EVENT_VERBS]);
    expect(isDeclaredEventVerb('posted')).toBe(true);
    expect(isDeclaredEventVerb('post')).toBe(false);
    expect(parseEventVerbCatalogStatusLine('nope')).toBeNull();
  });
});
