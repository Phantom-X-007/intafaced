/**
 * Academy L3 — pure seat refuse-code catalog honesty (no invent seats).
 *
 * Codes: stake_required | invite_required | room_full.
 */

export const SEAT_REFUSE_CODES = [
  'academy.stake_required',
  'academy.invite_required',
  'academy.room_full',
] as const;
export type SeatRefuseCodeId = (typeof SEAT_REFUSE_CODES)[number];

export type SeatDecisionBoardInput =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: SeatRefuseCodeId };

/** L3 — catalog board. */
export function seatRefuseCatalogBoardCard(): {
  readonly codes: number;
  readonly hasStake: number;
  readonly hasInvite: number;
  readonly hasFull: number;
} {
  return {
    codes: SEAT_REFUSE_CODES.length,
    hasStake: SEAT_REFUSE_CODES.includes('academy.stake_required') ? 1 : 0,
    hasInvite: SEAT_REFUSE_CODES.includes('academy.invite_required') ? 1 : 0,
    hasFull: SEAT_REFUSE_CODES.includes('academy.room_full') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function seatRefuseCatalogStatusLine(): string {
  const c = seatRefuseCatalogBoardCard();
  return `codes=${c.codes} stake=${c.hasStake} invite=${c.hasInvite} full=${c.hasFull}`;
}

/** L3 — parse catalog. */
export function parseSeatRefuseCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly stake: number;
  readonly invite: number;
  readonly full: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) stake=([01]) invite=([01]) full=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    stake: Number(m[2]),
    invite: Number(m[3]),
    full: Number(m[4]),
  };
}

/** L3 — true when catalog matches. */
export function seatRefuseCatalogStatusLineMatches(): boolean {
  const p = parseSeatRefuseCatalogStatusLine(seatRefuseCatalogStatusLine());
  if (!p) return false;
  const c = seatRefuseCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.stake === c.hasStake &&
    p.invite === c.hasInvite &&
    p.full === c.hasFull
  );
}

/** L3 — three refuse codes. */
export function seatRefuseCatalogStatusLineConsistent(line: string): boolean {
  const p = parseSeatRefuseCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 3 && p.stake === 1 && p.invite === 1 && p.full === 1;
}

/** L3 — decision board. */
export function seatDecisionSimpleBoardCard(decision: SeatDecisionBoardInput): {
  readonly allowed: number;
  readonly code: string;
} {
  if (decision.allowed) return { allowed: 1, code: '-' };
  return { allowed: 0, code: decision.code };
}

/** L3 — decision status line. */
export function seatDecisionSimpleStatusLine(decision: SeatDecisionBoardInput): string {
  const c = seatDecisionSimpleBoardCard(decision);
  return `allowed=${c.allowed} code=${c.code}`;
}

/** L3 — parse decision. */
export function parseSeatDecisionSimpleStatusLine(line: string): {
  readonly allowed: number;
  readonly code: string;
} | null {
  const m = line.trim().match(/^allowed=([01]) code=([a-z0-9._-]+)$/);
  if (!m) return null;
  return { allowed: Number(m[1]), code: m[2]! };
}

/** L3 — true when decision matches. */
export function seatDecisionSimpleStatusLineMatches(decision: SeatDecisionBoardInput): boolean {
  const p = parseSeatDecisionSimpleStatusLine(seatDecisionSimpleStatusLine(decision));
  if (!p) return false;
  const c = seatDecisionSimpleBoardCard(decision);
  return p.allowed === c.allowed && p.code === c.code;
}

/** L3 — allowed implies code dash. */
export function seatDecisionSimpleStatusLineConsistent(line: string): boolean {
  const p = parseSeatDecisionSimpleStatusLine(line);
  if (!p) return false;
  if (p.allowed === 1) return p.code === '-';
  return p.code !== '-';
}

/** L3 — export header. */
export function seatDecisionSimpleExportHeader(): string {
  return 'allowed,code';
}

/** L3 — export line. */
export function seatDecisionSimpleExportLine(decision: SeatDecisionBoardInput): string {
  const c = seatDecisionSimpleBoardCard(decision);
  return `${c.allowed},${c.code}`;
}

/** L3 — full export. */
export function seatDecisionSimpleExportText(decision: SeatDecisionBoardInput): string {
  return [seatDecisionSimpleExportHeader(), seatDecisionSimpleExportLine(decision)].join('\n');
}

/** L3 — code declared. */
export function isDeclaredSeatRefuseCode(code: string): boolean {
  return (SEAT_REFUSE_CODES as readonly string[]).includes(code);
}
