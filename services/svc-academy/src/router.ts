import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { AcademyError } from './errors.js';
import type { AcademyService, RoomRecord } from './academy-service.js';

/**
 * svc-academy's API (§8.3, §XIII).
 *
 * ── Authorisation, stated once ──────────────────────────────────────────────
 *
 * Nothing here takes a userId from the input. A seat, a piece of progress and a
 * certification all belong to `ctx.principal.userId`, and there is deliberately
 * no "mark THIS person as having completed THAT" path — it would be a way to
 * mint someone else's credential, and a credential publishes XP into the rank
 * ladder that gates fees and follower caps.
 *
 * Host-side procedures take the same principal and let the service compare it
 * against the room's or session's `host_id`.
 *
 * `academy` is `minTier: 'none'` in the jurisdiction matrix (nothing custodial
 * happens here), so `{ module: 'academy' }` is doing region work, not
 * verification work. That is the correct gate: a blocked region is a legal
 * constraint on serving it at all.
 */

/** A stake threshold on the wire is a decimal string, like every other amount. */
const amountString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are unsigned decimal strings (max 18dp)');

const roomKind = z.enum(['general', 'futures', 'options', 'meme_war_room', 'forex', 'defi_lab', 'merchant_clinic']);
const roomAccess = z.enum(['free', 'staked', 'invite']);
const sessionStatus = z.enum(['scheduled', 'live', 'ended', 'cancelled']);
const itemKind = z.enum(['playbook', 'workbook', 'video']);

const roomOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  kind: roomKind,
  access: roomAccess,
  minStake: amountString,
  capacity: z.number().int(),
  hostId: z.string().uuid(),
});

const sessionOut = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  title: z.string(),
  hostId: z.string().uuid(),
  status: sessionStatus,
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  /** Null when no SFU is configured — the lobby still runs as text and presence. */
  streamProvider: z.string().nullable(),
  scene: z.record(z.unknown()),
});

const curriculumOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  track: z.string(),
  blueprintPath: z.string().nullable(),
  published: z.boolean(),
});

const itemOut = z.object({
  id: z.string().uuid(),
  curriculumId: z.string().uuid(),
  position: z.number().int(),
  kind: itemKind,
  slug: z.string(),
  title: z.string(),
  paperTrading: z.boolean(),
});

const progressOut = z.object({
  total: z.number().int(),
  completed: z.number().int(),
  percentBps: z.number().int(),
  nextItemId: z.string().uuid().nullable(),
  finished: z.boolean(),
});

const certificationOut = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  curriculumId: z.string().uuid(),
  code: z.string(),
  xpAwarded: z.number().int(),
  awardedAt: z.date(),
});

const serialiseRoom = (room: RoomRecord): z.infer<typeof roomOut> => ({ ...room, minStake: formatAmount(room.minStake) });

/**
 * Error codes are preserved, not flattened.
 *
 * `academy.room_full` (wait) and `academy.stake_required` (stake) are both "you
 * cannot sit down", and a client that cannot tell them apart cannot tell the
 * user what to do next. `academy.stream_unavailable` is a deployment fact, not
 * a bad request, and it is reported as one.
 */
function toTrpcError(err: unknown): TRPCError {
  if (!(err instanceof AcademyError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Request failed', cause: err });
  }

  switch (err.code) {
    case 'academy.room_not_found':
    case 'academy.session_not_found':
    case 'academy.curriculum_not_found':
    case 'academy.not_enrolled':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });

    case 'academy.not_host':
    case 'academy.stake_required':
    case 'academy.invite_required':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });

    case 'academy.room_full':
    case 'academy.session_not_live':
    case 'academy.item_locked':
    case 'academy.path_incomplete':
    case 'academy.already_certified':
    case 'academy.curriculum_unpublished':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });

    case 'academy.item_not_in_path':
      return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });

    case 'academy.stake_unavailable':
    case 'academy.stream_unavailable':
      // Both are our infrastructure, not the caller's request. A client should
      // retry the first and stop asking for the second until an operator acts.
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
  }
}

export function createAcademyRouter(academy: AcademyService) {
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw toTrpcError(err);
    }
  };

  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-academy') }))
      .query(() => ({ ok: true, service: 'svc-academy' as const })),

    // ── Lobbies ──────────────────────────────────────────────────────────────

    rooms: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ kind: roomKind.optional() }).optional())
      .output(z.array(roomOut))
      .query(async ({ input }) => (await academy.listRooms({ ...(input?.kind ? { kind: input.kind } : {}) })).map(serialiseRoom)),

    /** A room, its terms, and what is on in it. */
    room: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ roomId: z.string().uuid() }))
      .output(z.object({ room: roomOut, sessions: z.array(sessionOut) }))
      .query(({ input }) =>
        guard(async () => ({
          room: serialiseRoom(await academy.room(input.roomId)),
          sessions: await academy.listSessions({ roomId: input.roomId }),
        })),
      ),

    session: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid() }))
      .output(z.object({ session: sessionOut, occupancy: z.number().int() }))
      .query(({ input }) =>
        guard(async () => ({
          session: await academy.session(input.sessionId),
          occupancy: await academy.occupancy(input.sessionId),
        })),
      ),

    /**
     * Take a seat.
     *
     * The gate and the capacity check both live in the service; this is the
     * only place a seat is granted, and it grants it to the caller and nobody
     * else.
     */
    join: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid() }))
      .output(z.object({ role: z.enum(['host', 'speaker', 'attendee']) }))
      .mutation(({ ctx, input }) => guard(() => academy.join({ sessionId: input.sessionId, userId: ctx.principal.userId }))),

    leave: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid() }))
      .output(z.object({ ok: z.literal(true) }))
      .mutation(({ ctx, input }) =>
        guard(async () => {
          await academy.leave({ sessionId: input.sessionId, userId: ctx.principal.userId });
          return { ok: true as const };
        }),
      ),

    /**
     * A credential for the audio/video stream, for a caller already seated.
     *
     * Fails with `academy.stream_unavailable` when no SFU is configured, rather
     * than returning a token that cannot connect (SOCKET §13
     * `socket.stream-provider`). A lobby with no stream still runs.
     */
    streamCredential: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid() }))
      .output(z.object({ url: z.string(), token: z.string(), expiresAt: z.date() }))
      .mutation(({ ctx, input }) => guard(() => academy.streamCredential({ sessionId: input.sessionId, userId: ctx.principal.userId }))),

    // ── Hosting ──────────────────────────────────────────────────────────────

    createRoom: scopedProcedure('academy:write', { module: 'academy' })
      .input(
        z.object({
          slug: z
            .string()
            .min(3)
            .max(64)
            .regex(/^[a-z0-9-]+$/, 'a slug is lowercase letters, digits and hyphens'),
          name: z.string().min(1).max(120),
          kind: roomKind,
          access: roomAccess,
          minStake: amountString.optional(),
          capacity: z.number().int().min(1),
        }),
      )
      .output(roomOut)
      .mutation(({ ctx, input }) => {
        // `minStake` is pulled OUT of the spread rather than corrected after it.
        // Spreading `input` whole put the wire's decimal STRING onto a field the
        // service types as a scaled `bigint`, and the conditional override only
        // replaced it when the value was truthy — so the money type held for
        // rooms that set a threshold and quietly broke for those that did not.
        // Destructuring means the string cannot reach the service at all: the
        // field is a parsed `Amount` or it is absent.
        const { minStake, ...rest } = input;
        return guard(async () =>
          serialiseRoom(
            await academy.createRoom({
              ...rest,
              hostId: ctx.principal.userId,
              ...(minStake ? { minStake: parseAmount(minStake) } : {}),
            }),
          ),
        );
      }),

    invite: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ roomId: z.string().uuid(), userId: z.string().uuid(), expiresAt: z.coerce.date().nullable().optional() }))
      .output(z.object({ ok: z.literal(true) }))
      .mutation(({ ctx, input }) =>
        guard(async () => {
          await academy.invite({
            roomId: input.roomId,
            hostId: ctx.principal.userId,
            userId: input.userId,
            expiresAt: input.expiresAt ?? null,
          });
          return { ok: true as const };
        }),
      ),

    scheduleSession: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ roomId: z.string().uuid(), title: z.string().min(1).max(160), startsAt: z.coerce.date() }))
      .output(sessionOut)
      .mutation(({ ctx, input }) => guard(() => academy.scheduleSession({ ...input, hostId: ctx.principal.userId }))),

    startSession: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid() }))
      .output(sessionOut)
      .mutation(({ ctx, input }) => guard(() => academy.startSession({ sessionId: input.sessionId, hostId: ctx.principal.userId }))),

    endSession: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid() }))
      .output(sessionOut)
      .mutation(({ ctx, input }) => guard(() => academy.endSession({ sessionId: input.sessionId, hostId: ctx.principal.userId }))),

    /** The 2D scene (§8.3). Host writes, everyone reads — see the service for why. */
    updateScene: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ sessionId: z.string().uuid(), scene: z.record(z.unknown()) }))
      .output(sessionOut)
      .mutation(({ ctx, input }) =>
        guard(() => academy.updateScene({ sessionId: input.sessionId, hostId: ctx.principal.userId, scene: input.scene })),
      ),

    // ── Curriculum ───────────────────────────────────────────────────────────

    /**
     * Published paths, optionally the ones a Blueprint path sequences.
     *
     * The caller passes their OWN `blueprintPath`, read from their own
     * Blueprint. This service asks svc-blueprint nothing about anyone (§2, §10)
     * — the sequencing is a join the client makes under its own authority.
     */
    curricula: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ blueprintPath: z.string().max(120).optional() }).optional())
      .output(z.array(curriculumOut))
      .query(({ input }) => academy.listCurricula({ ...(input?.blueprintPath ? { blueprintPath: input.blueprintPath } : {}) })),

    curriculum: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ curriculumId: z.string().uuid() }))
      .output(z.object({ curriculum: curriculumOut, items: z.array(itemOut) }))
      .query(({ input }) =>
        guard(async () => ({
          curriculum: await academy.curriculum(input.curriculumId),
          items: await academy.items(input.curriculumId),
        })),
      ),

    enroll: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ curriculumId: z.string().uuid() }))
      .output(z.object({ enrollmentId: z.string().uuid() }))
      .mutation(({ ctx, input }) => guard(() => academy.enroll({ curriculumId: input.curriculumId, userId: ctx.principal.userId }))),

    /** Mark one step done. Refused unless every earlier step is — a path is a sequence. */
    completeItem: scopedProcedure('academy:write', { module: 'academy' })
      .input(
        z.object({
          curriculumId: z.string().uuid(),
          itemId: z.string().uuid(),
          /** Basis points, 0–10000. An integer, so a reproducible score is never a float. */
          score: z.number().int().min(0).max(10_000).nullable().optional(),
        }),
      )
      .output(progressOut)
      .mutation(({ ctx, input }) =>
        guard(() =>
          academy.completeItem({
            curriculumId: input.curriculumId,
            userId: ctx.principal.userId,
            itemId: input.itemId,
            score: input.score ?? null,
          }),
        ),
      ),

    progress: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ curriculumId: z.string().uuid() }))
      .output(progressOut)
      .query(({ ctx, input }) => guard(() => academy.progress(input.curriculumId, ctx.principal.userId))),

    /**
     * Claim the certification.
     *
     * Publishes `intafaced.identity.xp.earned` — a one-way movement into §4.1's
     * rank ladder, which is why the service claims a row before it publishes
     * and why the event carries a business key.
     */
    certify: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ curriculumId: z.string().uuid() }))
      .output(certificationOut)
      .mutation(({ ctx, input }) => guard(() => academy.certify({ curriculumId: input.curriculumId, userId: ctx.principal.userId }))),

    /** The caller's own credentials. */
    certifications: scopedProcedure('academy:read', { module: 'academy' })
      .output(z.array(certificationOut))
      .query(({ ctx }) => academy.certifications(ctx.principal.userId)),
  });
}

export type AcademyRouter = ReturnType<typeof createAcademyRouter>;
