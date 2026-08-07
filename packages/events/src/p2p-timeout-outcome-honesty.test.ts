import { describe, expect, it } from 'vitest';
import {
  p2pTimeoutOutcomeCatalogBoardCard,
  p2pTimeoutOutcomeCatalogStatusLine,
  parseP2pTimeoutOutcomeCatalogStatusLine,
  p2pTimeoutOutcomeCatalogStatusLineMatches,
  p2pTimeoutOutcomeCatalogStatusLineConsistent,
  p2pTimeoutOutcomeCatalogExportHeader,
  p2pTimeoutOutcomeCatalogExportLines,
  p2pTimeoutOutcomeCatalogExportText,
  isDeclaredP2pTimeoutOutcome,
  P2P_TIMEOUT_OUTCOMES,
} from './p2p-timeout-outcome-honesty.js';

describe('L3 wave222 p2p-timeout-outcome catalog honesty', () => {
  it('p2p timeout outcome catalog boards', () => {
    expect(P2P_TIMEOUT_OUTCOMES).toEqual(['released', 'refunded', 'voided', 'disputed']);
    expect(p2pTimeoutOutcomeCatalogBoardCard()).toEqual({
      outcomes: 4,
      hasReleased: 1,
      hasRefunded: 1,
      hasVoided: 1,
      hasDisputed: 1,
    });
    expect(p2pTimeoutOutcomeCatalogStatusLine()).toBe('outcomes=4 released=1 refunded=1 voided=1 disputed=1');
    expect(p2pTimeoutOutcomeCatalogStatusLineMatches()).toBe(true);
    expect(p2pTimeoutOutcomeCatalogStatusLineConsistent(p2pTimeoutOutcomeCatalogStatusLine())).toBe(true);
    expect(p2pTimeoutOutcomeCatalogExportText().startsWith(p2pTimeoutOutcomeCatalogExportHeader())).toBe(true);
    expect(p2pTimeoutOutcomeCatalogExportLines()).toEqual([...P2P_TIMEOUT_OUTCOMES]);
    expect(isDeclaredP2pTimeoutOutcome('voided')).toBe(true);
    expect(isDeclaredP2pTimeoutOutcome('partial')).toBe(false);
    expect(parseP2pTimeoutOutcomeCatalogStatusLine('nope')).toBeNull();
  });
});
