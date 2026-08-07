import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { AcademyError } from './errors.js';
import type { AcademyService, RoomRecord } from './academy-service.js';
import { getCurriculumItem, listCurriculum } from './curriculum/catalog.js';
import { curriculumInventory } from './curriculum/import-pipeline.js';
import { startPaperDrillForCatalogItem } from './paper/workbook-loop.js';

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

const curriculumInventoryOut = z.object({
  contentSource: z.enum(['platform-native-expansion', 'licensed-import-pending']),
  spine: z.object({
    total: z.number().int(),
    playbooks: z.number().int(),
    workbooks: z.number().int(),
    lessons: z.number().int(),
  }),
  titleTarget: z.object({ playbooks: z.number().int(), workbooks: z.number().int() }),
  titlePromiseMet: z.boolean(),
  residualPlaybooks: z.number().int(),
  residualWorkbooks: z.number().int(),
});

const paperDrillOut = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    marketId: z.string(),
    symbol: z.string(),
    steps: z.array(z.object({ id: z.string(), instruction: z.string() })),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not_paper', 'no_market', 'unknown_step', 'bad_fill']),
    message: z.string(),
  }),
]);

const ambassadorStatus = z.enum(['active', 'frozen']);
const ambassadorOut = z.object({
  userId: z.string().uuid(),
  status: ambassadorStatus,
  appointedBy: z.string().uuid(),
  appointedAt: z.date(),
  frozenAt: z.date().nullable(),
  frozenBy: z.string().uuid().nullable(),
  freezeReason: z.string().nullable(),
});
const ambassadorBadgeOut = z.object({
  userId: z.string().uuid(),
  isAmbassador: z.boolean(),
  status: ambassadorStatus.nullable(),
});

const seasonStatus = z.enum(['scheduled', 'live', 'frozen', 'ended']);
const seasonOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  status: seasonStatus,
  rulesSummary: z.string(),
  startsAt: z.date(),
  endsAt: z.date().nullable(),
});
const standingOut = z.object({
  seasonId: z.string().uuid(),
  userId: z.string().uuid(),
  score: z.number().int(),
  updatedAt: z.date(),
  rank: z.number().int(),
});

const residencyStatus = z.enum(['applied', 'accepted', 'rejected', 'withdrawn']);
const residencyOut = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  cohortSlug: z.string(),
  statement: z.string(),
  status: residencyStatus,
  appliedAt: z.date(),
  decidedAt: z.date().nullable(),
  decidedBy: z.string().uuid().nullable(),
  decisionNote: z.string().nullable(),
});

const certDefinitionOut = z.object({
  id: z.string(),
  title: z.string(),
  requiredItemSlugs: z.array(z.string()),
});
const enrollmentOut = z.object({
  userId: z.string().uuid(),
  pathSlug: z.string(),
  enrolledAt: z.date(),
});
const itemCompletionOut = z.object({
  userId: z.string().uuid(),
  itemSlug: z.string(),
  completedAt: z.date(),
});
const certGrantOut = z.object({
  userId: z.string().uuid(),
  certId: z.string(),
  grantedAt: z.date(),
  idempotencyKey: z.string(),
});
const certProgressOut = z.object({
  userId: z.string().uuid(),
  certId: z.string(),
  title: z.string(),
  requiredCount: z.number().int(),
  completedCount: z.number().int(),
  ratio: z.string(),
  missingItemSlugs: z.array(z.string()),
  complete: z.boolean(),
  granted: z.boolean(),
  grantIdempotencyKey: z.string().nullable(),
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
    case 'academy.ambassador_invalid':
    case 'academy.residency_invalid':
      // Client sent a scene that fails Stage-1 schema or size gate /
      // freeze reason that fails Stage-1 programme rules /
      // residency statement/cohort that fails Stage-1 rules.
      return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });

    case 'academy.ambassador_not_found':
    case 'academy.residency_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });

    case 'academy.ambassador_already_active':
    case 'academy.ambassador_already_frozen':
    case 'academy.residency_already_open':
    case 'academy.residency_not_pending':
    case 'academy.cert_already_granted':
    case 'academy.cert_incomplete':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });

    case 'academy.cert_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });

    case 'academy.cert_invalid':
      return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });

    case 'academy.season_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });

    case 'academy.tournament_disabled':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });

    case 'academy.season_not_live':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });

    case 'academy.season_invalid':
    case 'academy.standing_invalid':
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

    /**
     * Stage-1 import pipeline inventory: content source decision + count gate.
     * titlePromiseMet is false until 20 playbooks + 3 workbooks exist (or product renames).
     */
    curriculumInventory: scopedProcedure('academy:read', { module: 'academy' })
      .output(curriculumInventoryOut)
      .query(() => curriculumInventory()),

    /**
     * Paper drill gate for a workbook (TRK-academy.paper-trading Stage 2).
     *
     * Read-only on purpose: the drill loop is a pure state machine and academy
     * holds no run state, so this answers one question — may this catalog item
     * be drilled against this market, and with which steps. A market that is
     * not flagged `paper: true` by trade refuses here rather than anywhere a
     * user could mistake it for live. No fills, prices or balances cross this
     * boundary; money truth stays on trade.
     */
    paperDrill: scopedProcedure('academy:read', { module: 'academy' })
      .input(
        z.object({
          slug: z.string().min(1),
          market: z
            .object({ marketId: z.string().min(1), paper: z.boolean(), symbol: z.string().min(1) })
            .nullable()
            .default(null),
        }),
      )
      .output(paperDrillOut)
      .query(({ input }) =>
        guard(async () => {
          const item = getCurriculumItem(input.slug);
          if (!item) {
            throw new AcademyError(`Curriculum item "${input.slug}" is not in the day-one spine`, 'academy.curriculum_not_found');
          }
          const result = startPaperDrillForCatalogItem({ slug: input.slug, kind: item.kind, market: input.market });
          if (!result.ok) {
            return { ok: false as const, reason: result.reason, message: result.message };
          }
          return {
            ok: true as const,
            marketId: result.run.marketId,
            symbol: result.run.symbol,
            steps: result.run.steps.map((step) => ({ id: step.id, instruction: step.instruction })),
          };
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

    // ── Ambassador programme Stage-1 (status only — NO PAY / Class M residual) ─
    //
    // Public badge is academy:read. Appoint/freeze are operator admin:write —
    // programme control is not a user self-serve action.

    ambassadorBadge: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ userId: z.string().uuid() }))
      .output(ambassadorBadgeOut)
      .query(({ input }) => guard(() => academy.ambassadorBadge(input.userId))),

    ambassadors: scopedProcedure('admin:read', { module: 'academy' })
      .input(z.object({ status: ambassadorStatus.optional() }).optional())
      .output(z.array(ambassadorOut))
      .query(({ input }) => guard(async () => academy.listAmbassadors({ ...(input?.status ? { status: input.status } : {}) }))),

    appointAmbassador: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ userId: z.string().uuid() }))
      .output(ambassadorOut)
      .mutation(({ input, ctx }) => guard(() => academy.appointAmbassador({ userId: input.userId, operatorId: ctx.principal!.userId }))),

    freezeAmbassador: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ userId: z.string().uuid(), reason: z.string().min(1).max(500) }))
      .output(ambassadorOut)
      .mutation(({ input, ctx }) =>
        guard(() =>
          academy.freezeAmbassador({
            userId: input.userId,
            operatorId: ctx.principal!.userId,
            reason: input.reason,
          }),
        ),
      ),

    // ── Residency applications Stage-1 (durable, NO PAY) ──────────────────────
    //
    // User applies/withdraws own rows. Operator decides open queue. Pay is Class M.

    applyResidency: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ cohortSlug: z.string().min(3).max(48), statement: z.string().min(20).max(2000) }))
      .output(residencyOut)
      .mutation(({ input, ctx }) =>
        guard(() =>
          academy.applyResidency({
            userId: ctx.principal!.userId,
            cohortSlug: input.cohortSlug,
            statement: input.statement,
          }),
        ),
      ),

    withdrawResidency: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ id: z.string().uuid() }))
      .output(residencyOut)
      .mutation(({ input, ctx }) => guard(() => academy.withdrawResidency({ id: input.id, userId: ctx.principal!.userId }))),

    myResidencies: scopedProcedure('academy:read', { module: 'academy' })
      .output(z.array(residencyOut))
      .query(({ ctx }) => guard(() => academy.myResidencies(ctx.principal!.userId))),

    openResidencies: scopedProcedure('admin:read', { module: 'academy' })
      .input(z.object({ cohortSlug: z.string().min(3).max(48).optional() }).optional())
      .output(z.array(residencyOut))
      .query(({ input }) => guard(() => academy.listOpenResidencies(input?.cohortSlug))),

    decideResidency: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          id: z.string().uuid(),
          decision: z.enum(['accepted', 'rejected']),
          note: z.string().max(500).optional(),
        }),
      )
      .output(residencyOut)
      .mutation(({ input, ctx }) =>
        guard(() =>
          academy.decideResidency({
            id: input.id,
            operatorId: ctx.principal!.userId,
            decision: input.decision,
            ...(input.note === undefined ? {} : { note: input.note }),
          }),
        ),
      ),

    // ── Tournament ladders Stage-1 (NO PRIZE MONEY) ───────────────────────────
    //
    // Gated by ACADEMY_TOURNAMENT_ENABLED. Operator creates/starts seasons;
    // standings are readable by academy:read. Score writes are admin:write until
    // a paper/live source is product-lawed (Stage-2+).

    seasons: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ status: seasonStatus.optional() }).optional())
      .output(z.array(seasonOut))
      .query(({ input }) => guard(async () => academy.listSeasons({ ...(input?.status ? { status: input.status } : {}) }))),

    season: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid() }))
      .output(seasonOut)
      .query(({ input }) => guard(() => academy.season(input.seasonId))),

    standings: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid() }))
      .output(z.array(standingOut))
      .query(({ input }) => guard(() => academy.standings(input.seasonId))),

    createSeason: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          slug: z.string().min(3).max(64),
          title: z.string().min(3).max(160),
          rulesSummary: z.string().min(8).max(4000),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date().nullable().optional(),
        }),
      )
      .output(seasonOut)
      .mutation(({ input }) =>
        guard(() =>
          academy.createSeason({
            slug: input.slug,
            title: input.title,
            rulesSummary: input.rulesSummary,
            startsAt: input.startsAt,
            endsAt: input.endsAt ?? null,
          }),
        ),
      ),

    setSeasonStatus: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid(), status: seasonStatus }))
      .output(seasonOut)
      .mutation(({ input }) => guard(() => academy.setSeasonStatus(input))),

    setStanding: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid(), userId: z.string().uuid(), score: z.number().int() }))
      .output(standingOut.omit({ rank: true }))
      .mutation(({ input }) => guard(() => academy.setStanding(input))),

    // ── Certifications Stage-1 (progress + grants — NO XP / NO PAY) ───────────
    //
    // Definitions are code-seeded. Completions and grants are durable. XP emit
    // and rank perks remain Stage-2 residual.

    certDefinitions: scopedProcedure('academy:read', { module: 'academy' })
      .output(z.array(certDefinitionOut))
      .query(() =>
        academy.listCertDefinitions().map((c) => ({
          id: c.id,
          title: c.title,
          requiredItemSlugs: [...c.requiredItemSlugs],
        })),
      ),

    enrollCertPath: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ pathSlug: z.string().min(1).max(64) }))
      .output(enrollmentOut)
      .mutation(({ input, ctx }) => guard(() => academy.enrollCertPath({ userId: ctx.principal!.userId, pathSlug: input.pathSlug }))),

    markCurriculumComplete: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ itemSlug: z.string().min(1).max(120) }))
      .output(itemCompletionOut)
      .mutation(({ input, ctx }) =>
        guard(() => academy.markCurriculumComplete({ userId: ctx.principal!.userId, itemSlug: input.itemSlug })),
      ),

    grantCert: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ certId: z.string().min(1).max(64) }))
      .output(
        z.object({
          grant: certGrantOut,
          alreadyGranted: z.boolean(),
        }),
      )
      .mutation(({ input, ctx }) =>
        guard(async () => {
          const result = await academy.grantCert({ userId: ctx.principal!.userId, certId: input.certId });
          return {
            alreadyGranted: result.alreadyGranted,
            grant: {
              userId: result.grant.userId,
              certId: result.grant.certId,
              grantedAt: result.grant.grantedAt,
              idempotencyKey: result.grant.idempotencyKey,
            },
          };
        }),
      ),

    myCerts: scopedProcedure('academy:read', { module: 'academy' })
      .output(z.array(certGrantOut))
      .query(({ ctx }) => guard(() => academy.myCertGrants(ctx.principal!.userId))),

    certProgress: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ certId: z.string().min(1).max(64) }))
      .output(certProgressOut)
      .query(({ input, ctx }) =>
        guard(async () => {
          const p = await academy.certProgress({ userId: ctx.principal!.userId, certId: input.certId });
          return {
            userId: p.userId,
            certId: p.certId,
            title: p.title,
            requiredCount: p.requiredCount,
            completedCount: p.completedCount,
            ratio: p.ratio,
            missingItemSlugs: [...p.missingItemSlugs],
            complete: p.complete,
            granted: p.granted,
            grantIdempotencyKey: p.grantIdempotencyKey,
          };
        }),
      ),
  });
}

export type AcademyRouter = ReturnType<typeof createAcademyRouter>;
