import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount } from '@intafaced/ledger-client';
import { hasScope } from '@intafaced/auth';
import { TokenError, type TokenService } from './token-service.js';

/**
 * svc-token API surface.
 *
 * Hot path for other services remains GET /internal/stake/:userId (index.ts).
 * This router mounts under /trpc for edge/principal-aware callers.
 */

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

function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  if (err instanceof TokenError) {
    switch (err.code) {
      case 'token.proposal_not_found':
      case 'token.stake_not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'token.proposal_not_allowed':
      case 'token.already_voted':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      default:
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
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

export function createTokenRouter(token: TokenService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-token') }))
      .query(() => ({ ok: true, service: 'svc-token' as const })),

    stakeOf: scopedProcedure('token:read')
      .input(z.object({ userId: z.string().uuid() }))
      .output(z.object({ staked: z.string() }))
      .query(async ({ input }) => {
        const staked = await token.stakeOf(input.userId);
        return { staked: staked.toString() };
      }),

    accessOf: scopedProcedure('token:read')
      .input(z.object({ userId: z.string().uuid() }))
      .output(
        z.object({
          staked: z.string(),
          tier: z.string(),
          feeDiscountBps: z.number().int(),
        }),
      )
      .query(async ({ input }) => {
        const access = await token.accessOf(input.userId);
        return {
          staked: access.staked.toString(),
          // `access.tier` is an AccessTier object, not a string. `String()` on
          // it produced "[object Object]" on every call, and the `z.string()`
          // output schema below is exactly why that typechecked and shipped.
          tier: access.tier.name,
          feeDiscountBps: access.feeDiscountBps,
        };
      }),

    // ── Governance (§4.3) ──────────────────────────────────────────────────

    /**
     * Open a proposal. Staked-tier (Initiate+) needs `token:stake`; operators
     * may use `admin:write` / `admin:treasury` without stake. Scope is dual
     * so this uses protectedProcedure rather than a single scopedProcedure.
     */
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

    /**
     * Cast one IFC-weighted ballot. Weight is the caller's live `stakeOf`,
     * snapshotted onto the vote row — not re-read at tally.
     */
    castVote: scopedProcedure('token:stake')
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
