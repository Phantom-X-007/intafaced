import { describe, expect, it } from 'vitest';
import {
  outOfAppChannelCatalogBoardCard,
  outOfAppChannelCatalogStatusLine,
  parseOutOfAppChannelCatalogStatusLine,
  outOfAppChannelCatalogStatusLineMatches,
  outOfAppChannelCatalogStatusLineConsistent,
  outOfAppChannelCatalogExportHeader,
  outOfAppChannelCatalogExportLines,
  outOfAppChannelCatalogExportText,
  isDeclaredOutOfAppChannel,
  OUT_OF_APP_CHANNEL_IDS,
} from './out-of-app-channel-honesty.js';

describe('L3 wave163 out-of-app channel catalog honesty', () => {
  it('channel catalog boards', () => {
    expect(OUT_OF_APP_CHANNEL_IDS).toEqual(['email', 'push', 'sms']);
    expect(outOfAppChannelCatalogBoardCard()).toEqual({
      channels: 3,
      hasEmail: 1,
      hasPush: 1,
      hasSms: 1,
      includesInapp: 0,
    });
    expect(outOfAppChannelCatalogStatusLine()).toBe('channels=3 email=1 push=1 sms=1 inapp=0');
    expect(outOfAppChannelCatalogStatusLineMatches()).toBe(true);
    expect(outOfAppChannelCatalogStatusLineConsistent(outOfAppChannelCatalogStatusLine())).toBe(true);
    expect(outOfAppChannelCatalogExportText().startsWith(outOfAppChannelCatalogExportHeader())).toBe(true);
    expect(outOfAppChannelCatalogExportLines()).toEqual([...OUT_OF_APP_CHANNEL_IDS]);
    expect(isDeclaredOutOfAppChannel('email')).toBe(true);
    expect(isDeclaredOutOfAppChannel('inapp')).toBe(false);
    expect(parseOutOfAppChannelCatalogStatusLine('nope')).toBeNull();
  });
});
