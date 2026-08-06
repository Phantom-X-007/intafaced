/**
 * Academy L3 — pure room access kind catalog honesty (no seat invent).
 *
 * Mirrors room-access.ts RoomAccessKind.
 */

export const ROOM_ACCESS_KINDS = ['free', 'staked', 'invite'] as const;
export type RoomAccessKindId = (typeof ROOM_ACCESS_KINDS)[number];

/** L3 — catalog board. */
export function roomAccessKindCatalogBoardCard(): {
  readonly kinds: number;
  readonly hasFree: number;
  readonly hasStaked: number;
  readonly hasInvite: number;
} {
  return {
    kinds: ROOM_ACCESS_KINDS.length,
    hasFree: ROOM_ACCESS_KINDS.includes('free') ? 1 : 0,
    hasStaked: ROOM_ACCESS_KINDS.includes('staked') ? 1 : 0,
    hasInvite: ROOM_ACCESS_KINDS.includes('invite') ? 1 : 0,
  };
}

/** L3 — status line. */
export function roomAccessKindCatalogStatusLine(): string {
  const c = roomAccessKindCatalogBoardCard();
  return `kinds=${c.kinds} free=${c.hasFree} staked=${c.hasStaked} invite=${c.hasInvite}`;
}

/** L3 — parse status. */
export function parseRoomAccessKindCatalogStatusLine(line: string): {
  readonly kinds: number;
  readonly free: number;
  readonly staked: number;
  readonly invite: number;
} | null {
  const m = line.trim().match(/^kinds=(\d+) free=([01]) staked=([01]) invite=([01])$/);
  if (!m) return null;
  return {
    kinds: Number(m[1]),
    free: Number(m[2]),
    staked: Number(m[3]),
    invite: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function roomAccessKindCatalogStatusLineMatches(): boolean {
  const p = parseRoomAccessKindCatalogStatusLine(roomAccessKindCatalogStatusLine());
  if (!p) return false;
  const c = roomAccessKindCatalogBoardCard();
  return (
    p.kinds === c.kinds &&
    p.free === c.hasFree &&
    p.staked === c.hasStaked &&
    p.invite === c.hasInvite
  );
}

/** L3 — three kinds. */
export function roomAccessKindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRoomAccessKindCatalogStatusLine(line);
  if (!p) return false;
  return p.kinds === 3 && p.free === 1 && p.staked === 1 && p.invite === 1;
}

/** L3 — export header. */
export function roomAccessKindCatalogExportHeader(): string {
  return 'kind';
}

/** L3 — export lines. */
export function roomAccessKindCatalogExportLines(): readonly string[] {
  return [...ROOM_ACCESS_KINDS];
}

/** L3 — full export. */
export function roomAccessKindCatalogExportText(): string {
  return [roomAccessKindCatalogExportHeader(), ...roomAccessKindCatalogExportLines()].join('\n');
}

/** L3 — kind declared. */
export function isDeclaredRoomAccessKind(kind: string): boolean {
  return (ROOM_ACCESS_KINDS as readonly string[]).includes(kind);
}

/** L3 — stake check needed for staked non-host. */
export function needsStakeCheckBoard(access: RoomAccessKindId, isHost: boolean): boolean {
  return access === 'staked' && !isHost;
}
