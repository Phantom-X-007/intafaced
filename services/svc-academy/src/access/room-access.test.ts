import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { decideSeat, inviteIsLive, needsStakeCheck, type RoomTerms, type SeatRequest } from './room-access.js';

/**
 * WHO GETS A SEAT (§8.3 "capacity tiers: free/staked/invite").
 *
 * The gate and the seat count are two different refusals and the tests keep
 * them apart on purpose: which one a caller is told decides whether they go and
 * stake or go and wait.
 */

const room = (over: Partial<RoomTerms> = {}): RoomTerms => ({
  access: 'free',
  minStake: 0n,
  capacity: 10,
  ...over,
});

const seat = (over: Partial<SeatRequest> = {}): SeatRequest => ({
  occupancy: 0,
  stake: 0n,
  invited: false,
  isHost: false,
  ...over,
});

describe('decideSeat — free rooms', () => {
  it('admits anyone while there is room', () => {
    expect(decideSeat(room(), seat())).toEqual({ allowed: true });
  });

  it('refuses once the room is at capacity', () => {
    expect(decideSeat(room({ capacity: 2 }), seat({ occupancy: 2 }))).toMatchObject({
      allowed: false,
      code: 'academy.room_full',
    });
  });

  /** Occupancy above capacity is a room that shrank, not a room with space. */
  it('refuses when occupancy has somehow exceeded capacity', () => {
    expect(decideSeat(room({ capacity: 2 }), seat({ occupancy: 5 }))).toMatchObject({
      allowed: false,
      code: 'academy.room_full',
    });
  });
});

describe('decideSeat — staked rooms', () => {
  const staked = room({ access: 'staked', minStake: amt('1000') });

  it('refuses a caller below the threshold', () => {
    expect(decideSeat(staked, seat({ stake: amt('999.999999999999999999') }))).toMatchObject({
      allowed: false,
      code: 'academy.stake_required',
    });
  });

  /** The threshold is inclusive — staking exactly what is asked is enough. */
  it('admits a caller staking exactly the threshold', () => {
    expect(decideSeat(staked, seat({ stake: amt('1000') }))).toEqual({ allowed: true });
  });

  it('admits a caller above the threshold', () => {
    expect(decideSeat(staked, seat({ stake: amt('5000') }))).toEqual({ allowed: true });
  });

  /**
   * The ordering that makes the refusal actionable: an ineligible caller is told
   * to stake, not that the room is full. Being told "full" would send them back
   * to wait for a seat they still could not take.
   */
  it('reports the stake gate ahead of the seat count when both fail', () => {
    expect(decideSeat(room({ access: 'staked', minStake: amt('1000'), capacity: 1 }), seat({ occupancy: 1, stake: 0n }))).toMatchObject({
      allowed: false,
      code: 'academy.stake_required',
    });
  });
});

describe('decideSeat — invite rooms', () => {
  const invite = room({ access: 'invite' });

  it('refuses a caller without an invitation', () => {
    expect(decideSeat(invite, seat())).toMatchObject({ allowed: false, code: 'academy.invite_required' });
  });

  it('admits an invited caller', () => {
    expect(decideSeat(invite, seat({ invited: true }))).toEqual({ allowed: true });
  });

  it('still refuses an invited caller when the room is full', () => {
    expect(decideSeat(room({ access: 'invite', capacity: 1 }), seat({ invited: true, occupancy: 1 }))).toMatchObject({
      allowed: false,
      code: 'academy.room_full',
    });
  });
});

describe('decideSeat — the host', () => {
  /**
   * A host who drops and reconnects must not find their own session full — the
   * seat they vacated having been taken while they were away would leave the
   * room with no stage.
   */
  it('admits the host into their own full room', () => {
    expect(decideSeat(room({ capacity: 1 }), seat({ occupancy: 1, isHost: true }))).toEqual({ allowed: true });
  });

  it('admits the host of a staked room without them staking into it', () => {
    expect(decideSeat(room({ access: 'staked', minStake: amt('100000') }), seat({ isHost: true }))).toEqual({ allowed: true });
  });

  it('admits the host of an invite room without an invitation', () => {
    expect(decideSeat(room({ access: 'invite' }), seat({ isHost: true }))).toEqual({ allowed: true });
  });
});

describe('inviteIsLive', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');

  it('treats a missing invitation as not live', () => {
    expect(inviteIsLive(null, now)).toBe(false);
  });

  it('treats an invitation that never expires as live', () => {
    expect(inviteIsLive({ expiresAt: null }, now)).toBe(true);
  });

  it('treats a future expiry as live and a past one as not', () => {
    expect(inviteIsLive({ expiresAt: new Date('2026-07-02T00:00:00.000Z') }, now)).toBe(true);
    expect(inviteIsLive({ expiresAt: new Date('2026-06-30T00:00:00.000Z') }, now)).toBe(false);
  });

  /** Expiry is exclusive: an invitation is dead at the instant it expires. */
  it('treats an invitation expiring exactly now as not live', () => {
    expect(inviteIsLive({ expiresAt: now }, now)).toBe(false);
  });
});

describe('needsStakeCheck', () => {
  /**
   * The stake gate fails closed (stake-source.ts). Asking only when the room
   * actually gates on a stake is what stops an unreachable svc-token from
   * emptying the free and invite-only lobbies too.
   */
  it('asks only for staked rooms', () => {
    expect(needsStakeCheck({ access: 'staked' }, false)).toBe(true);
    expect(needsStakeCheck({ access: 'free' }, false)).toBe(false);
    expect(needsStakeCheck({ access: 'invite' }, false)).toBe(false);
  });

  it('never asks for the host, who bypasses the gate anyway', () => {
    expect(needsStakeCheck({ access: 'staked' }, true)).toBe(false);
  });
});
