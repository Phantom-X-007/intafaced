import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { LaunchError } from './errors.js';
import type { LaunchService, RaiseRecord } from './launch-service.js';

/**
 * svc-launch's API (§8.4).
 *
 * ── Authorisation, stated once ──────────────────────────────────────────────
 *
 * Nothing here takes a userId from the input. `contribute`, `claim` and every
 * "mine" query resolve `ctx.principal.userId`, and every issuer-side procedure
 * passes that same id to the service, which compares it against the raise's
 * `issuer_id` before it will act. An endpoint that accepted "open THIS raise as
 * THAT issuer" would let anyone escrow another person's supply.
 *
 * `launch` is `custodial: true` in the module registry, so `{ module: 'launch' }`
 * on every procedure puts the jurisdiction matrix in front of the money paths —
 * a region that may not buy into a sale gets a FORBIDDEN before anything is
 * escrowed, not a refund afterwards.
 *
 * ── Money on the wire ───────────────────────────────────────────────────────
 *
 * Decimal STRINGS, in and out, validated by `amountString`. There is no number
 * anywhere in this file that is money, and a client that sends one gets a
 * validation error rather than a silently truncated commitment.
 */

/** 18 decimal places, unsigned. The same shape the ledger's wire schema uses. */
const amountString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are unsigned decimal strings (max 18dp)');

const raiseOut = z.object({
  id: z.string().uuid(),
  issuerId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  saleAssetId: z.string(),
  paymentAssetId: z.string(),
  mode: z.enum(['presale', 'fair']),
  status: z.enum(['draft', 'funding', 'succeeded', 'failed', 'settled', 'cancelled']),
  saleSupply: amountString,
  price: amountString.nullable(),
  softCap: amountString,
  hardCap: amountString,
  feeBps: z.number().int(),
  opensAt: z.date(),
  closesAt: z.date(),
  vestCliffDays: z.number().int().nullable(),
  vestDurationDays: z.number().int().nullable(),
  outcomeAt: z.date().nullable(),
});

const tierOut = z.object({
  id: z.string().uuid(),
  raiseId: z.string().uuid(),
  name: z.string(),
  minStake: amountString,
  allocationCap: amountString,
});

const contributionOut = z.object({
  raiseId: z.string().uuid(),
  userId: z.string().uuid(),
  committed: amountString,
  commitSeq: z.number().int(),
  tierName: z.string().nullable(),
  status: z.enum(['committed', 'settled', 'refunded']),
});

const allocationOut = z.object({
  raiseId: z.string().uuid(),
  userId: z.string().uuid(),
  contributed: amountString,
  refund: amountString,
  saleAmount: amountString,
  settledAt: z.date().nullable(),
});

const scheduleOut = z.object({
  id: z.string().uuid(),
  raiseId: z.string().uuid().nullable(),
  beneficiaryId: z.string().uuid(),
  assetId: z.string(),
  total: amountString,
  released: amountString,
  claimable: amountString,
  cliffAt: z.date(),
  startAt: z.date(),
  endAt: z.date(),
});

function serialiseRaise(raise: RaiseRecord): z.infer<typeof raiseOut> {
  return {
    ...raise,
    saleSupply: formatAmount(raise.saleSupply),
    price: raise.price === null ? null : formatAmount(raise.price),
    softCap: formatAmount(raise.softCap),
    hardCap: formatAmount(raise.hardCap),
  };
}

/**
 * Error codes are preserved, not flattened.
 *
 * `launch.hard_cap_reached` is a CONFLICT a client can act on ("the sale filled
 * up"), `launch.tier_not_met` is a FORBIDDEN with a remedy ("stake more"), and
 * `launch.stake_unavailable` is a dependency being down, which is nobody's
 * fault and worth retrying. One generic 500 would make all three look like a
 * bug in the request.
 */
function toTrpcError(err: unknown): TRPCError {
  if (!(err instanceof LaunchError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Request failed', cause: err });
  }

  switch (err.code) {
    case 'launch.raise_not_found':
    case 'launch.contribution_not_found':
    case 'launch.schedule_not_found':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });

    case 'launch.not_issuer':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    case 'launch.tier_not_met':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });

    case 'launch.hard_cap_reached':
    case 'launch.allocation_cap_reached':
    case 'launch.bad_status':
    case 'launch.window_closed':
    case 'launch.window_not_closed':
    case 'launch.nothing_claimable':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });

    case 'launch.below_minimum':
    case 'launch.no_tiers':
    case 'launch.no_supply':
    case 'launch.no_price':
    case 'launch.invalid_contribution':
    case 'launch.vesting_empty':
    case 'launch.vesting_window':
    case 'launch.vesting_cliff':
      return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });

    case 'launch.stake_unavailable':
    case 'launch.vesting_released':
    case 'launch.vesting_overreleased':
    case 'launch.settle_count_failed':
      // The stake gate being down is an upstream outage, not a bad request; an
      // over-released schedule is a book that disagrees with itself and pages
      // an operator; a settlement that cannot count what is left must not report
      // itself finished. All ours, and all 500s on purpose.
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
  }
}

export function createLaunchRouter(launch: LaunchService) {
  /** Wraps a resolver so every LaunchError leaves as the right tRPC code. */
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw toTrpcError(err);
    }
  };

  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-launch') }))
      .query(() => ({ ok: true, service: 'svc-launch' as const })),

    // ── Browsing ─────────────────────────────────────────────────────────────

    /** Every raise a contributor may see. Drafts are excluded — they are terms nobody has committed to. */
    list: scopedProcedure('launch:read', { module: 'launch' })
      .input(z.object({ status: raiseOut.shape.status.optional() }).optional())
      .output(z.array(raiseOut))
      .query(async ({ input }) => (await launch.listRaises({ ...(input?.status ? { status: input.status } : {}) })).map(serialiseRaise)),

    get: scopedProcedure('launch:read', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid() }))
      .output(z.object({ raise: raiseOut, tiers: z.array(tierOut), raised: amountString }))
      .query(({ input }) =>
        guard(async () => {
          const raise = await launch.raise(input.raiseId);
          const tiers = await launch.tiers(raise.id);
          return {
            raise: serialiseRaise(raise),
            tiers: tiers.map((t) => ({ ...t, minStake: formatAmount(t.minStake), allocationCap: formatAmount(t.allocationCap) })),
            raised: formatAmount(await launch.raised(raise.id)),
          };
        }),
      ),

    /** The decided allocation. Public once the raise has closed — that is the point of publishing it. */
    allocations: scopedProcedure('launch:read', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid() }))
      .output(z.array(allocationOut))
      .query(({ input }) =>
        guard(async () =>
          (await launch.allocations(input.raiseId)).map((a) => ({
            ...a,
            contributed: formatAmount(a.contributed),
            refund: formatAmount(a.refund),
            saleAmount: formatAmount(a.saleAmount),
          })),
        ),
      ),

    // ── Contributing ─────────────────────────────────────────────────────────

    /**
     * Commit to a raise.
     *
     * No `tier` option, deliberately. `launch` is `OPEN_FULL` in the
     * jurisdiction matrix, so `{ module: 'launch' }` already requires full
     * verification — and it does so per REGION, which a hardcoded tier here
     * could only contradict. One rule, one place (packages/config).
     *
     * The stake gate is a separate question and is checked inside the service,
     * live, against svc-token.
     */
    contribute: scopedProcedure('launch:write', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid(), amount: amountString }))
      .output(contributionOut)
      .mutation(({ ctx, input }) =>
        guard(async () => {
          const c = await launch.contribute({
            raiseId: input.raiseId,
            userId: ctx.principal.userId,
            amount: parseAmount(input.amount),
          });
          return { ...c, committed: formatAmount(c.committed) };
        }),
      ),

    /** The caller's own commitment, and what is still escrowed for it in the ledger. */
    myContribution: scopedProcedure('launch:read', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid() }))
      .output(z.object({ contribution: contributionOut.nullable(), escrowed: amountString }))
      .query(({ ctx, input }) =>
        guard(async () => {
          const c = await launch.contribution(input.raiseId, ctx.principal.userId);
          return {
            contribution: c ? { ...c, committed: formatAmount(c.committed) } : null,
            escrowed: formatAmount(await launch.escrowed(input.raiseId, ctx.principal.userId)),
          };
        }),
      ),

    // ── Issuer ───────────────────────────────────────────────────────────────

    create: scopedProcedure('launch:write', { module: 'launch' })
      .input(
        z.object({
          slug: z
            .string()
            .min(3)
            .max(64)
            .regex(/^[a-z0-9-]+$/, 'a slug is lowercase letters, digits and hyphens'),
          name: z.string().min(1).max(120),
          saleAssetId: z.string().min(1).max(16),
          paymentAssetId: z.string().min(1).max(16),
          mode: z.enum(['presale', 'fair']),
          saleSupply: amountString,
          price: amountString.nullable(),
          softCap: amountString,
          hardCap: amountString,
          feeBps: z.number().int().min(0).max(9_999),
          opensAt: z.coerce.date(),
          closesAt: z.coerce.date(),
          vestCliffDays: z.number().int().min(0).max(3_650).nullable().optional(),
          vestDurationDays: z.number().int().min(1).max(3_650).nullable().optional(),
        }),
      )
      .output(raiseOut)
      .mutation(({ ctx, input }) =>
        guard(async () =>
          serialiseRaise(
            await launch.createRaise({
              ...input,
              issuerId: ctx.principal.userId,
              saleSupply: parseAmount(input.saleSupply),
              price: input.price === null ? null : parseAmount(input.price),
              softCap: parseAmount(input.softCap),
              hardCap: parseAmount(input.hardCap),
              vestCliffDays: input.vestCliffDays ?? null,
              vestDurationDays: input.vestDurationDays ?? null,
            }),
          ),
        ),
      ),

    addTier: scopedProcedure('launch:write', { module: 'launch' })
      .input(
        z.object({
          raiseId: z.string().uuid(),
          name: z.string().min(1).max(40),
          minStake: amountString,
          allocationCap: amountString,
        }),
      )
      .output(tierOut)
      .mutation(({ ctx, input }) =>
        guard(async () => {
          const tier = await launch.addTier({
            raiseId: input.raiseId,
            issuerId: ctx.principal.userId,
            name: input.name,
            minStake: parseAmount(input.minStake),
            allocationCap: parseAmount(input.allocationCap),
          });
          return { ...tier, minStake: formatAmount(tier.minStake), allocationCap: formatAmount(tier.allocationCap) };
        }),
      ),

    /** Escrows the supply and opens the window. The first movement of the raise. */
    open: scopedProcedure('launch:write', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid() }))
      .output(raiseOut)
      .mutation(({ ctx, input }) =>
        guard(async () => serialiseRaise(await launch.open({ raiseId: input.raiseId, issuerId: ctx.principal.userId }))),
      ),

    cancel: scopedProcedure('launch:write', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid() }))
      .output(raiseOut)
      .mutation(({ ctx, input }) =>
        guard(async () => serialiseRaise(await launch.cancel({ raiseId: input.raiseId, issuerId: ctx.principal.userId }))),
      ),

    /**
     * Decide the outcome.
     *
     * Deliberately callable by ANY authenticated holder of `launch:write`, not
     * just the issuer. Closing is not a favour the issuer does the contributors
     * — it is what unlocks their refund on a failed raise, and an issuer who
     * simply never called it could hold everyone's money indefinitely. The
     * decision itself is pure: it reads the closed book and the published terms,
     * so who invokes it cannot change the answer.
     */
    close: scopedProcedure('launch:write', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid() }))
      .output(z.object({ raise: raiseOut, contributors: z.number().int() }))
      .mutation(({ input }) =>
        guard(async () => {
          const { raise, lines } = await launch.close({ raiseId: input.raiseId });
          return { raise: serialiseRaise(raise), contributors: lines.length };
        }),
      ),

    /** Pay out one batch. Same reasoning as `close` — a refund must not need the issuer's cooperation. */
    settle: scopedProcedure('launch:write', { module: 'launch' })
      .input(z.object({ raiseId: z.string().uuid(), limit: z.number().int().min(1).max(1_000).optional() }))
      .output(z.object({ settled: z.number().int(), remaining: z.number().int(), finished: z.boolean() }))
      .mutation(({ input }) =>
        guard(async () => launch.settle({ raiseId: input.raiseId, ...(input.limit ? { limit: input.limit } : {}) })),
      ),

    // ── Vesting ──────────────────────────────────────────────────────────────

    /** The caller's own schedules, each with what it would pay right now. */
    vesting: scopedProcedure('launch:read', { module: 'launch' })
      .output(z.array(scheduleOut))
      .query(({ ctx }) =>
        guard(async () => {
          const schedules = await launch.schedules(ctx.principal.userId);
          const now = new Date();
          return Promise.all(
            schedules.map(async (s) => ({
              id: s.id,
              raiseId: s.raiseId,
              beneficiaryId: s.beneficiaryId,
              assetId: s.assetId,
              total: formatAmount(s.total),
              released: formatAmount(s.released),
              claimable: formatAmount(await launch.claimableNow(s.id, now)),
              cliffAt: s.cliffAt,
              startAt: s.startAt,
              endAt: s.endAt,
            })),
          );
        }),
      ),

    claim: scopedProcedure('launch:write', { module: 'launch' })
      .input(z.object({ scheduleId: z.string().uuid() }))
      .output(z.object({ released: amountString, ledgerTxId: z.string() }))
      .mutation(({ ctx, input }) =>
        guard(async () => {
          const result = await launch.claim({ scheduleId: input.scheduleId, beneficiaryId: ctx.principal.userId });
          return { released: formatAmount(result.released), ledgerTxId: result.ledgerTxId };
        }),
      ),
  });
}

export type LaunchRouter = ReturnType<typeof createLaunchRouter>;
