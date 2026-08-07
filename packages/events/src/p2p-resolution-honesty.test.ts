import { describe, expect, it } from 'vitest';
import {
  p2pResolutionCatalogBoardCard,
  p2pResolutionCatalogStatusLine,
  parseP2pResolutionCatalogStatusLine,
  p2pResolutionCatalogStatusLineMatches,
  p2pResolutionCatalogStatusLineConsistent,
  p2pResolutionCatalogExportHeader,
  p2pResolutionCatalogExportLines,
  p2pResolutionCatalogExportText,
  isDeclaredP2pResolution,
  P2P_RESOLUTIONS,
} from './p2p-resolution-honesty.js';

describe('L3 wave221 p2p-resolution catalog honesty', () => {
  it('p2p resolution catalog boards', () => {
    expect(P2P_RESOLUTIONS).toEqual(['release', 'refund']);
    expect(p2pResolutionCatalogBoardCard()).toEqual({
      resolutions: 2,
      hasRelease: 1,
      hasRefund: 1,
    });
    expect(p2pResolutionCatalogStatusLine()).toBe('resolutions=2 release=1 refund=1');
    expect(p2pResolutionCatalogStatusLineMatches()).toBe(true);
    expect(p2pResolutionCatalogStatusLineConsistent(p2pResolutionCatalogStatusLine())).toBe(true);
    expect(p2pResolutionCatalogExportText().startsWith(p2pResolutionCatalogExportHeader())).toBe(true);
    expect(p2pResolutionCatalogExportLines()).toEqual([...P2P_RESOLUTIONS]);
    expect(isDeclaredP2pResolution('release')).toBe(true);
    expect(isDeclaredP2pResolution('split')).toBe(false);
    expect(parseP2pResolutionCatalogStatusLine('nope')).toBeNull();
  });
});
