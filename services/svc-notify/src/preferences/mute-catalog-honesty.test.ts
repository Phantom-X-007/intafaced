import { describe, expect, it } from 'vitest';
import {
  muteCatalogBoardCard,
  muteCatalogStatusLine,
  parseMuteCatalogStatusLine,
  muteCatalogStatusLineMatches,
  muteCatalogStatusLineConsistent,
  mutePrefsBoardCard,
  mutePrefsStatusLine,
  parseMutePrefsStatusLine,
  mutePrefsStatusLineMatches,
  mutePrefsStatusLineConsistent,
  mutePrefsExportHeader,
  mutePrefsExportLine,
  mutePrefsExportText,
  isMuteableChannel,
  MUTEABLE_CHANNELS,
  NOTIFY_SEVERITIES,
} from './mute-catalog-honesty.js';

describe('L3 wave83 mute catalog honesty', () => {
  it('catalog and prefs boards', () => {
    expect(NOTIFY_SEVERITIES).toHaveLength(3);
    expect(MUTEABLE_CHANNELS).toHaveLength(3);
    expect(muteCatalogBoardCard()).toEqual({
      severities: 3,
      muteableChannels: 3,
      criticalMuteable: 0,
    });
    expect(muteCatalogStatusLineMatches()).toBe(true);
    expect(muteCatalogStatusLineConsistent(muteCatalogStatusLine())).toBe(true);
    expect(parseMuteCatalogStatusLine('nope')).toBeNull();

    const empty = { muted: [] as const };
    expect(mutePrefsBoardCard(empty)).toEqual({ muted: 0, unmuted: 3 });
    expect(mutePrefsStatusLineMatches(empty)).toBe(true);

    const partial = { muted: ['email', 'sms'] as const };
    expect(mutePrefsBoardCard(partial)).toEqual({ muted: 2, unmuted: 1 });
    expect(mutePrefsStatusLine(partial)).toBe('muted=2 unmuted=1');
    expect(mutePrefsStatusLineMatches(partial)).toBe(true);
    expect(mutePrefsStatusLineConsistent(mutePrefsStatusLine(partial))).toBe(true);
    expect(mutePrefsExportText(partial).startsWith(mutePrefsExportHeader())).toBe(true);
    expect(mutePrefsExportLine(partial)).toBe('2,1');
    expect(isMuteableChannel('email')).toBe(true);
    expect(isMuteableChannel('inapp')).toBe(false);
    expect(parseMutePrefsStatusLine('nope')).toBeNull();
  });
});
