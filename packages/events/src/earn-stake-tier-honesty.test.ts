import { describe, expect, it } from 'vitest';
import {
  earnStakeTierCatalogBoardCard,
  earnStakeTierCatalogStatusLine,
  parseEarnStakeTierCatalogStatusLine,
  earnStakeTierCatalogStatusLineMatches,
  earnStakeTierCatalogStatusLineConsistent,
  earnStakeTierCatalogExportHeader,
  earnStakeTierCatalogExportLines,
  earnStakeTierCatalogExportText,
  isDeclaredEarnStakeTier,
  EARN_STAKE_TIERS,
} from './earn-stake-tier-honesty.js';

describe('L3 wave220 earn-stake-tier catalog honesty', () => {
  it('earn stake tier catalog boards', () => {
    expect(EARN_STAKE_TIERS).toEqual(['flex', 'm3', 'm12']);
    expect(earnStakeTierCatalogBoardCard()).toEqual({
      tiers: 3,
      hasFlex: 1,
      hasM3: 1,
      hasM12: 1,
    });
    expect(earnStakeTierCatalogStatusLine()).toBe('tiers=3 flex=1 m3=1 m12=1');
    expect(earnStakeTierCatalogStatusLineMatches()).toBe(true);
    expect(earnStakeTierCatalogStatusLineConsistent(earnStakeTierCatalogStatusLine())).toBe(true);
    expect(earnStakeTierCatalogExportText().startsWith(earnStakeTierCatalogExportHeader())).toBe(true);
    expect(earnStakeTierCatalogExportLines()).toEqual([...EARN_STAKE_TIERS]);
    expect(isDeclaredEarnStakeTier('m3')).toBe(true);
    expect(isDeclaredEarnStakeTier('m6')).toBe(false);
    expect(parseEarnStakeTierCatalogStatusLine('nope')).toBeNull();
  });
});
