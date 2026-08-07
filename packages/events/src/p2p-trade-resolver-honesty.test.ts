import { describe, expect, it } from 'vitest';
import {
  p2pTradeResolverCatalogBoardCard,
  p2pTradeResolverCatalogStatusLine,
  parseP2pTradeResolverCatalogStatusLine,
  p2pTradeResolverCatalogStatusLineMatches,
  p2pTradeResolverCatalogStatusLineConsistent,
  p2pTradeResolverCatalogExportHeader,
  p2pTradeResolverCatalogExportLines,
  p2pTradeResolverCatalogExportText,
  isDeclaredP2pTradeResolver,
  P2P_TRADE_RESOLVERS,
} from './p2p-trade-resolver-honesty.js';

describe('L3 wave228 p2p-trade-resolver catalog honesty', () => {
  it('p2p trade resolver catalog boards', () => {
    expect(P2P_TRADE_RESOLVERS).toEqual(['buyer', 'seller', 'moderator', 'timeout']);
    expect(p2pTradeResolverCatalogBoardCard()).toEqual({
      resolvers: 4,
      hasBuyer: 1,
      hasSeller: 1,
      hasModerator: 1,
      hasTimeout: 1,
    });
    expect(p2pTradeResolverCatalogStatusLine()).toBe('resolvers=4 buyer=1 seller=1 moderator=1 timeout=1');
    expect(p2pTradeResolverCatalogStatusLineMatches()).toBe(true);
    expect(p2pTradeResolverCatalogStatusLineConsistent(p2pTradeResolverCatalogStatusLine())).toBe(true);
    expect(p2pTradeResolverCatalogExportText().startsWith(p2pTradeResolverCatalogExportHeader())).toBe(true);
    expect(p2pTradeResolverCatalogExportLines()).toEqual([...P2P_TRADE_RESOLVERS]);
    expect(isDeclaredP2pTradeResolver('timeout')).toBe(true);
    expect(isDeclaredP2pTradeResolver('system')).toBe(false);
    expect(parseP2pTradeResolverCatalogStatusLine('nope')).toBeNull();
  });
});
