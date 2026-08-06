import { describe, expect, it } from 'vitest';
import {
  refusalCatalogSize,
  isDeclaredRefusalCode,
  refusalEventHistogram,
  refusalCatalogBoardCard,
  refusalCatalogStatusLine,
  parseRefusalCatalogStatusLine,
  refusalCatalogStatusLineMatches,
  refusalCatalogStatusLineConsistent,
  refusalCatalogExportHeader,
  refusalCatalogExportLine,
  refusalCatalogExportText,
  refusalCatalogOnlyStatusLine,
  parseRefusalCatalogOnlyStatusLine,
  refusalCatalogOnlyStatusLineMatches,
  refusalCatalogHasSpendLimit,
  refusalEventCountInRange,
  REFUSAL_CODE_CATALOG,
  type RefusalEventInput,
} from './refusal-catalog-honesty.js';

describe('L3 wave75 refusal catalog honesty', () => {
  it('catalog and event boards', () => {
    expect(refusalCatalogSize()).toBe(9);
    expect(REFUSAL_CODE_CATALOG).toContain('agents.tool_not_declared');
    expect(isDeclaredRefusalCode('agents.spend_limit')).toBe(true);
    expect(isDeclaredRefusalCode('agents.invented')).toBe(false);
    expect(refusalCatalogHasSpendLimit()).toBe(true);
    expect(refusalCatalogOnlyStatusLineMatches()).toBe(true);
    expect(parseRefusalCatalogOnlyStatusLine(refusalCatalogOnlyStatusLine())?.catalog).toBe(9);
    expect(parseRefusalCatalogOnlyStatusLine('nope')).toBeNull();

    const empty: readonly RefusalEventInput[] = [];
    expect(refusalCatalogBoardCard(empty).events).toBe(0);
    expect(refusalCatalogStatusLineMatches(empty)).toBe(true);
    expect(refusalCatalogStatusLineConsistent(refusalCatalogStatusLine(empty))).toBe(true);

    const events: readonly RefusalEventInput[] = [
      { code: 'agents.tool_not_declared' },
      { code: 'agents.tool_not_declared' },
      { code: 'agents.approval_required' },
    ];
    expect(refusalEventHistogram(events)).toEqual({
      'agents.tool_not_declared': 2,
      'agents.approval_required': 1,
    });
    expect(refusalCatalogBoardCard(events)).toEqual({
      catalog: 9,
      events: 3,
      uniqueCodes: 2,
      undeclared: 0,
    });
    expect(refusalCatalogStatusLine(events)).toBe('catalog=9 events=3 unique=2 undeclared=0');
    expect(refusalCatalogStatusLineMatches(events)).toBe(true);
    expect(refusalCatalogStatusLineConsistent(refusalCatalogStatusLine(events))).toBe(true);
    expect(refusalCatalogExportText(events).startsWith(refusalCatalogExportHeader())).toBe(true);
    expect(refusalCatalogExportLine(events)).toBe('9,3,2,0');
    expect(refusalEventCountInRange(events, 3, 3)).toBe(true);
    expect(refusalEventCountInRange(events, 4, 1)).toBe(false);
    expect(parseRefusalCatalogStatusLine('nope')).toBeNull();
  });
});
