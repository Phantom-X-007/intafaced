import { describe, expect, it } from 'vitest';
import {
  streamRoleCatalogBoardCard,
  streamRoleCatalogStatusLine,
  parseStreamRoleCatalogStatusLine,
  streamRoleCatalogStatusLineMatches,
  streamRoleCatalogStatusLineConsistent,
  streamProviderBoardCard,
  streamProviderStatusLine,
  parseStreamProviderStatusLine,
  streamProviderStatusLineMatches,
  streamProviderStatusLineConsistent,
  isDeclaredStreamRole,
  streamRoleCatalogExportHeader,
  streamRoleCatalogExportText,
  STREAM_ROLES,
} from './stream-role-honesty.js';

describe('L3 wave135 stream role honesty', () => {
  it('role catalog and null provider boards', () => {
    expect(STREAM_ROLES).toEqual(['host', 'speaker', 'attendee']);
    expect(streamRoleCatalogBoardCard()).toEqual({
      roles: 3,
      hasHost: 1,
      hasAttendee: 1,
    });
    expect(streamRoleCatalogStatusLineMatches()).toBe(true);
    expect(streamRoleCatalogStatusLineConsistent(streamRoleCatalogStatusLine())).toBe(true);
    expect(streamRoleCatalogExportText().startsWith(streamRoleCatalogExportHeader())).toBe(true);
    expect(isDeclaredStreamRole('speaker')).toBe(true);
    expect(isDeclaredStreamRole('viewer')).toBe(false);
    expect(parseStreamRoleCatalogStatusLine('nope')).toBeNull();

    const nullProv = { providerId: 'null', usable: false };
    expect(streamProviderBoardCard(nullProv)).toEqual({
      provider: 'null',
      usable: 0,
      refuses: 1,
    });
    expect(streamProviderStatusLine(nullProv)).toBe('provider=null usable=0 refuses=1');
    expect(streamProviderStatusLineMatches(nullProv)).toBe(true);
    expect(streamProviderStatusLineConsistent(streamProviderStatusLine(nullProv))).toBe(true);
    expect(parseStreamProviderStatusLine('nope')).toBeNull();
  });
});
