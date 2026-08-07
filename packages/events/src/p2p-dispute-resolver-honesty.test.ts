import { describe, expect, it } from 'vitest';
import {
  p2pDisputeResolverCatalogBoardCard,
  p2pDisputeResolverCatalogStatusLine,
  parseP2pDisputeResolverCatalogStatusLine,
  p2pDisputeResolverCatalogStatusLineMatches,
  p2pDisputeResolverCatalogStatusLineConsistent,
  p2pDisputeResolverCatalogExportHeader,
  p2pDisputeResolverCatalogExportLines,
  p2pDisputeResolverCatalogExportText,
  isDeclaredP2pDisputeResolver,
  P2P_DISPUTE_RESOLVERS,
} from './p2p-dispute-resolver-honesty.js';

describe('L3 wave227 p2p-dispute-resolver catalog honesty', () => {
  it('p2p dispute resolver catalog boards', () => {
    expect(P2P_DISPUTE_RESOLVERS).toEqual(['seller', 'moderator']);
    expect(p2pDisputeResolverCatalogBoardCard()).toEqual({
      resolvers: 2,
      hasSeller: 1,
      hasModerator: 1,
    });
    expect(p2pDisputeResolverCatalogStatusLine()).toBe('resolvers=2 seller=1 moderator=1');
    expect(p2pDisputeResolverCatalogStatusLineMatches()).toBe(true);
    expect(p2pDisputeResolverCatalogStatusLineConsistent(p2pDisputeResolverCatalogStatusLine())).toBe(true);
    expect(p2pDisputeResolverCatalogExportText().startsWith(p2pDisputeResolverCatalogExportHeader())).toBe(true);
    expect(p2pDisputeResolverCatalogExportLines()).toEqual([...P2P_DISPUTE_RESOLVERS]);
    expect(isDeclaredP2pDisputeResolver('moderator')).toBe(true);
    expect(isDeclaredP2pDisputeResolver('buyer')).toBe(false);
    expect(parseP2pDisputeResolverCatalogStatusLine('nope')).toBeNull();
  });
});
