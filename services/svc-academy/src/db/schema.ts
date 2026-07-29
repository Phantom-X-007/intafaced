import { boolean, index, integer, jsonb, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { amount, createdAt, tstz, updatedAt } from '@intafaced/db';

/**
 * ACADEMY (§8.3, §XIII).
 *
 * Two halves that share a schema because they share a user's journey: the LIVE
 * half (rooms, sessions, who is in them) and the STRUCTURED half (curriculum
 * paths, progress, certifications).
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
export const itemKindEnum = academy.enum('curriculum_item_kind', ['playbook', 'workbook', 'video']);
export const enrollmentStatusEnum = academy.enum('enrollment_status', ['active', 'completed', 'abandoned']);

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

/**
 * A structured path (§XIII "structured paths, Blueprint-sequenced").
 *
 * `blueprint_path` is the curriculum path name svc-blueprint's profile carries.
 * It is a plain string and NOT a foreign key into anything: §2 forbids reading
 * another service's tables, and §10 keeps profile content out of this schema
 * entirely. Matching a user to a path is a comparison the caller makes with
 * their own Blueprint, under their own authority.
 */
export const curricula = academy.table(
  'curricula',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    track: text('track').notNull(),
    blueprintPath: text('blueprint_path'),
    /** Unpublished paths are visible to their authors only. */
    published: boolean('published').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('curricula_slug_idx').on(t.slug), index('curricula_path_idx').on(t.blueprintPath, t.published)],
);

/**
 * One playbook, workbook or video, at a position in the path.
 *
 * `position` is what makes a path a SEQUENCE rather than a bag: an item may
 * only be started once everything before it is complete (curriculum/progress.ts).
 *
 * `paper_trading` marks the §8.3 simulated-environment workbooks. It is a
 * declaration a client acts on — svc-trade owns the paper-trading flag, and
 * this service does not reach into it.
 */
export const curriculumItems = academy.table(
  'curriculum_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    curriculumId: uuid('curriculum_id')
      .notNull()
      .references(() => curricula.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: itemKindEnum('kind').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    paperTrading: boolean('paper_trading').notNull().default(false),
  },
  (t) => [
    uniqueIndex('curriculum_items_position_idx').on(t.curriculumId, t.position),
    uniqueIndex('curriculum_items_slug_idx').on(t.curriculumId, t.slug),
  ],
);

export const enrollments = academy.table(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    curriculumId: uuid('curriculum_id')
      .notNull()
      .references(() => curricula.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    startedAt: createdAt(),
    completedAt: tstz('completed_at'),
  },
  (t) => [uniqueIndex('enrollments_pk').on(t.curriculumId, t.userId), index('enrollments_user_idx').on(t.userId, t.status)],
);

export const itemProgress = academy.table(
  'item_progress',
  {
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => curriculumItems.id, { onDelete: 'cascade' }),
    /** 0–10000 basis points. An integer, because a reproducible score cannot be a float. */
    score: integer('score'),
    completedAt: tstz('completed_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('item_progress_pk').on(t.enrollmentId, t.itemId)],
);

/**
 * A certification (§XIII "certification ranks → real perks").
 *
 * The perks themselves are NOT here. §4.1 owns rank and its perk table, and
 * this service earns its way into it by publishing `intafaced.identity.xp.earned`
 * — the declared way in. `xp_awarded` records what was published so the award
 * is auditable from this side without reading svc-identity's tables (§2).
 */
export const certifications = academy.table(
  'certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    curriculumId: uuid('curriculum_id')
      .notNull()
      .references(() => curricula.id, { onDelete: 'cascade' }),
    /** Human-readable credential code, e.g. `ACAD-FUTURES-01`. */
    code: text('code').notNull(),
    xpAwarded: integer('xp_awarded').notNull(),
    awardedAt: createdAt(),
  },
  (t) => [
    /** ONE certification per path per person. A re-run must not award XP twice. */
    uniqueIndex('certifications_pk').on(t.curriculumId, t.userId),
    index('certifications_user_idx').on(t.userId),
  ],
);

export const schema = {
  rooms,
  roomInvites,
  sessions,
  sessionAttendees,
  curricula,
  curriculumItems,
  enrollments,
  itemProgress,
  certifications,
};
