/**
 * Academy L3 — pure lobby room-kind catalog honesty.
 *
 * Mirrors router.ts roomKind: general | futures | options | meme_war_room |
 * forex | defi_lab | merchant_clinic.
 * Does not invent seat / stream product law.
 */

export const ROOM_KINDS = ['general', 'futures', 'options', 'meme_war_room', 'forex', 'defi_lab', 'merchant_clinic'] as const;
export type RoomKindId = (typeof ROOM_KINDS)[number];

/** L3 — catalog board. */
export function roomKindCatalogBoardCard(): {
  readonly kinds: number;
  readonly hasGeneral: number;
  readonly hasMemeWarRoom: number;
  readonly hasMerchantClinic: number;
} {
  return {
    kinds: ROOM_KINDS.length,
    hasGeneral: ROOM_KINDS.includes('general') ? 1 : 0,
    hasMemeWarRoom: ROOM_KINDS.includes('meme_war_room') ? 1 : 0,
    hasMerchantClinic: ROOM_KINDS.includes('merchant_clinic') ? 1 : 0,
  };
}

/** L3 — status line. */
export function roomKindCatalogStatusLine(): string {
  const c = roomKindCatalogBoardCard();
  return `kinds=${c.kinds} general=${c.hasGeneral} meme_war_room=${c.hasMemeWarRoom} merchant_clinic=${c.hasMerchantClinic}`;
}

/** L3 — parse status. */
export function parseRoomKindCatalogStatusLine(line: string): {
  readonly kinds: number;
  readonly general: number;
  readonly memeWarRoom: number;
  readonly merchantClinic: number;
} | null {
  const m = line.trim().match(/^kinds=(\d+) general=([01]) meme_war_room=([01]) merchant_clinic=([01])$/);
  if (!m) return null;
  return {
    kinds: Number(m[1]),
    general: Number(m[2]),
    memeWarRoom: Number(m[3]),
    merchantClinic: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function roomKindCatalogStatusLineMatches(): boolean {
  const p = parseRoomKindCatalogStatusLine(roomKindCatalogStatusLine());
  if (!p) return false;
  const c = roomKindCatalogBoardCard();
  return (
    p.kinds === c.kinds && p.general === c.hasGeneral && p.memeWarRoom === c.hasMemeWarRoom && p.merchantClinic === c.hasMerchantClinic
  );
}

/** L3 — seven kinds. */
export function roomKindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRoomKindCatalogStatusLine(line);
  if (!p) return false;
  return p.kinds === 7 && p.general === 1 && p.memeWarRoom === 1 && p.merchantClinic === 1;
}

/** L3 — export header. */
export function roomKindCatalogExportHeader(): string {
  return 'kind';
}

/** L3 — export lines. */
export function roomKindCatalogExportLines(): readonly string[] {
  return [...ROOM_KINDS];
}

/** L3 — full export. */
export function roomKindCatalogExportText(): string {
  return [roomKindCatalogExportHeader(), ...roomKindCatalogExportLines()].join('\n');
}

/** L3 — kind declared. */
export function isDeclaredRoomKind(kind: string): boolean {
  return (ROOM_KINDS as readonly string[]).includes(kind);
}
