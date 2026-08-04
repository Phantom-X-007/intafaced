import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { AcademyError } from './errors.js';
import type { AcademyService, RoomRecord } from './academy-service.js';
import { getCurriculumItem, listCurriculum } from './curriculum/catalog.js';

/**
 * svc-academy's API — lobbies + thin curriculum catalog (§8.3, §XIII).
 *
 * ── Authorisation, stated once ──────────────────────────────────────────────
 *
 * A SEAT is the only thing this service grants on the lobby surface, and it
 * grants it to `ctx.principal.userId` and nobody else. No procedure takes a
 * userId from the input except `invite`, where naming someone else IS the
 * operation — and that one is host-only, so the caller must already own the
 * room they are inviting into.
 *
 * Host-side procedures take the same principal and let the service compare it
 * against the room's or session's `host_id`. Whether an account may open a room
 * in the FIRST place is not a scope question at all: it is §4.1's
 * `lobbyHostRights` perk, read from svc-identity at `createRoom`. See
 * host-rights.ts for why the scope could not carry that.
 *
 * Curriculum procedures are read-only catalog lookups. They take no userId and
 * write no progress — certification and XP are a later feature.
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
/** Matches Blueprint `curriculumPath` — the only paths the catalog knows. */
const curriculumPath = z.enum(['foundations', 'markets', 'builder', 'sovereign']);
const curriculumKind = z.enum(['playbook', 'workbook', 'lesson']);

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

const curriculumSummaryOut = z.object({
  slug: z.string(),
  title: z.string(),
  kind: curriculumKind,
  path: curriculumPath,
  order: z.number().int(),
  summary: z.string(),
});

const curriculumItemOut = curriculumSummaryOut.extend({
  body: z.string(),
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
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });

    case 'academy.not_host':
    case 'academy.stake_required':
    case 'academy.invite_required':
    case 'academy.host_rights_required':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });

    case 'academy.room_full':
    case 'academy.session_not_live':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });

    case 'academy.scene_invalid':
      // Client sent a scene that fails Stage-1 schema or size gate.
      return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });

    case 'academy.stake_unavailable':
    case 'academy.stream_unavailable':
    case 'academy.host_rights_unavailable':
      // All three are OUR infrastructure, not the caller's request, and the
      // distinction matters to a client: a 403 tells someone to go and stake or
      // rank up, and telling them that because svc-token was unreachable sends
      // them to do something they have already done. A 500 says "try again".
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

    // ── Curriculum (thin catalog — A-P5-2) ───────────────────────────────────
    //
    // Pure in-process spine. No progress write, no XP, no money. Full
    // proprietary library import is residual (see curriculum/catalog.ts).

    curriculum: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ path: curriculumPath.optional(), kind: curriculumKind.optional() }).optional())
      .output(z.array(curriculumSummaryOut))
      .query(({ input }) => listCurriculum({ ...(input?.path ? { path: input.path } : {}), ...(input?.kind ? { kind: input.kind } : {}) })),

    /**
     * One curriculum item including markdown body.
     *
     * Unknown slug → `academy.curriculum_not_found` (NOT_FOUND). We do not
     * invent titles for the residual DERIV//DESK library that is not in-repo.
     */
    curriculumItem: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ slug: z.string().min(1).max(120) }))
      .output(curriculumItemOut)
      .query(({ input }) =>
        guard(async () => {
          const item = getCurriculumItem(input.slug);
          if (!item) {
            throw new AcademyError(`Curriculum item "${input.slug}" is not in the day-one spine`, 'academy.curriculum_not_found');
          }
          return item;
        }),
      ),

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
  });
}

export type AcademyRouter = ReturnType<typeof createAcademyRouter>;
