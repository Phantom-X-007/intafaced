import { describe, expect, it } from 'vitest';
import {
  muteableChannelCatalogBoardCard,
  muteableChannelCatalogStatusLine,
  parseMuteableChannelCatalogStatusLine,
  muteableChannelCatalogStatusLineMatches,
  muteableChannelCatalogStatusLineConsistent,
  muteableChannelCatalogExportHeader,
  muteableChannelCatalogExportLines,
  muteableChannelCatalogExportText,
  isDeclaredMuteableChannel,
  MUTEABLE_CHANNELS,
} from './muteable-channel-honesty.js';

describe('L3 wave173 muteable channel catalog honesty', () => {
  it('muteable channel catalog boards', () => {
    expect(MUTEABLE_CHANNELS).toEqual(['email', 'push', 'sms']);
    expect(muteableChannelCatalogBoardCard()).toEqual({
      channels: 3,
      hasEmail: 1,
      hasPush: 1,
      hasSms: 1,
      criticalMuteable: 0,
    });
    expect(muteableChannelCatalogStatusLine()).toBe('channels=3 email=1 push=1 sms=1 critical_mute=0');
    expect(muteableChannelCatalogStatusLineMatches()).toBe(true);
    expect(muteableChannelCatalogStatusLineConsistent(muteableChannelCatalogStatusLine())).toBe(true);
    expect(muteableChannelCatalogExportText().startsWith(muteableChannelCatalogExportHeader())).toBe(true);
    expect(muteableChannelCatalogExportLines()).toEqual([...MUTEABLE_CHANNELS]);
    expect(isDeclaredMuteableChannel('push')).toBe(true);
    expect(isDeclaredMuteableChannel('inapp')).toBe(false);
    expect(parseMuteableChannelCatalogStatusLine('nope')).toBeNull();
  });
});
