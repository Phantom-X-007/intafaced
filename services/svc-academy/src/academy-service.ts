import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { EventBus } from '@intafaced/events';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { AcademyError } from './errors.js';
import { decideSeat, inviteIsLive, needsStakeCheck, type RoomAccessKind } from './access/room-access.js';
import {
  assertUnlocked,
  certificationXp,
  certificationXpKey,
  pathProgress,
  ProgressError,
  type PathItem,
  type PathProgress,
  type XpPolicy,
} from './curriculum/progress.js';
import type { StakeSource } from './stake-source.js';
import { isUsable, type StreamCredential, type StreamProvider } from './stream/provider.js';
import { withAcademySpan } from './tracing.js';

/**
 * ACADEMY (§8.3, §XIII).
 *
 * Two halves of one journey. The LIVE half is lobbies: rooms with capacity
 * tiers, sessions inside them, and who is sitting in one right now. The
 * STRUCTURED half is curriculum: sequenced paths, progress against them, and
 * the certification that comes out the end.
 *
 * The certification is where the two halves reach the rest of the OS. It
 * publishes `intafaced.identity.xp.earned` — the declared way into §4.1's rank
 * ladder, which is where the perks §XIII promises actually live. This service
 * never writes svc-identity's tables (§2), and it never awards a perk itself.
 *
 * NO VALUE MOVES HERE. `academy` is `custodial: false`, this process holds no
 * ledger client, and the only money-shaped number it touches is a room's stake
 * THRESHOLD — compared against svc-token's answer, never stored.
 */

export type RoomKind = 'general' | 'futures' | 'options' | 'meme_war_room' | 'forex' | 'defi_lab' | 'merchant_clinic';
export type SessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type AttendeeRole = 'host' | 'speaker' | 'attendee';
export type ItemKind = 'playbook' | 'workbook' | 'video';

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

export interface CurriculumRecord {
  id: string;
  slug: string;
  title: string;
  track: string;
  blueprintPath: string | null;
  published: boolean;
}

export interface ItemRecord extends PathItem {
  curriculumId: string;
  slug: string;
  title: string;
}

export interface CertificationRecord {
  id: string;
  userId: string;
  curriculumId: string;
  code: string;
  xpAwarded: number;
  awardedAt: Date;
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

interface CurriculumRow {
  id: string;
  slug: string;
  title: string;
  track: string;
  blueprint_path: string | null;
  published: boolean;
}

interface ItemRow {
  id: string;
  curriculum_id: string;
  position: number;
  kind: ItemKind;
  slug: string;
  title: string;
  paper_trading: boolean;
}

interface CertificationRow {
  id: string;
  user_id: string;
  curriculum_id: string;
  code: string;
  xp_awarded: number;
  awarded_at: Date;
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

const toCurriculum = (row: CurriculumRow): CurriculumRecord => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  track: row.track,
  blueprintPath: row.blueprint_path,
  published: row.published,
});

const toItem = (row: ItemRow): ItemRecord => ({
  id: row.id,
  curriculumId: row.curriculum_id,
  position: row.position,
  kind: row.kind,
  slug: row.slug,
  title: row.title,
  paperTrading: row.paper_trading,
});

const toCertification = (row: CertificationRow): CertificationRecord => ({
  id: row.id,
  userId: row.user_id,
  curriculumId: row.curriculum_id,
  code: row.code,
  xpAwarded: row.xp_awarded,
  awardedAt: row.awarded_at,
});

export interface AcademyServiceOptions {
  xp: XpPolicy;
  /** Operational ceiling on a room's own capacity — see env.ts. */
  maxRoomCapacity: number;
}

export class AcademyService {
  constructor(
    private readonly sql: Sql,
    private readonly stakes: StakeSource,
    private readonly stream: StreamProvider,
    private readonly bus: EventBus,
    private readonly options: AcademyServiceOptions,
  ) {}

  // ── Rooms ──────────────────────────────────────────────────────────────────

  async createRoom(input: {
    hostId: string;
    slug: string;
    name: string;
    kind: RoomKind;
    access: RoomAccessKind;
    minStake?: Amount;
    capacity: number;
  }): Promise<RoomRecord> {
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

    const invited =
      room.access === 'invite' && !isHost
        ? inviteIsLive(await this.liveInvite(room.id, input.userId), now)
        : false;

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

  // ── Curriculum ─────────────────────────────────────────────────────────────

  async createCurriculum(input: { slug: string; title: string; track: string; blueprintPath?: string | null }): Promise<CurriculumRecord> {
    const rows = await this.sql<CurriculumRow[]>`
      INSERT INTO academy.curricula (slug, title, track, blueprint_path)
      VALUES (${input.slug}, ${input.title}, ${input.track}, ${input.blueprintPath ?? null})
      RETURNING id, slug, title, track, blueprint_path, published
    `;
    return toCurriculum(rows[0]!);
  }

  async addItem(input: {
    curriculumId: string;
    position: number;
    kind: ItemKind;
    slug: string;
    title: string;
    paperTrading?: boolean;
  }): Promise<ItemRecord> {
    await this.curriculum(input.curriculumId);
    const rows = await this.sql<ItemRow[]>`
      INSERT INTO academy.curriculum_items (curriculum_id, position, kind, slug, title, paper_trading)
      VALUES (${input.curriculumId}, ${input.position}, ${input.kind}, ${input.slug}, ${input.title}, ${input.paperTrading ?? false})
      RETURNING *
    `;
    return toItem(rows[0]!);
  }

  async publish(curriculumId: string): Promise<CurriculumRecord> {
    const items = await this.items(curriculumId);
    if (items.length === 0) {
      // An empty published path would enrol people into nothing and, worse,
      // `pathProgress` reports it 0% forever — so nobody could ever finish it.
      throw new AcademyError('A path with no items cannot be published', 'academy.path_incomplete');
    }
    const rows = await this.sql<CurriculumRow[]>`
      UPDATE academy.curricula SET published = true, updated_at = now() WHERE id = ${curriculumId}
      RETURNING id, slug, title, track, blueprint_path, published
    `;
    return toCurriculum(rows[0]!);
  }

  async curriculum(curriculumId: string): Promise<CurriculumRecord> {
    const rows = await this.sql<CurriculumRow[]>`
      SELECT id, slug, title, track, blueprint_path, published FROM academy.curricula WHERE id = ${curriculumId}
    `;
    const row = rows[0];
    if (!row) throw new AcademyError(`Curriculum ${curriculumId} not found`, 'academy.curriculum_not_found');
    return toCurriculum(row);
  }

  /**
   * Published paths, optionally the ones a Blueprint path sequences.
   *
   * The caller supplies their own `blueprintPath` — read from their own
   * Blueprint, under their own authority. This service never asks svc-blueprint
   * anything about anyone (§2, §10).
   */
  async listCurricula(filter: { blueprintPath?: string } = {}): Promise<CurriculumRecord[]> {
    const rows = filter.blueprintPath
      ? await this.sql<CurriculumRow[]>`
          SELECT id, slug, title, track, blueprint_path, published FROM academy.curricula
           WHERE published = true AND blueprint_path = ${filter.blueprintPath} ORDER BY title ASC
        `
      : await this.sql<CurriculumRow[]>`
          SELECT id, slug, title, track, blueprint_path, published FROM academy.curricula
           WHERE published = true ORDER BY track ASC, title ASC
        `;
    return rows.map(toCurriculum);
  }

  async items(curriculumId: string): Promise<ItemRecord[]> {
    const rows = await this.sql<ItemRow[]>`
      SELECT * FROM academy.curriculum_items WHERE curriculum_id = ${curriculumId} ORDER BY position ASC
    `;
    return rows.map(toItem);
  }

  async enroll(input: { curriculumId: string; userId: string }): Promise<{ enrollmentId: string }> {
    const curriculum = await this.curriculum(input.curriculumId);
    if (!curriculum.published) throw new AcademyError('That path is not published yet', 'academy.curriculum_unpublished');

    const rows = await this.sql<Array<{ id: string }>>`
      INSERT INTO academy.enrollments (curriculum_id, user_id) VALUES (${input.curriculumId}, ${input.userId})
      ON CONFLICT (curriculum_id, user_id) DO UPDATE SET status = 'active'
      RETURNING id
    `;
    return { enrollmentId: rows[0]!.id };
  }

  /**
   * Mark one item done.
   *
   * `assertUnlocked` is what makes this a path rather than a checklist: an item
   * opens only once everything before it is complete. Without it a learner
   * could finish the last workbook first and hold a certification for a
   * sequence they never followed.
   */
  async completeItem(input: { curriculumId: string; userId: string; itemId: string; score?: number | null }): Promise<PathProgress> {
    const enrollment = await this.enrollment(input.curriculumId, input.userId);
    const items = await this.items(input.curriculumId);
    const completed = await this.completedItemIds(enrollment.id);

    try {
      assertUnlocked(items, completed, input.itemId);
    } catch (err) {
      if (err instanceof ProgressError) throw new AcademyError(err.message, err.code);
      throw err;
    }

    await this.sql`
      INSERT INTO academy.item_progress (enrollment_id, item_id, score)
      VALUES (${enrollment.id}, ${input.itemId}, ${input.score ?? null})
      ON CONFLICT (enrollment_id, item_id) DO UPDATE SET score = EXCLUDED.score
    `;

    const progress = pathProgress(items, await this.completedItemIds(enrollment.id));

    if (progress.finished) {
      await this.sql`
        UPDATE academy.enrollments SET status = 'completed', completed_at = COALESCE(completed_at, now()) WHERE id = ${enrollment.id}
      `;
    }

    return progress;
  }

  async progress(curriculumId: string, userId: string): Promise<PathProgress> {
    const enrollment = await this.enrollment(curriculumId, userId);
    return pathProgress(await this.items(curriculumId), await this.completedItemIds(enrollment.id));
  }

  /**
   * Award the certification (§XIII "certification ranks → real perks").
   *
   * ── Ordering: claim the row, then publish ──────────────────────────────────
   *
   * The insert is the claim, and `certifications_pk` is what makes it a claim:
   * one certification per (curriculum, user), forever. Only the insert that
   * WINS publishes the XP, so a double-tap awards once even before the event's
   * own idempotency key gets involved — and the key is what covers a redelivery
   * on the bus. Two lines of defence, because rank inflation is not something
   * anyone can un-ring.
   *
   * If the publish fails the claim is rolled back, so the credential can be
   * re-earned rather than being silently held without the XP it is worth.
   */
  async certify(input: { curriculumId: string; userId: string; code?: string }): Promise<CertificationRecord> {
    const curriculum = await this.curriculum(input.curriculumId);
    const items = await this.items(curriculum.id);
    const enrollment = await this.enrollment(curriculum.id, input.userId);
    const progress = pathProgress(items, await this.completedItemIds(enrollment.id));

    if (!progress.finished) {
      throw new AcademyError(`${progress.completed} of ${progress.total} steps complete`, 'academy.path_incomplete');
    }

    const xpDelta = certificationXp(items, this.options.xp);
    const code = input.code ?? `ACAD-${curriculum.slug.toUpperCase()}`;

    return withAcademySpan(
      'academy.certify',
      { stage: 'certification', operation: 'certify', curriculumId: curriculum.id, userId: input.userId, xpDelta },
      async () => {
        const rows = await this.sql<CertificationRow[]>`
          INSERT INTO academy.certifications (user_id, curriculum_id, code, xp_awarded)
          VALUES (${input.userId}, ${curriculum.id}, ${code}, ${xpDelta})
          ON CONFLICT (curriculum_id, user_id) DO NOTHING
          RETURNING *
        `;

        const fresh = rows[0];
        if (!fresh) {
          // Somebody already holds it. Return theirs — awarding twice would
          // publish the XP twice, and rank does not go backwards.
          const existing = await this.sql<CertificationRow[]>`
            SELECT * FROM academy.certifications WHERE curriculum_id = ${curriculum.id} AND user_id = ${input.userId}
          `;
          return toCertification(existing[0]!);
        }

        try {
          // Published, not called: svc-identity is the only writer to
          // `rank_state`, and `intafaced.identity.xp.earned` is the declared
          // way in (§4.1). The key is a business key, so a redelivered event
          // finds the original award.
          await this.bus.publish(
            'xpEarned',
            {
              userId: input.userId,
              sourceModule: 'academy',
              action: 'certification.awarded',
              xpDelta,
              meta: { curriculumId: curriculum.id, code },
            },
            { idempotencyKey: certificationXpKey(curriculum.id, input.userId) },
          );
        } catch (err) {
          await this.sql`DELETE FROM academy.certifications WHERE id = ${fresh.id}`;
          throw err;
        }

        return toCertification(fresh);
      },
    );
  }

  async certifications(userId: string): Promise<CertificationRecord[]> {
    const rows = await this.sql<CertificationRow[]>`
      SELECT * FROM academy.certifications WHERE user_id = ${userId} ORDER BY awarded_at DESC
    `;
    return rows.map(toCertification);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async enrollment(curriculumId: string, userId: string): Promise<{ id: string }> {
    const rows = await this.sql<Array<{ id: string }>>`
      SELECT id FROM academy.enrollments WHERE curriculum_id = ${curriculumId} AND user_id = ${userId}
    `;
    const row = rows[0];
    if (!row) throw new AcademyError('You are not enrolled in that path', 'academy.not_enrolled');
    return row;
  }

  private async completedItemIds(enrollmentId: string): Promise<Set<string>> {
    const rows = await this.sql<Array<{ item_id: string }>>`
      SELECT item_id FROM academy.item_progress WHERE enrollment_id = ${enrollmentId}
    `;
    return new Set(rows.map((r) => r.item_id));
  }

  private assertHost(ownerId: string, callerId: string, what: 'room' | 'session'): void {
    if (ownerId !== callerId) throw new AcademyError(`You do not host this ${what}`, 'academy.not_host');
  }
}
