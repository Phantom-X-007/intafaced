import { describe, expect, it } from 'vitest';
import {
  roomKindCatalogBoardCard,
  roomKindCatalogStatusLine,
  parseRoomKindCatalogStatusLine,
  roomKindCatalogStatusLineMatches,
  roomKindCatalogStatusLineConsistent,
  roomKindCatalogExportHeader,
  roomKindCatalogExportLines,
  roomKindCatalogExportText,
  isDeclaredRoomKind,
  ROOM_KINDS,
} from './room-kind-honesty.js';

describe('L3 wave164 room-kind catalog honesty', () => {
  it('kind catalog boards', () => {
    expect(ROOM_KINDS).toHaveLength(7);
    expect(ROOM_KINDS[0]).toBe('general');
    expect(roomKindCatalogBoardCard()).toEqual({
      kinds: 7,
      hasGeneral: 1,
      hasMemeWarRoom: 1,
      hasMerchantClinic: 1,
    });
    expect(roomKindCatalogStatusLine()).toBe('kinds=7 general=1 meme_war_room=1 merchant_clinic=1');
    expect(roomKindCatalogStatusLineMatches()).toBe(true);
    expect(roomKindCatalogStatusLineConsistent(roomKindCatalogStatusLine())).toBe(true);
    expect(roomKindCatalogExportText().startsWith(roomKindCatalogExportHeader())).toBe(true);
    expect(roomKindCatalogExportLines()).toEqual([...ROOM_KINDS]);
    expect(isDeclaredRoomKind('defi_lab')).toBe(true);
    expect(isDeclaredRoomKind('private')).toBe(false);
    expect(parseRoomKindCatalogStatusLine('nope')).toBeNull();
  });
});
