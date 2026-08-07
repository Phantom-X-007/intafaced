import { describe, expect, it } from 'vitest';
import {
  seedPlacementStatusCatalogBoardCard,
  seedPlacementStatusCatalogStatusLine,
  parseSeedPlacementStatusCatalogStatusLine,
  seedPlacementStatusCatalogStatusLineMatches,
  seedPlacementStatusCatalogStatusLineConsistent,
  seedPlacementStatusCatalogExportHeader,
  seedPlacementStatusCatalogExportLines,
  seedPlacementStatusCatalogExportText,
  isDeclaredSeedPlacementStatus,
  SEED_PLACEMENT_STATUSES,
} from './seed-placement-status-honesty.js';

describe('L3 wave193 seed-placement-status catalog honesty', () => {
  it('seed placement status catalog boards', () => {
    expect(SEED_PLACEMENT_STATUSES).toEqual(['resting', 'rejected', 'hold_failed', 'submit_indeterminate', 'released_after_reject']);
    expect(seedPlacementStatusCatalogBoardCard()).toEqual({
      statuses: 5,
      hasResting: 1,
      hasRejected: 1,
      hasHoldFailed: 1,
      hasReleasedAfterReject: 1,
    });
    expect(seedPlacementStatusCatalogStatusLine()).toBe('statuses=5 resting=1 rejected=1 hold_failed=1 released_after_reject=1');
    expect(seedPlacementStatusCatalogStatusLineMatches()).toBe(true);
    expect(seedPlacementStatusCatalogStatusLineConsistent(seedPlacementStatusCatalogStatusLine())).toBe(true);
    expect(seedPlacementStatusCatalogExportText().startsWith(seedPlacementStatusCatalogExportHeader())).toBe(true);
    expect(seedPlacementStatusCatalogExportLines()).toEqual([...SEED_PLACEMENT_STATUSES]);
    expect(isDeclaredSeedPlacementStatus('released_after_reject')).toBe(true);
    expect(isDeclaredSeedPlacementStatus('filled')).toBe(false);
    expect(parseSeedPlacementStatusCatalogStatusLine('nope')).toBeNull();
  });
});
