import { describe, expect, it } from 'vitest';
import {
  ambassadorStatusCatalogBoardCard,
  ambassadorStatusCatalogStatusLine,
  parseAmbassadorStatusCatalogStatusLine,
  ambassadorStatusCatalogStatusLineMatches,
  ambassadorStatusCatalogStatusLineConsistent,
  ambassadorListBoardCard,
  ambassadorListStatusLine,
  parseAmbassadorListStatusLine,
  ambassadorListStatusLineMatches,
  ambassadorListStatusLineConsistent,
  ambassadorListExportHeader,
  ambassadorListExportLine,
  ambassadorListExportText,
  ambassadorBadgeIsActive,
  isDeclaredAmbassadorStatus,
  AMBASSADOR_STATUSES,
  type AmbassadorBoardInput,
} from './ambassador-status-honesty.js';

describe('L3 wave107 ambassador status honesty', () => {
  it('catalog and list boards', () => {
    expect(AMBASSADOR_STATUSES).toEqual(['active', 'frozen']);
    expect(ambassadorStatusCatalogBoardCard()).toEqual({
      statuses: 2,
      hasActive: 1,
      hasFrozen: 1,
      hasPayPath: 0,
    });
    expect(ambassadorStatusCatalogStatusLineMatches()).toBe(true);
    expect(ambassadorStatusCatalogStatusLineConsistent(ambassadorStatusCatalogStatusLine())).toBe(true);
    expect(ambassadorBadgeIsActive('active')).toBe(true);
    expect(ambassadorBadgeIsActive('frozen')).toBe(false);
    expect(isDeclaredAmbassadorStatus('active')).toBe(true);
    expect(isDeclaredAmbassadorStatus('paid')).toBe(false);
    expect(parseAmbassadorStatusCatalogStatusLine('nope')).toBeNull();

    const mixed: readonly AmbassadorBoardInput[] = [
      { userId: 'u1', status: 'active' },
      { userId: 'u2', status: 'frozen' },
      { userId: 'u3', status: 'active' },
    ];
    expect(ambassadorListBoardCard(mixed)).toEqual({ total: 3, active: 2, frozen: 1 });
    expect(ambassadorListStatusLine(mixed)).toBe('total=3 active=2 frozen=1');
    expect(ambassadorListStatusLineMatches(mixed)).toBe(true);
    expect(ambassadorListStatusLineConsistent(ambassadorListStatusLine(mixed))).toBe(true);
    expect(ambassadorListExportText(mixed).startsWith(ambassadorListExportHeader())).toBe(true);
    expect(ambassadorListExportLine(mixed)).toBe('3,2,1');
    expect(parseAmbassadorListStatusLine('nope')).toBeNull();
  });
});
