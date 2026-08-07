import { describe, expect, it } from 'vitest';
import {
  wsChannelCatalogBoardCard,
  wsChannelCatalogStatusLine,
  parseWsChannelCatalogStatusLine,
  wsChannelCatalogStatusLineMatches,
  wsChannelCatalogStatusLineConsistent,
  wsChannelCatalogExportHeader,
  wsChannelCatalogExportLines,
  wsChannelCatalogExportText,
  isDeclaredWsChannel,
  WS_CHANNEL_IDS,
} from './ws-channel-honesty.js';

describe('L3 wave202 ws-channel catalog honesty', () => {
  it('ws channel catalog boards', () => {
    expect(WS_CHANNEL_IDS).toEqual(['orderbook', 'trades', 'ticker', 'ohlcv', 'orders', 'positions', 'balance']);
    expect(wsChannelCatalogBoardCard()).toEqual({
      channels: 7,
      publicCount: 4,
      privateCount: 3,
      hasOrderbook: 1,
      hasBalance: 1,
    });
    expect(wsChannelCatalogStatusLine()).toBe('channels=7 public=4 private=3 orderbook=1 balance=1');
    expect(wsChannelCatalogStatusLineMatches()).toBe(true);
    expect(wsChannelCatalogStatusLineConsistent(wsChannelCatalogStatusLine())).toBe(true);
    expect(wsChannelCatalogExportText().startsWith(wsChannelCatalogExportHeader())).toBe(true);
    expect(wsChannelCatalogExportLines()).toEqual([...WS_CHANNEL_IDS]);
    expect(isDeclaredWsChannel('ticker')).toBe(true);
    expect(isDeclaredWsChannel('depth')).toBe(false);
    expect(parseWsChannelCatalogStatusLine('nope')).toBeNull();
  });
});
