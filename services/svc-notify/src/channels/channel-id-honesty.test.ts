import { describe, expect, it } from 'vitest';
import {
  channelIdCatalogBoardCard,
  channelIdCatalogStatusLine,
  parseChannelIdCatalogStatusLine,
  channelIdCatalogStatusLineMatches,
  channelIdCatalogStatusLineConsistent,
  channelIdCatalogExportHeader,
  channelIdCatalogExportLines,
  channelIdCatalogExportText,
  isDeclaredChannelId,
  isOutOfAppChannelId,
  CHANNEL_IDS,
  OUT_OF_APP_CHANNEL_IDS,
} from './channel-id-honesty.js';

describe('L3 wave154 channel id catalog honesty', () => {
  it('channel catalog boards', () => {
    expect(CHANNEL_IDS).toEqual(['inapp', 'email', 'push', 'sms']);
    expect(OUT_OF_APP_CHANNEL_IDS).toEqual(['email', 'push', 'sms']);
    expect(channelIdCatalogBoardCard()).toEqual({
      channels: 4,
      outOfApp: 3,
      hasInapp: 1,
      hasEmail: 1,
      hasPush: 1,
      hasSms: 1,
    });
    expect(channelIdCatalogStatusLine()).toBe('channels=4 out_of_app=3 inapp=1 email=1 push=1 sms=1');
    expect(channelIdCatalogStatusLineMatches()).toBe(true);
    expect(channelIdCatalogStatusLineConsistent(channelIdCatalogStatusLine())).toBe(true);
    expect(channelIdCatalogExportText().startsWith(channelIdCatalogExportHeader())).toBe(true);
    expect(channelIdCatalogExportLines()).toHaveLength(4);
    expect(isDeclaredChannelId('push')).toBe(true);
    expect(isDeclaredChannelId('webhook')).toBe(false);
    expect(isOutOfAppChannelId('sms')).toBe(true);
    expect(isOutOfAppChannelId('inapp')).toBe(false);
    expect(parseChannelIdCatalogStatusLine('nope')).toBeNull();
  });
});
