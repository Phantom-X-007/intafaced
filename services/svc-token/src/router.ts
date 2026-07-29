import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { InsufficientFundsError, LedgerError, formatAmount, parseAmount } from '@intafaced/ledger-client';
import { hasScope } from '@intafaced/auth';
import { TokenError, type TokenService } from './token-service.js';

/**
 * svc-token API surface.
 *
 * Hot path for other services remains GET /internal/stake/:userId (index.ts).
 * This router mounts under /trpc for edge/principal-aware callers.
 *
 * Mutations: `token:stake` (users stake/unstake/vote), `admin:treasury` (mint).
 * Governance from #97 and live stake/emissions from #94 are both on this router.
 */

/** Money crosses the wire as a decimal string. Always. Never a number. */
const amountString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amount must be an unsigned decimal string (max 18dp)');

const stakeTier = z.enum(['flex', 'm3', 'm12']);

const stakeOutput = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  amount: amountString,
  tier: stakeTier,
  startedAt: z.string(),
  unlocksAt: z.string().nullable(),
  status: z.enum(['pending', 'active', 'unstaking', 'closed']),
});

const proposalKind = z.enum(['listing', 'fee_param', 'curriculum', 'grant']);
const proposalStatus = z.enum(['draft', 'open', 'passed', 'rejected', 'executed', 'cancelled']);
const voteChoice = z.enum(['for', 'against', 'abstain']);

const proposalOutput = z.object({
  id: z.string().uuid(),
  kind: proposalKind,
  body: z.record(z.unknown()),
  status: proposalStatus,
  opensAt: z.string(),
  closesAt: z.string(),
  createdAt: z.string(),
});

const tallyOutput = z.object({
  forWeight: z.string(),
  againstWeight: z.string(),
  abstainWeight: z.string(),
  totalWeight: z.string(),
  voterCount: z.number().int().nonnegative(),
});

export interface TokenRouterOptions {
  /**
   * Kill-switch for minting. When false every mint procedure fails closed —
   * inflation cannot be un-minted (§4.3 / EMISSIONS_ENABLED).
   */
  emissionsEnabled?: boolean;
}

function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  if (err instanceof InsufficientFundsError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof TokenError) {
    switch (err.code) {
      case 'token.proposal_not_found':
      case 'token.stake_not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'token.proposal_not_allowed':
      case 'token.already_voted':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case 'token.stake_locked':
      case 'token.stake_closed':
      case 'token.stake_conflict':
      case 'token.epoch_closed':
      case 'token.supply_exhausted':
      case 'token.nothing_to_distribute':
      case 'token.params_missing':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      default:
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }
  if (err instanceof LedgerError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Token operation failed', cause: err });
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toTrpcError(err);
  }
}

function assertSelf(principalUserId: string | undefined, ownerId: string): void {
  if (principalUserId !== ownerId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This stake belongs to another user' });
  }
}

function stakeToWire(s: {
  id: string;
  userId: string;
  amount: bigint;
  tier: 'flex' | 'm3' | 'm12';
  startedAt: Date;
  unlocksAt: Date | null;
  status: 'active' | 'unstaking' | 'closed';
}) {
  return {
    id: s.id,
    userId: s.userId,
    amount: formatAmount(s.amount),
    tier: s.tier,
    startedAt: s.startedAt.toISOString(),
    unlocksAt: s.unlocksAt?.toISOString() ?? null,
    status: s.status,
  };
}

function proposalToWire(p: {
  id: string;
  kind: z.infer<typeof proposalKind>;
  body: Record<string, unknown>;
  status: z.infer<typeof proposalStatus>;
  opensAt: Date;
  closesAt: Date;
  createdAt: Date;
}) {
  return {
    id: p.id,
    kind: p.kind,
    body: p.body,
    status: p.status,
    opensAt: p.opensAt.toISOString(),
    closesAt: p.closesAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

export function createTokenRouter(token: TokenService, options: TokenRouterOptions = {}) {
  const emissionsEnabled = options.emissionsEnabled ?? true;

  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-token') }))
      .query(() => ({ ok: true, service: 'svc-token' as const })),

    // Self-only on the interactive surface. Cross-user stake is HMAC-only:
    // GET /internal/stake/:userId (L2-IDOR-STAKE).
    stakeOf: scopedProcedure('token:read', { module: 'token' })
      .input(z.object({}).optional())
      .output(z.object({ staked: z.string() }))
      .query(async ({ ctx }) => {
        const userId = ctx.principal.userId;
        if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });
        const staked = await token.stakeOf(userId);
        return { staked: staked.toString() };
      }),

    accessOf: scopedProcedure('token:read', { module: 'token' })
      .input(z.object({}).optional())
      .output(
        z.object({
          staked: z.string(),
          tier: z.string(),
          feeDiscountBps: z.number().int(),
        }),
      )
      .query(async ({ ctx }) => {
        const userId = ctx.principal.userId;
        if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });
        const access = await token.accessOf(userId);
        return {
          staked: access.staked.toString(),
          tier: access.tier.name,
          feeDiscountBps: access.feeDiscountBps,
        };
      }),

    // ── Staking (live path) ────────────────────────────────────────────────
    // Jurisdiction matrix on every custodial mutation (L2-TOKEN-JURIS).

    stake: scopedProcedure('token:stake', { module: 'token' })
      .input(
        z.object({
          amount: amountString,
          tier: stakeTier,
          stakeId: z.string().uuid().optional(),
        }),
      )
      .output(stakeOutput)
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });

          const amount = parseAmount(input.amount);
          if (amount <= 0n) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Stake amount must be positive' });
          }

          const stake = await token.stake({
            userId,
            amount,
            tier: input.tier,
            stakeId: input.stakeId,
          });
          return stakeToWire(stake);
        }),
      ),

    unstake: scopedProcedure('token:stake', { module: 'token' })
      .input(z.object({ stakeId: z.string().uuid() }))
      .output(stakeOutput)
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });

          const existing = await token.getStake(input.stakeId);
          if (!existing) throw new TokenError(`Stake ${input.stakeId} not found`, 'token.stake_not_found');
          assertSelf(userId, existing.userId);

          const stake = await token.unstake(input.stakeId);
          return stakeToWire(stake);
        }),
      ),

    listStakes: scopedProcedure('token:read', { module: 'token' })
      .input(z.object({ status: z.enum(['active', 'closed', 'pending', 'all']).default('active') }).default({ status: 'active' }))
      .output(z.array(stakeOutput))
      .query(async ({ ctx, input }) =>
        guard(async () => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });
          const stakes = await token.listStakes(userId, input.status);
          return stakes.map(stakeToWire);
        }),
      ),

    // ── Emissions ──────────────────────────────────────────────────────────

    mintEpoch: scopedProcedure('admin:treasury')
      .input(z.object({ epoch: z.number().int().nonnegative().optional() }).default({}))
      .output(z.object({ epoch: z.number().int(), minted: amountString }))
      .mutation(async ({ input }) =>
        guard(async () => {
          if (!emissionsEnabled) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Emissions are disabled (EMISSIONS_ENABLED=false)',
            });
          }
          const result = input.epoch === undefined ? await token.mintNextEpoch() : await token.mintEpoch(input.epoch);
          return { epoch: result.epoch, minted: formatAmount(result.minted) };
        }),
      ),

    nextEmissionEpoch: scopedProcedure('token:read')
      .output(z.object({ epoch: z.number().int().nonnegative() }))
      .query(async () => guard(async () => ({ epoch: await token.nextEmissionEpoch() }))),

    // ── Governance (§4.3) ──────────────────────────────────────────────────

    createProposal: protectedProcedure
      .input(
        z.object({
          kind: proposalKind,
          body: z.record(z.unknown()).default({}),
          opensAt: z.string().datetime({ offset: true }).optional(),
          closesAt: z.string().datetime({ offset: true }).optional(),
          proposalId: z.string().uuid().optional(),
        }),
      )
      .output(proposalOutput)
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });

          const asAdmin = hasScope(ctx.principal.scopes, 'admin:write') || hasScope(ctx.principal.scopes, 'admin:treasury');
          if (!asAdmin && !hasScope(ctx.principal.scopes, 'token:stake')) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'createProposal requires token:stake or admin:write',
            });
          }

          const proposal = await token.createProposal({
            kind: input.kind,
            body: input.body,
            createdBy: userId,
            asAdmin,
            opensAt: input.opensAt ? new Date(input.opensAt) : undefined,
            closesAt: input.closesAt ? new Date(input.closesAt) : undefined,
            proposalId: input.proposalId,
          });
          return proposalToWire(proposal);
        }),
      ),

    castVote: scopedProcedure('token:stake', { module: 'token' })
      .input(
        z.object({
          proposalId: z.string().uuid(),
          choice: voteChoice,
        }),
      )
      .output(
        z.object({
          id: z.string().uuid(),
          proposalId: z.string().uuid(),
          userId: z.string().uuid(),
          weight: z.string(),
          choice: voteChoice,
          castAt: z.string(),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });

          const vote = await token.castVote({
            proposalId: input.proposalId,
            userId,
            choice: input.choice,
          });
          return {
            id: vote.id,
            proposalId: vote.proposalId,
            userId: vote.userId,
            weight: formatAmount(vote.weight),
            choice: vote.choice,
            castAt: vote.castAt.toISOString(),
          };
        }),
      ),

    listProposals: scopedProcedure('token:read')
      .input(
        z
          .object({
            status: proposalStatus.optional(),
            kind: proposalKind.optional(),
            limit: z.number().int().min(1).max(200).optional(),
          })
          .default({}),
      )
      .output(z.array(proposalOutput))
      .query(async ({ input }) =>
        guard(async () => {
          const rows = await token.listProposals(input);
          return rows.map(proposalToWire);
        }),
      ),

    getProposal: scopedProcedure('token:read')
      .input(z.object({ proposalId: z.string().uuid() }))
      .output(proposalOutput.extend({ tally: tallyOutput }))
      .query(async ({ input }) =>
        guard(async () => {
          const detail = await token.getProposal(input.proposalId);
          return {
            ...proposalToWire(detail),
            tally: {
              forWeight: formatAmount(detail.tally.forWeight),
              againstWeight: formatAmount(detail.tally.againstWeight),
              abstainWeight: formatAmount(detail.tally.abstainWeight),
              totalWeight: formatAmount(detail.tally.totalWeight),
              voterCount: detail.tally.voterCount,
            },
          };
        }),
      ),
  });
}

export type TokenRouter = ReturnType<typeof createTokenRouter>;
