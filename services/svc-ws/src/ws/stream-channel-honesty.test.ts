import { describe, expect, it } from 'vitest';
import {
  streamChannelCatalogBoardCard,
  streamChannelCatalogStatusLine,
  parseStreamChannelCatalogStatusLine,
  streamChannelCatalogStatusLineMatches,
  streamChannelCatalogStatusLineConsistent,
  streamChannelCatalogExportHeader,
  streamChannelCatalogExportLines,
  streamChannelCatalogExportText,
  isDeclaredStreamChannel,
  STREAM_CHANNELS,
} from './stream-channel-honesty.js';

describe('L3 wave178 stream-channel catalog honesty', () => {
  it('stream channel catalog boards', () => {
    expect(STREAM_CHANNELS).toEqual(['depth', 'trades']);
    expect(streamChannelCatalogBoardCard()).toEqual({
      channels: 2,
      hasDepth: 1,
      hasTrades: 1,
    });
    expect(streamChannelCatalogStatusLine()).toBe('channels=2 depth=1 trades=1');
    expect(streamChannelCatalogStatusLineMatches()).toBe(true);
    expect(streamChannelCatalogStatusLineConsistent(streamChannelCatalogStatusLine())).toBe(true);
    expect(streamChannelCatalogExportText().startsWith(streamChannelCatalogExportHeader())).toBe(true);
    expect(streamChannelCatalogExportLines()).toEqual([...STREAM_CHANNELS]);
    expect(isDeclaredStreamChannel('depth')).toBe(true);
    expect(isDeclaredStreamChannel('candles')).toBe(false);
    expect(parseStreamChannelCatalogStatusLine('nope')).toBeNull();
  });
});
