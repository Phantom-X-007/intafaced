import type { Amount } from '@intafaced/ledger-client';

/**
 * WHO MAY TAKE A SEAT (§XIII "live session lobbies, capacity tiers").
 *
 * A pure decision over facts the caller has already gathered: the room's terms,
 * how full it is, what the caller stakes, and whether they hold an invitation.
 * No I/O, so the rule is one function everything reads — the lobby endpoint,
 * the "can I join" badge in the UI, and the tests below cannot drift apart.
 *
 * The order of the checks is deliberate and it is the accessible one: the GATE
 * is checked before the SEAT COUNT. Telling someone a room is full when they
 * were never eligible sends them back to wait for a seat they could not use;
 * telling them they need to stake first is something they can act on.
 */

export type RoomAccessKind = 'free' | 'staked' | 'invite';

export interface RoomTerms {
  access: RoomAccessKind;
  /** Only meaningful for `staked`. A threshold, never a balance (schema.ts). */
  minStake: Amount;
  capacity: number;
}

export interface SeatRequest {
  /** Live attendees — those who have joined and not left. */
  occupancy: number;
  /** The caller's stake, from svc-token. */
  stake: Amount;
  /** Whether the caller holds an invitation that has not expired. */
  invited: boolean;
  /** The room's host. Always admitted to their own room. */
  isHost: boolean;
}

export type SeatDecision =
  { allowed: true } | { allowed: false; code: 'academy.stake_required' | 'academy.invite_required' | 'academy.room_full'; reason: string };

export function decideSeat(room: RoomTerms, request: SeatRequest): SeatDecision {
  /**
   * The host is admitted unconditionally, and that is not a courtesy.
   *
   * A host who reconnects after a dropped connection would otherwise find their
   * own session full — the seat they vacated having been taken while they were
   * away — and the room would be left with no stage. It is also why the host
   * bypasses the gate: an ambassador running a staked room does not have to
   * stake into it.
   */
  if (request.isHost) return { allowed: true };

  if (room.access === 'staked' && request.stake < room.minStake) {
    return {
      allowed: false,
      code: 'academy.stake_required',
      reason: 'This lobby is open to stakers. Stake to take a seat.',
    };
  }

  if (room.access === 'invite' && !request.invited) {
    return {
      allowed: false,
      code: 'academy.invite_required',
      reason: 'This lobby is invite-only.',
    };
  }

  if (request.occupancy >= room.capacity) {
    return { allowed: false, code: 'academy.room_full', reason: 'This lobby is full.' };
  }

  return { allowed: true };
}

/**
 * Is an invitation live at `now`?
 *
 * A used invitation still admits its holder: `used_at` records the first time
 * it was taken up, not a revocation. Anything else would eject somebody whose
 * connection dropped mid-session, which is the same failure the host bypass
 * above exists to avoid.
 */
export function inviteIsLive(invite: { expiresAt: Date | null } | null, now: Date): boolean {
  if (!invite) return false;
  return invite.expiresAt === null || invite.expiresAt > now;
}

/**
 * Does this room need a stake lookup at all?
 *
 * Asked before the call, so a free or invite-only lobby does not fail to admit
 * anyone when svc-token is unreachable. The stake gate fails closed (see
 * stake-source.ts) — this is what keeps that strictness confined to the rooms
 * that actually depend on it.
 */
export function needsStakeCheck(room: { access: RoomAccessKind }, isHost: boolean): boolean {
  return !isHost && room.access === 'staked';
}

/** L3 — room access kinds catalog. */
export const ROOM_ACCESS_KINDS: readonly RoomAccessKind[] = ['free', 'staked', 'invite'];

/** L3 — true when kind is known. */
export function isRoomAccessKind(value: string): value is RoomAccessKind {
  return (ROOM_ACCESS_KINDS as readonly string[]).includes(value);
}

/** L3 — seat decision board card. */
export function seatDecisionBoardCard(decision: SeatDecision): {
  readonly allowed: boolean;
  readonly code: string | null;
  readonly refused: boolean;
} {
  if (decision.allowed) {
    return { allowed: true, code: null, refused: false };
  }
  return { allowed: false, code: decision.code, refused: true };
}

/** L3 — status line. */
export function seatDecisionStatusLine(decision: SeatDecision): string {
  const c = seatDecisionBoardCard(decision);
  return `allowed=${c.allowed ? '1' : '0'} code=${c.code ?? '-'} refused=${c.refused ? '1' : '0'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseSeatDecisionStatusLine(
  line: string,
): { readonly allowed: boolean; readonly code: string | null; readonly refused: boolean } | null {
  const m = line.trim().match(/^allowed=([01]) code=(\S+) refused=([01])$/);
  if (!m) return null;
  return {
    allowed: m[1] === '1',
    code: m[2] === '-' ? null : m[2]!,
    refused: m[3] === '1',
  };
}

/** L3 — true when status matches decision. */
export function seatDecisionStatusLineMatches(decision: SeatDecision): boolean {
  const p = parseSeatDecisionStatusLine(seatDecisionStatusLine(decision));
  if (!p) return false;
  const c = seatDecisionBoardCard(decision);
  return p.allowed === c.allowed && p.code === c.code && p.refused === c.refused;
}

/** L3 — true when allowed implies no code and refused equals !allowed. */
export function seatDecisionStatusLineConsistent(line: string): boolean {
  const p = parseSeatDecisionStatusLine(line);
  if (!p) return false;
  if (p.allowed) return p.code === null && p.refused === false;
  return p.code !== null && p.refused === true;
}

/** L3 — export header. */
export function seatDecisionExportHeader(): string {
  return 'allowed,code,refused';
}

/** L3 — export line. */
export function seatDecisionExportLine(decision: SeatDecision): string {
  const c = seatDecisionBoardCard(decision);
  return `${c.allowed ? '1' : '0'},${c.code ?? ''},${c.refused ? '1' : '0'}`;
}

/** L3 — full export. */
export function seatDecisionExportText(decision: SeatDecision): string {
  return [seatDecisionExportHeader(), seatDecisionExportLine(decision)].join('\n');
}

/** L3 — access kind catalog board. */
export function roomAccessKindBoardCard(): {
  readonly total: number;
  readonly kinds: readonly RoomAccessKind[];
} {
  return { total: ROOM_ACCESS_KINDS.length, kinds: ROOM_ACCESS_KINDS };
}

/** L3 — true when stake check is required for non-host staked room. */
export function seatNeedsStakeHonesty(room: { access: RoomAccessKind }, isHost: boolean): boolean {
  return needsStakeCheck(room, isHost);
}
