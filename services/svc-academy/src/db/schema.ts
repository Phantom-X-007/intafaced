import { index, integer, jsonb, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * ACADEMY LOBBIES (§8.3, §XIII "live session lobbies, capacity tiers").
 *
 * Four tables: rooms and their access terms, invitations into the invite-only
 * ones, the sessions that run inside a room, and who is sitting in one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO MONEY MOVES IN THIS SERVICE, AND NO TABLE HERE COULD RECORD IT.
 *
 * `academy` is `custodial: false` in the module registry. The one money-shaped
 * column in this file is `rooms.min_stake`, and it is a THRESHOLD, not a
 * balance: svc-token owns the stake, this service asks whether a caller clears
 * a number, and the answer is never stored. It is still `numeric(38,18)` and
 * still read as a decimal string, because a threshold compared against a stake
 * has to be the same kind of number as the stake.
 *
 * Ambassador pay and lobby subscriptions — the §8.3 items that DO move value —
 * are deliberately not built here (see README). They need ledger recipes that
 * do not exist, and a half-built pay path is worse than an absent one.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const academy = pgSchema('academy');

/** §XIII specialist rooms — the taxonomy is data, so a new room type is a row. */
export const roomKindEnum = academy.enum('room_kind', [
  'general',
  'futures',
  'options',
  'meme_war_room',
  'forex',
  'defi_lab',
  'merchant_clinic',
]);

/** §XIII capacity tiers: open to all, gated on stake, or gated on an invite. */
export const roomAccessEnum = academy.enum('room_access', ['free', 'staked', 'invite']);

export const sessionStatusEnum = academy.enum('session_status', ['scheduled', 'live', 'ended', 'cancelled']);
export const attendeeRoleEnum = academy.enum('attendee_role', ['host', 'speaker', 'attendee']);

export const rooms = academy.table(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    kind: roomKindEnum('kind').notNull().default('general'),
    access: roomAccessEnum('access').notNull().default('free'),
    /**
     * The stake a caller must clear for a `staked` room. A THRESHOLD compared
     * against `token.stakeOf`, never a balance this service holds. Zero and
     * meaningless for the other two access kinds.
     */
    minStake: amount('min_stake').notNull().default('0'),
    /** Seats. The lobby refuses the seat that would exceed it — see access.ts. */
    capacity: integer('capacity').notNull(),
    /** The ambassador or operator who runs the room. Always admitted to their own. */
    hostId: uuid('host_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('rooms_slug_idx').on(t.slug), index('rooms_kind_idx').on(t.kind, t.access)],
);

/**
 * An invitation to an `invite` room.
 *
 * Rows rather than a boolean on a membership table, because an invitation is an
 * event with a lifetime: who granted it, when it stops working, and whether it
 * has been taken up. A `used_at` that is set is a record, not a revocation —
 * an invitation admits its holder for as long as it has not expired.
 */
export const roomInvites = academy.table(
  'room_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    invitedBy: uuid('invited_by').notNull(),
    /** Null never expires. A room can invite someone permanently. */
    expiresAt: tstz('expires_at'),
    usedAt: tstz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('room_invites_pk').on(t.roomId, t.userId), index('room_invites_user_idx').on(t.userId)],
);

/**
 * One live session in a room (§8.3 stage + chat + shared charts).
 *
 * `scene` holds the 2D spatial layer's state (§8.3: "spatial layer v1 = 2D
 * navigable room canvas… VR-ready = keep scene state serializable"). It is
 * jsonb precisely so the VR version is a different renderer over the same rows
 * rather than a migration.
 *
 * `stream_provider` and `stream_room` name the SFU that carries the audio and
 * video. They are nullable because a session may exist before streaming is
 * configured, and this service refuses to invent a join token when it is not
 * (SOCKET §13 `socket.stream-provider` — see stream/provider.ts).
 */
export const sessions = academy.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    hostId: uuid('host_id').notNull(),
    status: sessionStatusEnum('status').notNull().default('scheduled'),
    startsAt: tstz('starts_at').notNull(),
    endsAt: tstz('ends_at'),
    streamProvider: text('stream_provider'),
    streamRoom: text('stream_room'),
    /** Serializable scene state — avatars, stage, presence. Never user content. */
    scene: jsonb('scene').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_room_idx').on(t.roomId, t.startsAt), index('sessions_status_idx').on(t.status, t.startsAt)],
);

/**
 * Who is in a session, and who was.
 *
 * `left_at IS NULL` is presence — the count the capacity check reads. It is a
 * table rather than a number on `sessions` for the same reason svc-bank has no
 * `total_deposited`: a maintained counter is the single most certain thing in a
 * service to drift, and occupancy is one `COUNT(*)` away.
 */
export const sessionAttendees = academy.table(
  'session_attendees',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: attendeeRoleEnum('role').notNull().default('attendee'),
    joinedAt: createdAt(),
    leftAt: tstz('left_at'),
  },
  (t) => [uniqueIndex('session_attendees_pk').on(t.sessionId, t.userId), index('session_attendees_live_idx').on(t.sessionId, t.leftAt)],
);

export const schema = { rooms, roomInvites, sessions, sessionAttendees };
