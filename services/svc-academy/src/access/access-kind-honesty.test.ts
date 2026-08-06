import { describe, expect, it } from 'vitest';
import {
  roomAccessKindCatalogBoardCard,
  roomAccessKindCatalogStatusLine,
  parseRoomAccessKindCatalogStatusLine,
  roomAccessKindCatalogStatusLineMatches,
  roomAccessKindCatalogStatusLineConsistent,
  roomAccessKindCatalogExportHeader,
  roomAccessKindCatalogExportLines,
  roomAccessKindCatalogExportText,
  isDeclaredRoomAccessKind,
  needsStakeCheckBoard,
  ROOM_ACCESS_KINDS,
} from './access-kind-honesty.js';

describe('L3 wave138 room access kind honesty', () => {
  it('access kind catalog and stake board', () => {
    expect(ROOM_ACCESS_KINDS).toEqual(['free', 'staked', 'invite']);
    expect(roomAccessKindCatalogBoardCard()).toEqual({
      kinds: 3,
      hasFree: 1,
      hasStaked: 1,
      hasInvite: 1,
    });
    expect(roomAccessKindCatalogStatusLine()).toBe('kinds=3 free=1 staked=1 invite=1');
    expect(roomAccessKindCatalogStatusLineMatches()).toBe(true);
    expect(roomAccessKindCatalogStatusLineConsistent(roomAccessKindCatalogStatusLine())).toBe(true);
    expect(roomAccessKindCatalogExportText().startsWith(roomAccessKindCatalogExportHeader())).toBe(true);
    expect(roomAccessKindCatalogExportLines()).toEqual([...ROOM_ACCESS_KINDS]);
    expect(isDeclaredRoomAccessKind('staked')).toBe(true);
    expect(isDeclaredRoomAccessKind('paid')).toBe(false);
    expect(needsStakeCheckBoard('staked', false)).toBe(true);
    expect(needsStakeCheckBoard('staked', true)).toBe(false);
    expect(needsStakeCheckBoard('free', false)).toBe(false);
    expect(parseRoomAccessKindCatalogStatusLine('nope')).toBeNull();
  });
});
