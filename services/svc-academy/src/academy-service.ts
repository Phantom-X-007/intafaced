import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { AcademyError } from './errors.js';
import { decideSeat, inviteIsLive, needsStakeCheck, type RoomAccessKind } from './access/room-access.js';
import { mayHost, type HostRightsSource } from './host-rights.js';
import type { StakeSource } from './stake-source.js';
import { isUsable, type StreamCredential, type StreamProvider } from './stream/provider.js';
import { withAcademySpan } from './tracing.js';

/**
 * ACADEMY LOBBIES (§8.3, §XIII "live session lobbies, capacity tiers").
 *
 * Rooms with capacity tiers, sessions inside them, and who is sitting in one
 * right now. §8.3 names the tiers and this service implements exactly those
 * three — `free`, `staked`, `invite` — in access/room-access.ts, which holds
 * the whole admission rule as one pure function.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * Curriculum READ is a separate pure module (`curriculum/catalog.ts`) wired on
 * the router — not on this class. Progress, certifications and ambassador pay
 * remain absent on purpose:
 *
 *   · FULL DERIV//DESK library (20 playbooks + 3 workbooks) is residual —
 *     proprietary content is not in this monorepo; the thin spine is platform-
 *     native so the list + content path is real rather than empty.
 *   · CERTIFICATIONS need progress tracking against that curriculum.
 *   · AMBASSADOR PAY and lobby subscriptions MOVE VALUE. They need ledger
 *     recipes that do not exist, and a half-built pay path is worse than an
 *     absent one.
 *
 * NO VALUE MOVES HERE. `academy` is `custodial: false`, this process holds no
 * ledger client and no LEDGER_URL, and the only money-shaped number it touches
 * is a room's stake THRESHOLD — compared against svc-token's answer, never
 * stored. It is an `Amount` (scaled bigint) in memory and a decimal string on
 * the wire, like every other amount in the OS.
 */

export type RoomKind = 'general' | 'futures' | 'options' | 'meme_war_room' | 'forex' | 'defi_lab' | 'merchant_clinic';
export type SessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type AttendeeRole = 'host' | 'speaker' | 'attendee';

export interface RoomRecord {
  id: string;
  slug: string;
  name: string;
  kind: RoomKind;
  access: RoomAccessKind;
  minStake: Amount;
  capacity: number;
  hostId: string;
}

export interface SessionRecord {
  id: string;
  roomId: string;
  title: string;
  hostId: string;
  status: SessionStatus;
  startsAt: Date;
  endsAt: Date | null;
  streamProvider: string | null;
  streamRoom: string | null;
  scene: Record<string, unknown>;
}

interface RoomRow {
  id: string;
  slug: string;
  name: string;
  kind: RoomKind;
  access: RoomAccessKind;
  min_stake: string;
  capacity: number;
  host_id: string;
}

interface SessionRow {
  id: string;
  room_id: string;
  title: string;
  host_id: string;
  status: SessionStatus;
  starts_at: Date;
  ends_at: Date | null;
  stream_provider: string | null;
  stream_room: string | null;
  scene: Record<string, unknown>;
}

const toRoom = (row: RoomRow): RoomRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  kind: row.kind,
  access: row.access,
  minStake: parseAmount(row.min_stake),
  capacity: row.capacity,
  hostId: row.host_id,
});

const toSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  roomId: row.room_id,
  title: row.title,
  hostId: row.host_id,
  status: row.status,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  streamProvider: row.stream_provider,
  streamRoom: row.stream_room,
  scene: row.scene,
});

export interface AcademyServiceOptions {
  /** Operational ceiling on a room's own capacity — see env.ts. */
  maxRoomCapacity: number;
}

export class AcademyService {
  constructor(
    private readonly sql: Sql,
    private readonly stakes: StakeSource,
    private readonly hostRights: HostRightsSource,
    private readonly stream: StreamProvider,
    private readonly options: AcademyServiceOptions,
  ) {}

  // ── Rooms ──────────────────────────────────────────────────────────────────

  /**
   * Open a room.
   *
   * The §4.1 host-rights check comes FIRST, before any validation of what the
   * room would look like. Someone who may not host does not need to be told
   * their capacity is too high — and checking the perk before writing anything
   * means an svc-identity outage costs a retry rather than a cleanup
   * (host-rights.ts on why it fails closed).
   */
  async createRoom(input: {
    hostId: string;
    slug: string;
    name: string;
    kind: RoomKind;
    access: RoomAccessKind;
    minStake?: Amount;
    capacity: number;
  }): Promise<RoomRecord> {
    await this.assertMayHost(input.hostId);

    if (input.capacity > this.options.maxRoomCapacity) {
      throw new AcademyError(
        `A lobby cannot seat more than ${this.options.maxRoomCapacity} — presence fans out over the gateway`,
        'academy.room_full',
      );
    }
    // The database asserts this too (`rooms_stake_gate_ck`). Asserting it here
    // as well means the caller gets a sentence rather than a constraint name.
    const minStake = input.access === 'staked' ? (input.minStake ?? 0n) : 0n;
    if (input.access === 'staked' && minStake <= 0n) {
      throw new AcademyError('A staked lobby needs a stake threshold above zero', 'academy.stake_required');
    }

    const rows = await this.sql<RoomRow[]>`
      INSERT INTO academy.rooms (slug, name, kind, access, min_stake, capacity, host_id)
      VALUES (${input.slug}, ${input.name}, ${input.kind}, ${input.access},
              ${formatAmount(minStake)}::numeric, ${input.capacity}, ${input.hostId})
      RETURNING id, slug, name, kind, access, min_stake, capacity, host_id
    `;
    return toRoom(rows[0]!);
  }

  async room(roomId: string): Promise<RoomRecord> {
    const rows = await this.sql<RoomRow[]>`
      SELECT id, slug, name, kind, access, min_stake, capacity, host_id FROM academy.rooms WHERE id = ${roomId}
    `;
    const row = rows[0];
    if (!row) throw new AcademyError(`Room ${roomId} not found`, 'academy.room_not_found');
    return toRoom(row);
  }

  async listRooms(filter: { kind?: RoomKind } = {}): Promise<RoomRecord[]> {
    const rows = filter.kind
      ? await this.sql<RoomRow[]>`
          SELECT id, slug, name, kind, access, min_stake, capacity, host_id
            FROM academy.rooms WHERE kind = ${filter.kind} ORDER BY name ASC
        `
      : await this.sql<RoomRow[]>`
          SELECT id, slug, name, kind, access, min_stake, capacity, host_id FROM academy.rooms ORDER BY kind ASC, name ASC
        `;
    return rows.map(toRoom);
  }

  /** Invite someone into an `invite` room. The host's call, and only theirs. */
  async invite(input: { roomId: string; hostId: string; userId: string; expiresAt?: Date | null }): Promise<void> {
    const room = await this.room(input.roomId);
    this.assertHost(room.hostId, input.hostId, 'room');

    await this.sql`
      INSERT INTO academy.room_invites (room_id, user_id, invited_by, expires_at)
      VALUES (${input.roomId}, ${input.userId}, ${input.hostId}, ${input.expiresAt ?? null})
      ON CONFLICT (room_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at
    `;
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async scheduleSession(input: { roomId: string; hostId: string; title: string; startsAt: Date }): Promise<SessionRecord> {
    const room = await this.room(input.roomId);
    this.assertHost(room.hostId, input.hostId, 'room');

    const rows = await this.sql<SessionRow[]>`
      INSERT INTO academy.sessions (room_id, title, host_id, starts_at)
      VALUES (${input.roomId}, ${input.title}, ${input.hostId}, ${input.startsAt})
      RETURNING *
    `;
    return toSession(rows[0]!);
  }

  async session(sessionId: string): Promise<SessionRecord> {
    const rows = await this.sql<SessionRow[]>`SELECT * FROM academy.sessions WHERE id = ${sessionId}`;
    const row = rows[0];
    if (!row) throw new AcademyError(`Session ${sessionId} not found`, 'academy.session_not_found');
    return toSession(row);
  }

  async listSessions(filter: { roomId?: string; status?: SessionStatus } = {}): Promise<SessionRecord[]> {
    const rows = await this.sql<SessionRow[]>`
      SELECT * FROM academy.sessions
       WHERE (${filter.roomId ?? null}::uuid IS NULL OR room_id = ${filter.roomId ?? null})
         AND (${filter.status ?? null}::text IS NULL OR status::text = ${filter.status ?? null})
       ORDER BY starts_at ASC
    `;
    return rows.map(toSession);
  }

  /**
   * Open the doors.
   *
   * The stream room is opened here rather than at schedule time, so an SFU room
   * exists only while a session is actually running. When no provider is
   * configured the session still goes live as text, presence and the scene
   * canvas — `stream_room` stays null and `streamCredential` says why.
   */
  async startSession(input: { sessionId: string; hostId: string }): Promise<SessionRecord> {
    const session = await this.session(input.sessionId);
    this.assertHost(session.hostId, input.hostId, 'session');
    if (session.status !== 'scheduled') {
      throw new AcademyError(`A ${session.status} session cannot be started`, 'academy.session_not_live');
    }

    return withAcademySpan(
      'academy.session.start',
      { stage: 'session', operation: 'start', sessionId: session.id, roomId: session.roomId, streamProvider: this.stream.id },
      async () => {
        const streamRoom = isUsable(this.stream) ? await this.stream.openRoom(session.id) : null;

        const rows = await this.sql<SessionRow[]>`
          UPDATE academy.sessions
             SET status = 'live', stream_provider = ${streamRoom ? this.stream.id : null},
                 stream_room = ${streamRoom}, updated_at = now()
           WHERE id = ${session.id} AND status = 'scheduled'
          RETURNING *
        `;
        return rows[0] ? toSession(rows[0]) : await this.session(session.id);
      },
    );
  }

  /**
   * End it, and empty the room.
   *
   * Every live attendee is marked as having left in the same transaction that
   * ends the session. Leaving them open would make the next session in the same
   * room inherit an occupancy that nobody is actually occupying.
   */
  async endSession(input: { sessionId: string; hostId: string; now?: Date }): Promise<SessionRecord> {
    const now = input.now ?? new Date();
    const session = await this.session(input.sessionId);
    this.assertHost(session.hostId, input.hostId, 'session');

    if (session.streamRoom) await this.stream.closeRoom(session.streamRoom);

    await transaction(this.sql, async (tx) => {
      await tx`
        UPDATE academy.session_attendees SET left_at = ${now} WHERE session_id = ${session.id} AND left_at IS NULL
      `;
      await tx`
        UPDATE academy.sessions SET status = 'ended', ends_at = ${now}, updated_at = now()
         WHERE id = ${session.id} AND status IN ('scheduled', 'live')
      `;
    });

    return this.session(session.id);
  }

  /** Live attendees. A COUNT, never a maintained counter. */
  async occupancy(sessionId: string, tx: Sql = this.sql): Promise<number> {
    const rows = await tx<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM academy.session_attendees WHERE session_id = ${sessionId} AND left_at IS NULL
    `;
    return Number(rows[0]?.count ?? '0');
  }

  /**
   * Take a seat.
   *
   * ── Why the seat is claimed under a lock ────────────────────────────────────
   *
   * Capacity is only a capacity if two people racing for the last seat cannot
   * both get it. The insert runs inside a transaction that locks the session
   * row first, so the occupancy count and the insert cannot interleave — which
   * is the whole reason `read committed` is correct here (see
   * packages/db/src/connection.ts on when it is, and when it is not).
   *
   * The GATE is evaluated before the lock is taken, deliberately: a stake
   * lookup is a network call, and holding the busiest row in a live lobby
   * across one would serialise every join behind svc-token's latency.
   */
  async join(input: { sessionId: string; userId: string; now?: Date }): Promise<{ role: AttendeeRole }> {
    const now = input.now ?? new Date();
    const session = await this.session(input.sessionId);
    if (session.status !== 'live') throw new AcademyError('That session is not live', 'academy.session_not_live');

    const room = await this.room(session.roomId);
    const isHost = room.hostId === input.userId || session.hostId === input.userId;

    // Only a staked room asks svc-token, so an outage there does not close the
    // free and invite lobbies too.
    const stake = needsStakeCheck(room, isHost) ? await this.stakes.stakeOf(input.userId) : 0n;

    const invited = room.access === 'invite' && !isHost ? inviteIsLive(await this.liveInvite(room.id, input.userId), now) : false;

    return withAcademySpan(
      'academy.session.join',
      { stage: 'lobby', operation: 'join', sessionId: session.id, roomId: room.id, userId: input.userId, capacity: room.capacity },
      async (span) => {
        const role: AttendeeRole = isHost ? 'host' : 'attendee';

        const decision = await transaction(
          this.sql,
          async (tx) => {
            await tx`SELECT id FROM academy.sessions WHERE id = ${session.id} FOR UPDATE`;
            const occupancy = await this.occupancy(session.id, tx);

            const seat = decideSeat(
              { access: room.access, minStake: room.minStake, capacity: room.capacity },
              { occupancy, stake, invited, isHost },
            );
            if (!seat.allowed) return { seat, occupancy };

            await tx`
              INSERT INTO academy.session_attendees (session_id, user_id, role, joined_at)
              VALUES (${session.id}, ${input.userId}, ${role}, ${now})
              ON CONFLICT (session_id, user_id) DO UPDATE SET left_at = NULL, role = EXCLUDED.role
            `;

            if (room.access === 'invite' && !isHost) {
              await tx`
                UPDATE academy.room_invites SET used_at = COALESCE(used_at, ${now})
                 WHERE room_id = ${room.id} AND user_id = ${input.userId}
              `;
            }

            return { seat, occupancy };
          },
          { isolation: 'read committed' },
        );

        span.setAttribute('intafaced.occupancy', decision.occupancy);
        // A refusal is invisible from the outside — nobody files a ticket for a
        // room they could not get into. This attribute is the only place
        // "how many bounced off the stake gate" is a number.
        span.setAttribute('intafaced.decision', decision.seat.allowed ? 'allowed' : decision.seat.code);

        if (!decision.seat.allowed) throw new AcademyError(decision.seat.reason, decision.seat.code);
        return { role };
      },
    );
  }

  async leave(input: { sessionId: string; userId: string; now?: Date }): Promise<void> {
    const now = input.now ?? new Date();
    await this.sql`
      UPDATE academy.session_attendees SET left_at = ${now}
       WHERE session_id = ${input.sessionId} AND user_id = ${input.userId} AND left_at IS NULL
    `;
  }

  /**
   * A join credential for the stream.
   *
   * Separate from `join` on purpose. A seat is granted by this service; a
   * stream credential is granted by the SFU, and when there is no SFU the
   * lobby still runs. Folding the two together would make every text lobby fail
   * to admit anyone the moment streaming was unconfigured.
   *
   * Refuses anyone not actually seated: a credential is a key to a live room.
   */
  async streamCredential(input: { sessionId: string; userId: string }): Promise<StreamCredential> {
    const session = await this.session(input.sessionId);
    if (session.status !== 'live' || !session.streamRoom) {
      throw new AcademyError('That session is not carrying a stream', 'academy.stream_unavailable');
    }

    const rows = await this.sql<Array<{ role: AttendeeRole }>>`
      SELECT role FROM academy.session_attendees
       WHERE session_id = ${session.id} AND user_id = ${input.userId} AND left_at IS NULL
    `;
    const role = rows[0]?.role;
    if (!role) throw new AcademyError('Take a seat in the lobby first', 'academy.session_not_live');

    return this.stream.credential({ sessionId: session.id, streamRoom: session.streamRoom, userId: input.userId, role });
  }

  /**
   * The 2D spatial layer's state (§8.3).
   *
   * Kept serializable and kept whole: the host writes the scene, everyone else
   * reads it. Merging per-attendee edits would need a conflict model this does
   * not have, and half a merge is a room that renders differently for different
   * people.
   */
  async updateScene(input: { sessionId: string; hostId: string; scene: Record<string, unknown> }): Promise<SessionRecord> {
    const session = await this.session(input.sessionId);
    this.assertHost(session.hostId, input.hostId, 'session');

    const rows = await this.sql<SessionRow[]>`
      UPDATE academy.sessions SET scene = ${this.sql.json(input.scene as never)}, updated_at = now() WHERE id = ${session.id} RETURNING *
    `;
    return toSession(rows[0]!);
  }

  private async liveInvite(roomId: string, userId: string): Promise<{ expiresAt: Date | null } | null> {
    const rows = await this.sql<Array<{ expires_at: Date | null }>>`
      SELECT expires_at FROM academy.room_invites WHERE room_id = ${roomId} AND user_id = ${userId}
    `;
    return rows[0] ? { expiresAt: rows[0].expires_at } : null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private assertHost(ownerId: string, callerId: string, what: 'room' | 'session'): void {
    if (ownerId !== callerId) throw new AcademyError(`You do not host this ${what}`, 'academy.not_host');
  }

  /**
   * May this account host at all? (§4.1 `rank_thresholds.perks.lobbyHostRights`.)
   *
   * Asked once, on `createRoom`, and NOT on the operations that follow —
   * `invite`, `scheduleSession`, `startSession`, `endSession` and `updateScene`
   * all check `assertHost` against a room this account already owns.
   *
   * That asymmetry is deliberate. Rank can fall, and a host whose rank slipped
   * mid-residency must still be able to end the session they are running and
   * empty the room. Re-checking the perk on `endSession` would strand live
   * attendees in a session nobody is allowed to close — the perk gates opening
   * a NEW room, not operating one that exists.
   */
  private async assertMayHost(userId: string): Promise<void> {
    const perks = await this.hostRights.perksOf(userId);
    if (!mayHost(perks)) {
      throw new AcademyError(
        'Hosting a lobby is a rank perk — your rank does not carry lobby host rights yet (§4.1)',
        'academy.host_rights_required',
      );
    }
  }
}
