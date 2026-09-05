import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError, rankPerksSchema } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { AcademyError } from './errors.js';
import { userCopy } from './user-copy.js';
import type { AcademyService, RoomRecord } from './academy-service.js';
import {
  AmbassadorPayRefuseError,
  ambassadorPayPlaneStatus,
  attemptAmbassadorPay,
  attemptResidencyIfcPay,
  decidePublicAmbassadorPayQuote,
  decidePublicResidencyPayQuote,
} from './ambassadors/ifc-pay.js';
import {
  PrizePoolRefuseError,
  assertMayStartPrizeSeason,
  decidePrizeIntent,
  decidePrizePoolStart,
  isPrizeRefuseClosed,
  prizeRefuseStatusLine,
  type PrizeIntentKind,
} from './tournaments/prize-refuse.js';
import {
  AmbassadorRateAuthorityRefuseError,
  UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW,
  UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW,
  type AmbassadorIfcPayLaw,
  type AmbassadorRevenueShareLaw,
} from './ambassadors/ifc-pay-rate-law.js';
import {
  curriculumDepthReport,
  curriculumStudyGuide,
  getCurriculumItem,
  listCurriculum,
  listCurriculumStudyGuides,
} from './curriculum/catalog.js';
import { curriculumInventory, curriculumImportStageStatus } from './curriculum/import-pipeline.js';
import { resolveCurriculumDeepLink, listCurriculumPathDeepLinks } from './curriculum/deep-links.js';
import { curriculumBodyForLocale, curriculumI18nStrategyLine } from './curriculum/i18n-strategy.js';
import {
  drillProgress,
  isDrillComplete,
  listPaperFillRefs,
  remainingStepIds,
  replayPaperDrill,
  startPaperDrillForCatalogItem,
} from './paper/workbook-loop.js';
import { PAPER_OPS_ENV_KEY, PAPER_OPS_FLAG_ID } from './paper/ops-gate.js';
import {
  assertSealedSimulated,
  sealSimulated,
  SIMULATED_VENUE,
  valueSimulatedDrill,
  type PublishedFill,
} from './paper/simulated-result.js';
import { assertPaperInputNeverClaimsLive, assertPaperNeverReadableAsRealMoney } from './paper/real-money-ban.js';
import { CERT_XP_ACTION, CERT_XP_SOURCE_MODULE } from './certs/xp-publish.js';
import {
  CERT_PERK_REFUSE_CODE,
  CERT_PERK_RESIDUAL,
  decideCertPerkInvent,
  isCertPerkInventRefuseClosed,
  type CertPerkInventKind,
} from './certs/perk-plane.js';
import { bulkScoreStatusLine, validateBulkScoreWrite } from './tournaments/bulk-score.js';
import { seasonWindowAt } from './tournaments/season-calendar.js';
import { describeTournamentPolicy } from './tournaments/tournament-policy.js';
import {
  assertAcademyVideoUrlGranted,
  grantAcademyVideoPlayback,
  listAcademyVideos,
  unconfiguredVideoLibrary,
  type VideoLibraryDeps,
} from './video/library.js';

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
 * write no progress. Progress, certification and the XP a certification is
 * worth are the `cert*` procedures at the bottom of this file, and they are
 * scoped the same way: the caller's own progress, never a userId from input.
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
  /** Always on read — client supplies this as expectedFingerprint on updateScene. */
  sceneFingerprint: z.string().min(1),
});

const curriculumSummaryOut = z.object({
  slug: z.string(),
  title: z.string(),
  kind: curriculumKind,
  path: curriculumPath,
  order: z.number().int(),
  summary: z.string(),
  /** Derived from the body, never hand-typed — see `readingMinutes` in curriculum/content.ts. */
  estimatedMinutes: z.number().int().positive(),
});

const curriculumKeyTermOut = z.object({ term: z.string(), definition: z.string() });

/**
 * The teaching scaffolding that turns a markdown blob into a screen: what a
 * reader should be able to do, the vocabulary the body assumes, and the
 * questions that reveal whether they got it. Nothing here is graded — grading
 * and XP belong to the `cert*` procedures.
 */
const curriculumTeachingOut = {
  objectives: z.array(z.string()).min(1),
  keyTerms: z.array(curriculumKeyTermOut).min(1),
  selfCheck: z.array(z.string()).min(1),
};

const curriculumItemOut = curriculumSummaryOut.extend({
  body: z.string(),
  ...curriculumTeachingOut,
});

const curriculumStudyGuideOut = curriculumSummaryOut
  .omit({ order: true, summary: true })
  .extend({ ...curriculumTeachingOut, bodyChars: z.number().int().nonnegative() });

const curriculumDepthOut = z.object({
  total: z.number().int(),
  deep: z.number().int(),
  thin: z.number().int(),
  thinSlugs: z.array(z.string()),
  minBodyChars: z.number().int(),
  shortestBodyChars: z.number().int(),
  totalBodyChars: z.number().int(),
  allDeep: z.boolean(),
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

const curriculumDeepLinkOut = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    path: curriculumPath,
    slug: z.string().nullable(),
    href: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['unknown_path', 'unknown_slug', 'path_mismatch']),
    message: z.string(),
  }),
]);

const curriculumImportStatusOut = z.object({
  contentSource: z.enum(['platform-native-expansion', 'licensed-import-pending']),
  titlePromiseMet: z.boolean(),
  residualPlaybooks: z.number().int(),
  residualWorkbooks: z.number().int(),
  stage1Pipeline: z.literal(true),
  stage2CatalogExpanded: z.boolean(),
  stage3Polish: z.object({
    deepLinksVerified: z.boolean(),
    i18nStrategyHonest: z.boolean(),
    ready: z.boolean(),
  }),
  /** D26-P1-C5 — real lesson substance, not char-count theater. */
  substanceBarMet: z.boolean(),
  theaterSlugs: z.array(z.string()),
});

const curriculumItemLocalizedOut = curriculumItemOut.extend({
  locale: z.string(),
  fellBack: z.boolean(),
  i18nStrategy: z.string(),
});

/**
 * The seal, as a SCHEMA — every field a literal.
 *
 * This is the labelling rule enforced by the type system rather than by
 * remembering. A handler that returns a paper payload without `simulated: true`
 * does not compile, and one that somehow gets past that is rejected by the
 * output parser at runtime. The alternative — a `simulated?: boolean` a caller
 * is trusted to set — is the version that ships unlabelled on the day someone
 * adds a field in a hurry.
 *
 * `realMoney: false` is the D26-P1-C4 harden — paper flag never readable as
 * real money even if a client only checks one bit.
 */
const simulatedSealOut = {
  simulated: z.literal(true),
  venue: z.literal(SIMULATED_VENUE),
  realLedger: z.literal(false),
  withdrawable: z.literal(false),
  realMoney: z.literal(false),
  disclaimer: z.string().min(1),
};

const paperDrillOut = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    ...simulatedSealOut,
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

/**
 * A trade-published fill, as it may arrive.
 *
 * `price` and `size` are `z.string()` and there is no `z.coerce` anywhere near
 * them. A body carrying `"price": 68412.5` is a 400 rather than a float in a
 * book — doctrine §0.6's "never a number" does not have a practice exemption,
 * because a wrong practice figure is still a figure this platform published.
 */
const publishedFillIn = z
  .object({
    fillId: z.string().min(1).max(128),
    marketId: z.string().min(1),
    side: z.enum(['buy', 'sell']),
    price: z.string().min(1),
    size: z.string().min(1),
    recordedAt: z.date().optional(),
  })
  .strict();

/** Trade's paper flag only. Extra live/realMoney keys must refuse, not strip. */
const paperMarketFlagIn = z
  .object({
    marketId: z.string().min(1),
    paper: z.boolean(),
    symbol: z.string().min(1),
  })
  .strict();

const simulatedValuationOut = z.object({
  // Nested seal — valuation alone cannot be read as live money if parent seal stripped
  simulated: z.literal(true),
  venue: z.literal(SIMULATED_VENUE),
  realLedger: z.literal(false),
  withdrawable: z.literal(false),
  realMoney: z.literal(false),
  disclaimer: z.string().min(1),
  fillCount: z.number().int(),
  boughtSize: z.string(),
  soldSize: z.string(),
  openSize: z.string(),
  averageBuyPrice: z.string().nullable(),
  averageSellPrice: z.string().nullable(),
  realisedPnl: z.string(),
  /** Null, never a guess, when trade published no mark for the open size. */
  unrealisedPnl: z.string().nullable(),
  totalPnl: z.string().nullable(),
  markUnavailable: z.boolean(),
});

const paperDrillResultOut = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    ...simulatedSealOut,
    result: z.object({
      workbookSlug: z.string(),
      marketId: z.string(),
      symbol: z.string(),
      status: z.enum(['active', 'complete', 'refused']),
      stepCount: z.number().int(),
      completedCount: z.number().int(),
      remainingStepIds: z.array(z.string()),
      ratio: z.string(),
      complete: z.boolean(),
      valuation: simulatedValuationOut,
    }),
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

const seasonCalendarOut = z.object({
  seasonId: z.string().uuid(),
  status: seasonStatus,
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  openAt: z.date(),
  inWindow: z.boolean(),
  scoreWindowOpen: z.boolean(),
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
/** Public IFC / residency pay door — typed refuse only (no quote amounts). */
const publicAmbassadorPayQuoteOut = z.object({
  status: z.literal('refuse'),
  ok: z.literal(false),
  payable: z.literal(false),
  inventedIfc: z.literal(false),
  kind: z.enum(['ifc_pay', 'revenue_share', 'residency']),
  code: z.enum([
    'academy.ambassador_pay.rates_unset',
    'academy.ambassador_pay.class_m',
    'academy.ambassador_pay.recipe_unset',
    'academy.ambassador_pay.invent_refused',
    'academy.ambassador_pay.residency_not_accepted',
    'academy.ambassador_revenue_share.rates_unset',
    'academy.ambassador_revenue_share.class_m',
    'academy.ambassador_revenue_share.recipe_unset',
    'academy.ambassador_revenue_share.invent_refused',
    'academy.ambassador_revenue_share.residency_not_accepted',
  ]),
  reason: z.enum(['unset', 'invent', 'class_m']),
  rateAuthorityPublished: z.boolean(),
  residual: z.string(),
  message: z.string(),
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
/**
 * Stage-2 XP outcome on a grant.
 *
 * Reported rather than thrown: a certification that was earned is granted even
 * when its award could not be published, and a client that cannot tell those
 * apart cannot tell the user whether to expect their rank to move. `reason` is
 * a machine id — the shell owns the sentence and its i18n key (§9).
 */
const certXpOut = z.discriminatedUnion('emitted', [
  z.object({ emitted: z.literal(true), idempotencyKey: z.string(), xpDelta: z.number().int() }),
  z.object({
    emitted: z.literal(false),
    reason: z.enum(['no_policy', 'not_publishable', 'delta_unrepresentable', 'publisher_unavailable', 'publish_failed']),
  }),
]);
const certXpPlaneOut = z.object({
  publisherId: z.string(),
  emitEnabled: z.boolean(),
  sourceModule: z.literal(CERT_XP_SOURCE_MODULE),
  action: z.literal(CERT_XP_ACTION),
  rankWriter: z.literal('svc-identity'),
  policies: z.array(z.object({ certId: z.string(), xpDelta: z.number().int() })),
});
const certPerkInventKind = z.enum(['cert_to_perk_map', 'invent_perk_money', 'invent_fee_discount', 'invent_ifc_grant', 'invent_balance']);
const certPerkOutcomeOut = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('real'),
    path: z.literal('identity_rank'),
    sot: z.literal('svc-identity'),
    academyHoldsPerkMoney: z.literal(false),
    academyMapsCertToPerk: z.literal(false),
    perks: rankPerksSchema,
  }),
  z.object({
    status: z.literal('refuse'),
    code: z.literal(CERT_PERK_REFUSE_CODE),
    reason: z.enum(['identity_unreadable', 'unpriced']),
    message: z.string(),
    academyHoldsPerkMoney: z.literal(false),
    academyMapsCertToPerk: z.literal(false),
    residual: z.literal(CERT_PERK_RESIDUAL),
  }),
]);
const certPerkPlaneOut = z.object({
  perksEnabledViaIdentity: z.literal(true),
  academyMapsCertToPerk: z.literal(false),
  academyHoldsPerkMoney: z.literal(false),
  rankWriter: z.literal('svc-identity'),
  residual: z.literal(CERT_PERK_RESIDUAL),
  inventKindsRefuseClosed: z.array(certPerkInventKind),
  statusLine: z.string(),
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
  if (err instanceof AmbassadorPayRefuseError) {
    // PRECONDITION_FAILED: operator asked for pay before owner rates + ledger recipe exist.
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof AmbassadorRateAuthorityRefuseError) {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof PrizePoolRefuseError) {
    // PRECONDITION_FAILED: blank pool cannot start; amount present still Class M refuse (no invent IFC).
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: err.message,
      cause: err,
    });
  }
  if (!(err instanceof AcademyError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Request failed', cause: err });
  }

  const message = userCopy(err.code);

  switch (err.code) {
    case 'academy.room_not_found':
    case 'academy.session_not_found':
    case 'academy.curriculum_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message, cause: err });

    case 'academy.not_host':
    case 'academy.stake_required':
    case 'academy.invite_required':
    case 'academy.host_rights_required':
      return new TRPCError({ code: 'FORBIDDEN', message, cause: err });

    case 'academy.room_full':
    case 'academy.session_not_live':
      return new TRPCError({ code: 'CONFLICT', message, cause: err });

    case 'academy.scene_invalid':
    case 'academy.scene_conflict':
    case 'academy.scene_presence_collision':
    case 'academy.ambassador_invalid':
    case 'academy.residency_invalid':
      // Client sent a scene that fails Stage-1 schema or size gate /
      // freeze reason that fails Stage-1 programme rules /
      // residency statement/cohort that fails Stage-1 rules.
      return new TRPCError({ code: 'BAD_REQUEST', message, cause: err });

    case 'academy.ambassador_not_found':
    case 'academy.residency_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message, cause: err });

    case 'academy.ambassador_already_active':
    case 'academy.ambassador_already_frozen':
    case 'academy.residency_already_open':
    case 'academy.residency_not_pending':
    case 'academy.cert_already_granted':
    case 'academy.cert_incomplete':
      return new TRPCError({ code: 'CONFLICT', message, cause: err });

    case 'academy.cert_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message, cause: err });

    case 'academy.cert_invalid':
      return new TRPCError({ code: 'BAD_REQUEST', message, cause: err });

    case 'academy.season_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message, cause: err });

    case 'academy.tournament_disabled':
    case 'academy.paper_trading_disabled':
      return new TRPCError({ code: 'FORBIDDEN', message, cause: err });

    case 'academy.paper_flag_unverified':
      return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });

    case 'academy.paper_flag_mismatch':
    case 'academy.paper_market_unlisted':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });

    case 'academy.season_not_live':
      return new TRPCError({ code: 'CONFLICT', message, cause: err });

    case 'academy.season_invalid':
    case 'academy.standing_invalid':
      return new TRPCError({ code: 'BAD_REQUEST', message, cause: err });

    case 'academy.paper_price_unavailable':
    case 'academy.paper_result_unlabelled':
    case 'academy.paper_looks_like_real_money':
      // Neither is the caller's fault and neither may be softened into a
      // partial answer. "No price was published", "this figure lost its
      // simulated label", and "this payload claimed real custody" are all
      // states where the only safe payload is no payload — a 200 carrying a
      // best guess is the incident this row exists to prevent.
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message, cause: err });

    case 'academy.stake_unavailable':
    case 'academy.stream_unavailable':
    case 'academy.host_rights_unavailable':
    case 'academy.paper_flag_unavailable':
      // All three are OUR infrastructure, not the caller's request, and the
      // distinction matters to a client: a 403 tells someone to go and stake or
      // rank up, and telling them that because svc-token was unreachable sends
      // them to do something they have already done. A 500 says "try again".
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message, cause: err });

    case 'academy.video_storage_unconfigured':
    case 'academy.video_url_ttl_unset':
    case 'academy.video_s3_region_unset':
    case 'academy.room_capacity_unset':
      return new TRPCError({ code: 'PRECONDITION_FAILED', message, cause: err });

    case 'academy.video_grant_required':
      return new TRPCError({ code: 'FORBIDDEN', message, cause: err });
  }
}

export type AcademyRouterPayLaws = {
  readonly ifcPayLaw?: AmbassadorIfcPayLaw;
  readonly revenueShareLaw?: AmbassadorRevenueShareLaw;
};

export type AcademyRouterVideo = VideoLibraryDeps;

/**
 * Optional payLaws: owner-published rate authority (D26-P1-C2).
 * Default unpublished — refuse invent rates; product dry-run when published.
 * Video defaults unconfigured — academy.video_storage_unconfigured.
 */
export function createAcademyRouter(
  academy: AcademyService,
  payLaws: AcademyRouterPayLaws = {},
  video: AcademyRouterVideo = unconfiguredVideoLibrary(),
) {
  const ifcPayLaw = payLaws.ifcPayLaw ?? UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW;
  const revenueShareLaw = payLaws.revenueShareLaw ?? UNPUBLISHED_AMBASSADOR_REVENUE_SHARE_LAW;
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
          return { ...item, objectives: [...item.objectives], keyTerms: [...item.keyTerms], selfCheck: [...item.selfCheck] };
        }),
      ),

    /**
     * Stage-1 import pipeline inventory: content source decision + count gate.
     * titlePromiseMet is true when 20 playbooks + 3 workbooks exist (platform-native
     * expansion may close this without a licensed library dump).
     */
    curriculumInventory: scopedProcedure('academy:read', { module: 'academy' })
      .output(curriculumInventoryOut)
      .query(() => curriculumInventory()),

    /**
     * Stage-3 import/status: pipeline + catalog expansion + polish readiness.
     * Does not invent licensed library content; workbook live-quote invent stays refused.
     */
    curriculumImportStatus: scopedProcedure('academy:read', { module: 'academy' })
      .output(curriculumImportStatusOut)
      .query(() => curriculumImportStageStatus()),

    /**
     * Stage-3 Blueprint curriculumPath deep-link resolver.
     * Unknown path/slug or path mismatch → ok:false (no invent).
     */
    curriculumDeepLink: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ path: curriculumPath, slug: z.string().min(1).max(120).optional() }))
      .output(curriculumDeepLinkOut)
      .query(({ input }) => resolveCurriculumDeepLink(input)),

    /**
     * Stage-3 path-index deep-links for Blueprint paths that have catalog content.
     */
    curriculumPathDeepLinks: scopedProcedure('academy:read', { module: 'academy' })
      .output(
        z.array(
          z.object({
            path: curriculumPath,
            href: z.string(),
            itemCount: z.number().int(),
          }),
        ),
      )
      .query(() => [...listCurriculumPathDeepLinks()]),

    /**
     * Stage-3 localized curriculum body. Missing locales fall back to default `en`
     * — we never invent a translation.
     */
    curriculumItemLocalized: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ slug: z.string().min(1).max(120), locale: z.string().min(2).max(12).optional() }))
      .output(curriculumItemLocalizedOut)
      .query(({ input }) =>
        guard(async () => {
          const item = getCurriculumItem(input.slug);
          if (!item) {
            throw new AcademyError(`Curriculum item "${input.slug}" is not in the day-one spine`, 'academy.curriculum_not_found');
          }
          const localized = curriculumBodyForLocale(item.body, input.locale);
          return {
            ...item,
            objectives: [...item.objectives],
            keyTerms: [...item.keyTerms],
            selfCheck: [...item.selfCheck],
            body: localized.body,
            locale: localized.resolution.locale,
            fellBack: localized.resolution.fellBack,
            i18nStrategy: curriculumI18nStrategyLine(),
          };
        }),
      ),

    /**
     * The study guide for one item: objectives, key terms, self-check and the
     * reading estimate, without the markdown body.
     *
     * This is what an index screen needs. `curriculumItem` hands back several
     * thousand characters of prose, which is the wrong payload for a card, and
     * a client that had to fetch the whole body to show "3 objectives, 4 min"
     * would either over-fetch every row or invent the numbers locally.
     *
     * Unknown slug → `academy.curriculum_not_found`. We never synthesise a guide.
     */
    curriculumStudyGuide: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ slug: z.string().min(1).max(120) }))
      .output(curriculumStudyGuideOut)
      .query(({ input }) =>
        guard(async () => {
          const guide = curriculumStudyGuide(input.slug);
          if (!guide) {
            throw new AcademyError(`Curriculum item "${input.slug}" is not in the day-one spine`, 'academy.curriculum_not_found');
          }
          return { ...guide, objectives: [...guide.objectives], keyTerms: [...guide.keyTerms], selfCheck: [...guide.selfCheck] };
        }),
      ),

    /**
     * Study guides for a whole path, in the path's display order — one call for
     * a path index. Omitting `path` returns the entire spine.
     */
    curriculumStudyGuides: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ path: curriculumPath.optional() }).optional())
      .output(z.array(curriculumStudyGuideOut))
      .query(({ input }) =>
        listCurriculumStudyGuides(input?.path).map((guide) => ({
          ...guide,
          objectives: [...guide.objectives],
          keyTerms: [...guide.keyTerms],
          selfCheck: [...guide.selfCheck],
        })),
      ),

    /**
     * Depth inventory over the library. `curriculumInventory` answers "are there
     * 20 playbooks and 3 workbooks"; its validation floor is 40 characters, which
     * a three-bullet stub clears. This answers the second question — is any of it
     * long enough to be worth reading — and it answers by NAMING what falls short
     * in `thinSlugs` rather than asserting that nothing does.
     */
    curriculumDepth: scopedProcedure('academy:read', { module: 'academy' })
      .output(curriculumDepthOut)
      .query(() => {
        const report = curriculumDepthReport();
        return { ...report, thinSlugs: [...report.thinSlugs] };
      }),

    /**
     * Stored VOD catalog (TRK-academy.video). Not LiveKit.
     *
     * Unconfigured storage → academy.video_storage_unconfigured.
     * Does not list the bucket (Class X residual).
     */
    videos: scopedProcedure('academy:read', { module: 'academy' })
      .output(
        z.array(
          z.object({
            slug: z.string(),
            title: z.string(),
            path: curriculumPath,
          }),
        ),
      )
      .query(() => guard(async () => [...listAcademyVideos(video)])),

    /**
     * Signed expiring GET after tier/stake gate. URL without grant is refused.
     */
    videoPlayback: scopedProcedure('academy:read', { module: 'academy' })
      .input(
        z
          .object({
            slug: z.string().min(1).max(120),
            /** Raw object URL — refused unless it already carries a grant signature. */
            url: z.string().min(1).max(2000).optional(),
          })
          .strict(),
      )
      .output(
        z.object({
          slug: z.string(),
          playbackUrl: z.string(),
          expiresAt: z.date(),
          grant: z.string(),
        }),
      )
      .query(({ ctx, input }) =>
        guard(async () => {
          if (input.url) {
            assertAcademyVideoUrlGranted(video, input.url);
          }
          return grantAcademyVideoPlayback({
            deps: video,
            slug: input.slug,
            caller: { userId: ctx.principal.userId, tier: ctx.principal.tier },
          });
        }),
      ),

    /**
     * Paper drill gate for a workbook (TRK-academy.paper-trading Stage 2+3).
     *
     * Read-only on purpose: the drill loop is a pure state machine and academy
     * holds no run state, so this answers one question — may this catalog item
     * be drilled against this market, and with which steps. A market that is
     * not flagged `paper: true` by trade refuses here rather than anywhere a
     * user could mistake it for live. Stage-3 ops kill-switch
     * (`ACADEMY_PAPER_TRADING_ENABLED=false`) refuses before the market check —
     * live trade is unaffected. No fills, prices or balances cross this
     * boundary; money truth stays on trade.
     */
    paperDrill: scopedProcedure('academy:read', { module: 'academy' })
      .input(
        z
          .object({
            slug: z.string().min(1),
            market: paperMarketFlagIn.nullable().default(null),
          })
          .strict(),
      )
      .output(paperDrillOut)
      .query(({ input }) =>
        guard(async () => {
          assertPaperInputNeverClaimsLive(input);
          academy.assertPaperTradingEnabled();
          await academy.assertCallerPaperFlagVerified(input.market);
          const item = getCurriculumItem(input.slug);
          if (!item) {
            throw new AcademyError(`Curriculum item "${input.slug}" is not in the day-one spine`, 'academy.curriculum_not_found');
          }
          const result = startPaperDrillForCatalogItem({ slug: input.slug, kind: item.kind, market: input.market });
          if (!result.ok) {
            return { ok: false as const, reason: result.reason, message: result.message };
          }
          const sealed = assertSealedSimulated(
            sealSimulated({
              marketId: result.run.marketId,
              symbol: result.run.symbol,
              steps: result.run.steps.map((step) => ({ id: step.id, instruction: step.instruction })),
            }),
          );
          const wire = {
            ok: true as const,
            simulated: sealed.simulated,
            venue: sealed.venue,
            realLedger: sealed.realLedger,
            withdrawable: sealed.withdrawable,
            realMoney: sealed.realMoney,
            disclaimer: sealed.disclaimer,
            ...sealed.result,
          };
          // D26-P1-C4 — second door: no custody-looking key may ride along.
          assertPaperNeverReadableAsRealMoney(wire);
          return wire;
        }),
      ),

    /**
     * The drill, finished — steps ticked off and trade's fills valued.
     * (TRK-academy.paper-trading Stage-2 "completable with simulated results".)
     *
     * `paperDrill` above answers "may I start this". This answers "what did it
     * come to", which is the half a workbook could not previously reach: the
     * loop's later functions had no caller, so a drill could be opened over the
     * wire and never closed with anything to show.
     *
     * STATELESS, and that is the design rather than a shortcut. Academy stores
     * no run and no position, so the caller replays what happened — the steps
     * they completed and the fills TRADE gave them — and this returns the
     * authoritative reading of it. Every refusal the step-by-step path would
     * have raised is raised here in the same order: a live market, a non-
     * workbook slug, an unknown step, a malformed fill.
     *
     * WHAT IT WILL NOT DO. It has no price source. Prices and sizes are the
     * ones trade published, handed in as decimal strings; a fill missing one is
     * `academy.paper_price_unavailable`, and an open position with no published
     * mark comes back `unrealisedPnl: null, markUnavailable: true`. Neither
     * case is filled in with a plausible number, because a fabricated price in
     * a practice drill is still this platform stating a price that never
     * existed.
     *
     * AND IT MOVES NOTHING. No hold, no fill, no ledger post — doctrine §0.6,
     * and `paper/ledger-isolation.test.ts` fails the build if that changes.
     */
    paperDrillResult: scopedProcedure('academy:read', { module: 'academy' })
      .input(
        z
          .object({
            slug: z.string().min(1),
            market: paperMarketFlagIn.nullable().default(null),
            completedStepIds: z.array(z.string().min(1)).max(64).default([]),
            fills: z.array(publishedFillIn).max(256).default([]),
            /** Trade's published mark for open size. Absent → reported unmarked. */
            markPrice: z.string().min(1).nullable().default(null),
          })
          .strict(),
      )
      .output(paperDrillResultOut)
      .query(({ input }) =>
        guard(async () => {
          assertPaperInputNeverClaimsLive(input);
          academy.assertPaperTradingEnabled();
          await academy.assertCallerPaperFlagVerified(input.market);
          const item = getCurriculumItem(input.slug);
          if (!item) {
            throw new AcademyError(`Curriculum item "${input.slug}" is not in the day-one spine`, 'academy.curriculum_not_found');
          }

          const replayed = replayPaperDrill({
            slug: input.slug,
            kind: item.kind,
            market: input.market,
            completedStepIds: input.completedStepIds,
            fills: input.fills,
          });
          if (!replayed.ok) {
            return { ok: false as const, reason: replayed.reason, message: replayed.message };
          }

          const run = replayed.run;
          const progress = drillProgress(run);
          // Value the post-attach run, not the raw input array. attachPaperFillRef
          // already de-dupes fillId and refuses conflicting re-sends; valuing
          // input.fills would re-inflate PnL when a client double-posts the same id.
          // Incomplete refs (id-only) never reach valuation — publishedFillIn on
          // the wire requires side/price/size, and uniquePublishedFills refuses
          // conflicts that slip past attach.
          const fillsForValue: PublishedFill[] = listPaperFillRefs(run).flatMap((ref) => {
            if (ref.side !== 'buy' && ref.side !== 'sell') return [];
            if (typeof ref.price !== 'string' || typeof ref.size !== 'string') return [];
            return [
              {
                fillId: ref.fillId,
                marketId: ref.marketId,
                side: ref.side,
                price: ref.price,
                size: ref.size,
              },
            ];
          });
          // Throws `academy.paper_price_unavailable` rather than valuing a fill
          // whose price nobody published (or a conflicting fillId pair).
          const valuation = valueSimulatedDrill(fillsForValue, input.markPrice);

          const sealed = assertSealedSimulated(
            sealSimulated({
              workbookSlug: run.workbookSlug,
              marketId: run.marketId,
              symbol: run.symbol,
              status: run.status,
              stepCount: progress.stepCount,
              completedCount: progress.completedCount,
              remainingStepIds: [...remainingStepIds(run)],
              ratio: progress.ratio,
              complete: isDrillComplete(run),
              valuation,
            }),
          );
          const wire = {
            ok: true as const,
            simulated: sealed.simulated,
            venue: sealed.venue,
            realLedger: sealed.realLedger,
            withdrawable: sealed.withdrawable,
            realMoney: sealed.realMoney,
            disclaimer: sealed.disclaimer,
            result: sealed.result,
          };
          // D26-P1-C4 — second door: valuation may not smuggle custody keys.
          assertPaperNeverReadableAsRealMoney(wire);
          return wire;
        }),
      ),

    /**
     * Stage-3 ops status for paper drills (TRK-academy.paper-trading).
     * Reports enable/kill only — never invents prices; live trade unaffected.
     */
    paperOpsStatus: scopedProcedure('academy:read', { module: 'academy' })
      .output(
        z.object({
          enabled: z.boolean(),
          flagId: z.literal(PAPER_OPS_FLAG_ID),
          envKey: z.literal(PAPER_OPS_ENV_KEY),
          liveTradeUnaffected: z.literal(true),
          simulated: z.literal(true),
          venue: z.literal(SIMULATED_VENUE),
          realMoney: z.literal(false),
        }),
      )
      .query(() =>
        guard(async () => {
          const status = academy.paperOpsStatus();
          // Refuse a live/realMoney claim from the service — do not rewrite it quiet.
          assertPaperNeverReadableAsRealMoney(status);
          const wire = {
            enabled: status.enabled,
            flagId: PAPER_OPS_FLAG_ID,
            envKey: PAPER_OPS_ENV_KEY,
            liveTradeUnaffected: true as const,
            simulated: true as const,
            venue: SIMULATED_VENUE,
            realMoney: false as const,
          };
          assertPaperNeverReadableAsRealMoney(wire);
          return wire;
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

    /**
     * The 2D scene (§8.3). Host writes whole scene; optional expectedFingerprint
     * enforces concurrent-edit policy (stale host tab → conflict, not last-write-wins).
     */
    updateScene: scopedProcedure('academy:write', { module: 'academy' })
      .input(
        z.object({
          sessionId: z.string().uuid(),
          scene: z.record(z.unknown()),
          expectedFingerprint: z.string().min(1).max(128).optional(),
        }),
      )
      .output(sessionOut.extend({ sceneFingerprint: z.string() }))
      .mutation(({ ctx, input }) =>
        guard(() =>
          academy.updateScene({
            sessionId: input.sessionId,
            hostId: ctx.principal.userId,
            scene: input.scene,
            ...(input.expectedFingerprint !== undefined ? { expectedFingerprint: input.expectedFingerprint } : {}),
          }),
        ),
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

    /** Reactivate a frozen ambassador without re-appoint (clear freeze reason). */
    unfreezeAmbassador: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ userId: z.string().uuid() }))
      .output(ambassadorOut)
      .mutation(({ input, ctx }) =>
        guard(() =>
          academy.unfreezeAmbassador({
            userId: input.userId,
            operatorId: ctx.principal!.userId,
          }),
        ),
      ),

    /**
     * IFC pay / revenue share under rate authority (D26-P1-C2).
     * Settlement stays dark (no ledger recipe). Quote path opens when owner rates published.
     */
    ambassadorPayPlane: scopedProcedure('admin:read', { module: 'academy' })
      .output(
        z.object({
          ifcPayEnabled: z.literal(false),
          revenueShareEnabled: z.literal(false),
          ifcRateAuthorityPublished: z.boolean(),
          revenueShareRateAuthorityPublished: z.boolean(),
          ifcPayQuoteEnabled: z.boolean(),
          revenueShareQuoteEnabled: z.boolean(),
          classM: z.literal(true),
          residualIfcPay: z.string(),
          residualRevenueShare: z.string(),
        }),
      )
      .query(() => ambassadorPayPlaneStatus({ ifc: ifcPayLaw, revenueShare: revenueShareLaw })),

    /**
     * Public door (academy:read) — typed refuse, never a fake IFC quote.
     * Unset rate authority → rates_unset; never payable.
     */
    ambassadorPayQuote: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ kind: z.enum(['ifc_pay', 'revenue_share']).optional() }).optional())
      .output(publicAmbassadorPayQuoteOut)
      .query(({ input }) =>
        decidePublicAmbassadorPayQuote({
          kind: input?.kind ?? 'ifc_pay',
          law: (input?.kind ?? 'ifc_pay') === 'revenue_share' ? revenueShareLaw : ifcPayLaw,
        }),
      ),

    ambassadorIfcPay: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          beneficiaryId: z.string().uuid(),
          dryRun: z.boolean().optional(),
          residencyStatus: z.enum(['applied', 'accepted', 'rejected', 'withdrawn']).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return attemptAmbassadorPay({
            kind: 'ifc_pay',
            law: ifcPayLaw,
            beneficiaryId: input.beneficiaryId,
            dryRun: input.dryRun,
            residencyStatus: input.residencyStatus,
          });
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    ambassadorRevenueShare: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          beneficiaryId: z.string().uuid(),
          dryRun: z.boolean().optional(),
          residencyStatus: z.enum(['applied', 'accepted', 'rejected', 'withdrawn']).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return attemptAmbassadorPay({
            kind: 'revenue_share',
            law: revenueShareLaw,
            beneficiaryId: input.beneficiaryId,
            dryRun: input.dryRun,
            residencyStatus: input.residencyStatus,
          });
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * Public residency IFC door — refuse when rates unset (accepted residency is not payable).
     */
    residencyPayQuote: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ residencyStatus: residencyStatus.optional() }).optional())
      .output(publicAmbassadorPayQuoteOut)
      .query(({ input }) =>
        decidePublicResidencyPayQuote({
          law: ifcPayLaw,
          residencyStatus: input?.residencyStatus,
        }),
      ),

    /** Operator residency IFC quote under rate authority — accepted residency + published rates. */
    residencyIfcPayQuote: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          beneficiaryId: z.string().uuid(),
          residencyStatus: z.enum(['applied', 'accepted', 'rejected', 'withdrawn']),
          dryRun: z.boolean().optional().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return attemptResidencyIfcPay({
            law: ifcPayLaw,
            beneficiaryId: input.beneficiaryId,
            residencyStatus: input.residencyStatus,
            dryRun: input.dryRun,
          });
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

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

    seasonCalendar: scopedProcedure('academy:read', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid(), at: z.coerce.date().optional() }))
      .output(seasonCalendarOut)
      .query(async ({ input }) =>
        guard(async () => {
          const season = await academy.season(input.seasonId);
          return seasonWindowAt(season, input.at ?? new Date());
        }),
      ),

    tournaments: router({
      policy: publicProcedure.query(() => describeTournamentPolicy()),
    }),

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

    /**
     * Durable freeze audit — ranked standings at live→frozen (no prize fields).
     * Null when the season was never frozen through setSeasonStatus.
     */
    freezeSnapshot: scopedProcedure('admin:read', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid() }))
      .output(
        z
          .object({
            seasonId: z.string().uuid(),
            frozenAt: z.date(),
            standings: z.array(
              z.object({
                rank: z.number().int().positive(),
                userId: z.string(),
                score: z.number().int(),
                updatedAt: z.string(),
              }),
            ),
          })
          .nullable(),
      )
      .query(({ input }) => guard(() => academy.freezeSnapshot(input.seasonId))),

    /**
     * Class N/M honesty — IFC prize pools refuse-closed on the wire.
     * Pure helpers already refuse; this mounts them so operators never see a
     * success path that invents pool amounts. No amount fields on the output.
     * D26-P1-C3: unset start refuse is greppable on statusLine / blankStart.
     */
    tournamentPrizePlane: scopedProcedure('admin:read', { module: 'academy' })
      .output(
        z.object({
          prizesEnabled: z.literal(false),
          ledgerRecipeReady: z.literal(false),
          academyHoldsPrizeBalance: z.literal(false),
          inventIfc: z.literal(false),
          statusLine: z.string(),
          blankStart: z.object({
            status: z.literal('refuse'),
            code: z.literal('academy.prize_pool_unset'),
            reason: z.literal('unset'),
          }),
          intents: z.array(
            z.object({
              kind: z.enum(['fund_pool', 'payout', 'escrow', 'clawback', 'invent_balance']),
              status: z.literal('refuse'),
              code: z.literal('academy.prize_refuse_closed'),
            }),
          ),
        }),
      )
      .query(() => {
        const kinds: PrizeIntentKind[] = ['fund_pool', 'payout', 'escrow', 'clawback', 'invent_balance'];
        const intents = kinds.map((kind) => {
          const d = decidePrizeIntent(kind);
          if (!isPrizeRefuseClosed(d)) {
            // Unreachable while Stage-3 refuse is absolute — fail closed if that ever softens.
            throw new AcademyError('Prize plane must stay refuse-closed', 'academy.season_invalid');
          }
          return { kind: d.kind, status: 'refuse' as const, code: d.code };
        });
        const blankStart = decidePrizePoolStart(null);
        if (blankStart.code !== 'academy.prize_pool_unset' || blankStart.reason !== 'unset') {
          throw new AcademyError('Blank prize start must stay prize_pool_unset', 'academy.season_invalid');
        }
        return {
          prizesEnabled: false as const,
          ledgerRecipeReady: false as const,
          academyHoldsPrizeBalance: false as const,
          inventIfc: false as const,
          statusLine: prizeRefuseStatusLine(),
          blankStart: {
            status: 'refuse' as const,
            code: 'academy.prize_pool_unset' as const,
            reason: 'unset' as const,
          },
          intents,
        };
      }),

    /** Operator attempt to fund/pay/escrow — always refuse, never invents amounts. */
    tournamentPrizeIntent: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ kind: z.enum(['fund_pool', 'payout', 'escrow', 'clawback', 'invent_balance']) }))
      .output(
        z.object({
          ok: z.literal(false),
          status: z.literal('refuse'),
          code: z.literal('academy.prize_refuse_closed'),
          kind: z.enum(['fund_pool', 'payout', 'escrow', 'clawback', 'invent_balance']),
          message: z.string(),
          academyHoldsPrizeBalance: z.literal(false),
          ledgerRecipeReady: z.literal(false),
        }),
      )
      .mutation(({ input }) => {
        const d = decidePrizeIntent(input.kind);
        return {
          ok: false as const,
          status: 'refuse' as const,
          code: d.code,
          kind: d.kind,
          message: d.message,
          academyHoldsPrizeBalance: false as const,
          ledgerRecipeReady: false as const,
        };
      }),

    /**
     * D26-P1-C3 — start a prize-bearing season.
     * Blank / unset pool → PRECONDITION_FAILED `academy.prize_pool_unset`.
     * Amount present without Class M recipes → still refuse (no invent IFC).
     * Never returns ok / never invents pool amounts on the wire.
     */
    tournamentPrizeStart: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          seasonId: z.string().uuid().optional(),
          /** Owner pool amount (decimal string). Blank / omitted → unset refuse. */
          prizePool: z
            .union([z.string(), z.object({ amount: z.string().optional().nullable() }).passthrough()])
            .optional()
            .nullable(),
        }),
      )
      .mutation(({ input }) => {
        try {
          assertMayStartPrizeSeason(input.prizePool);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    setStanding: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ seasonId: z.string().uuid(), userId: z.string().uuid(), score: z.number().int() }))
      .output(standingOut.omit({ rank: true }))
      .mutation(({ input }) => guard(() => academy.setStanding(input))),

    /**
     * Bulk score staging on the wire (was pure-only residual).
     * Live season only; empty/dup/bad score refuse closed. No prize invent.
     */
    bulkSetStandings: scopedProcedure('admin:write', { module: 'academy' })
      .input(
        z.object({
          seasonId: z.string().uuid(),
          patches: z.array(z.object({ userId: z.string().uuid(), score: z.number().int() })).max(500),
        }),
      )
      .output(
        z.discriminatedUnion('ok', [
          z.object({
            ok: z.literal(true),
            accepted: z.number().int().nonnegative(),
            statusLine: z.string(),
            standings: z.array(standingOut.omit({ rank: true })),
          }),
          z.object({
            ok: z.literal(false),
            reason: z.string(),
            message: z.string(),
            statusLine: z.string(),
            badUserId: z.string().optional(),
          }),
        ]),
      )
      .mutation(({ input }) =>
        guard(async () => {
          const result = await academy.bulkSetStandings(input);
          if (!result.ok) {
            return {
              ok: false as const,
              reason: result.reason,
              message: result.message,
              statusLine: `ok=0 accepted=0 refused=1 reason=${result.reason}`,
              ...(result.badUserId !== undefined ? { badUserId: result.badUserId } : {}),
            };
          }
          return {
            ok: true as const,
            accepted: result.accepted,
            statusLine: bulkScoreStatusLine(
              validateBulkScoreWrite({
                seasonStatus: 'live',
                seasonId: input.seasonId,
                patches: input.patches,
              }),
            ),
            standings: result.standings,
          };
        }),
      ),

    // ── Certifications (progress + grants + XP emit + perk real/refuse — NO PAY) ─
    //
    // Definitions are code-seeded. Completions and grants are durable. Stage-2
    // publishes `intafaced.identity.xp.earned` on grant. D26-P1-C1 then surfaces
    // real svc-identity perks or refuses invent perk money — never a cert→perk
    // map or academy perk book (§4.1). Nothing here posts to the ledger.

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

    /**
     * Grant the caller's own certification, publish the XP it is worth, and
     * report real identity perks (or refuse when invent/unreadable).
     *
     * Safe to call twice: the grant is idempotent on (user, cert) and the award
     * carries that same business key, which identity drops on conflict. Calling
     * it again after a bus outage is the documented way to recover a missing
     * award — see academy-service.grantCert.
     */
    grantCert: scopedProcedure('academy:write', { module: 'academy' })
      .input(z.object({ certId: z.string().min(1).max(64) }))
      .output(
        z.object({
          grant: certGrantOut,
          alreadyGranted: z.boolean(),
          xp: certXpOut,
          perks: certPerkOutcomeOut,
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
            xp: result.xp,
            perks: result.perks,
          };
        }),
      ),

    /**
     * Stage-2 XP plane status: is this process publishing awards at all, under
     * which module/action, and what each cert is worth. Answers "my cert did not
     * move my rank" without guessing — `emitEnabled: false` is a deployment
     * fact, not a ladder disagreement.
     */
    certXpPlane: scopedProcedure('academy:read', { module: 'academy' })
      .output(certXpPlaneOut)
      .query(() => {
        const plane = academy.certXpPlane();
        return { ...plane, policies: [...plane.policies] };
      }),

    /**
     * D26-P1-C1 perk plane: real perks via identity rank only; invent money refuse-closed.
     */
    certPerkPlane: scopedProcedure('academy:read', { module: 'academy' })
      .output(certPerkPlaneOut)
      .query(() => {
        const plane = academy.certPerkPlane();
        return { ...plane, inventKindsRefuseClosed: [...plane.inventKindsRefuseClosed] };
      }),

    /**
     * Operator attempt to invent cert→perk money / map — always refuse, never amounts.
     */
    certPerkIntent: scopedProcedure('admin:write', { module: 'academy' })
      .input(z.object({ kind: certPerkInventKind }))
      .output(
        z.object({
          ok: z.literal(false),
          status: z.literal('refuse'),
          code: z.literal(CERT_PERK_REFUSE_CODE),
          kind: certPerkInventKind,
          message: z.string(),
          academyHoldsPerkMoney: z.literal(false),
          academyMapsCertToPerk: z.literal(false),
          residual: z.literal(CERT_PERK_RESIDUAL),
        }),
      )
      .mutation(({ input }) => {
        const d = decideCertPerkInvent(input.kind as CertPerkInventKind);
        if (!isCertPerkInventRefuseClosed(d)) {
          throw new AcademyError('Cert perk invent plane must stay refuse-closed', 'academy.cert_invalid');
        }
        return {
          ok: false as const,
          status: 'refuse' as const,
          code: d.code,
          kind: d.kind,
          message: d.message,
          academyHoldsPerkMoney: false as const,
          academyMapsCertToPerk: false as const,
          residual: d.residual,
        };
      }),

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
