import { describe, expect, it } from 'vitest';
import {
  residencyStatusCatalogBoardCard,
  residencyStatusCatalogStatusLine,
  parseResidencyStatusCatalogStatusLine,
  residencyStatusCatalogStatusLineMatches,
  residencyStatusCatalogStatusLineConsistent,
  residencyListBoardCard,
  residencyListStatusLine,
  parseResidencyListStatusLine,
  residencyListStatusLineMatches,
  residencyListStatusLineConsistent,
  residencyListExportHeader,
  residencyListExportLine,
  residencyListExportText,
  isDeclaredResidencyStatus,
  RESIDENCY_STATUSES,
  type ResidencyBoardInput,
} from './residency-status-honesty.js';

describe('L3 wave105 residency status honesty', () => {
  it('catalog and list boards', () => {
    expect(RESIDENCY_STATUSES).toHaveLength(4);
    expect(residencyStatusCatalogBoardCard()).toEqual({
      statuses: 4,
      terminalAccepted: 1,
      terminalRejected: 1,
    });
    expect(residencyStatusCatalogStatusLineMatches()).toBe(true);
    expect(residencyStatusCatalogStatusLineConsistent(residencyStatusCatalogStatusLine())).toBe(
      true,
    );
    expect(isDeclaredResidencyStatus('applied')).toBe(true);
    expect(isDeclaredResidencyStatus('ghost')).toBe(false);
    expect(parseResidencyStatusCatalogStatusLine('nope')).toBeNull();

    const empty: readonly ResidencyBoardInput[] = [];
    expect(residencyListBoardCard(empty).applications).toBe(0);
    expect(residencyListStatusLineMatches(empty)).toBe(true);

    const mixed: readonly ResidencyBoardInput[] = [
      { status: 'applied', cohort: 'c1' },
      { status: 'accepted', cohort: 'c1' },
      { status: 'rejected', cohort: 'c2' },
      { status: 'withdrawn', cohort: 'c2' },
    ];
    expect(residencyListBoardCard(mixed)).toEqual({
      applications: 4,
      applied: 1,
      accepted: 1,
      rejected: 1,
      withdrawn: 1,
      cohorts: 2,
    });
    expect(residencyListStatusLine(mixed)).toBe(
      'applications=4 applied=1 accepted=1 rejected=1 withdrawn=1 cohorts=2',
    );
    expect(residencyListStatusLineMatches(mixed)).toBe(true);
    expect(residencyListStatusLineConsistent(residencyListStatusLine(mixed))).toBe(true);
    expect(residencyListExportText(mixed).startsWith(residencyListExportHeader())).toBe(true);
    expect(residencyListExportLine(mixed)).toBe('4,1,1,1,1,2');
    expect(parseResidencyListStatusLine('nope')).toBeNull();
  });
});
