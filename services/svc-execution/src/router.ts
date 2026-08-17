import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, scopedProcedure } from '@intafaced/contracts';
import { SealedHouseTenantRegistry, type TenantDescribe, type TenantRefusal } from '@intafaced/execution-house-tenant';
import { planOmsRoute } from './oms-plan.js';
import { withExecutionSpan } from './tracing.js';

const tenantIdInput = z.object({ tenantId: z.string().min(1).max(128) });

const describeOutput = z.union([
  z.object({
    tenantId: z.string(),
    keyNamespace: z.string(),
    killed: z.boolean(),
    auditCount: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['internal_venue', 'kill_switch', 'unknown_tenant', 'invalid_venue']),
    detail: z.string(),
  }),
]);

function isRefusal(value: TenantDescribe | TenantRefusal): value is TenantRefusal {
  return 'ok' in value && value.ok === false;
}

const decimalString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are positive decimal strings');

const latencyGradeInput = z.object({
  venueId: z.string().min(1),
  measurement: z.literal('rest-round-trip'),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']).nullable(),
  samples: z.number().int().nonnegative(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  rejectRateBps: z.number().nullable(),
  errorRateBps: z.number().nullable(),
  staleMs: z.number().nullable(),
  provisional: z.boolean(),
  reasons: z.array(z.string()),
});

const omsVenueInput = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']),
  price: decimalString,
  amount: decimalString,
  feeBps: z.number().int().nonnegative(),
  costTerms: z.object({
    feeBps: z.number().nullable(),
    expectedImpactBps: z.number().nullable(),
    transferCostBps: z.number().nullable(),
    latencyGrade: latencyGradeInput.nullable(),
  }),
});

const omsPlanInput = z.object({
  symbol: z.string().min(1).max(64),
  side: z.enum(['buy', 'sell']),
  amount: decimalString,
  venues: z.array(omsVenueInput).min(1).max(16),
  tenantId: z.string().min(1).max(128).optional(),
});

export function createExecutionRouter(registry: SealedHouseTenantRegistry) {
  return router({
    execution: router({
      tenant: router({
        describe: scopedProcedure('admin:read', { module: 'execution' })
          .input(tenantIdInput)
          .output(describeOutput)
          .query(async ({ input }) => {
            return withExecutionSpan('execution.tenant.describe', input.tenantId, async () => {
              const result = registry.describe(input.tenantId);
              if (isRefusal(result)) return result;
              return result;
            });
          }),

        kill: scopedProcedure('admin:write', { module: 'execution' })
          .input(tenantIdInput)
          .mutation(async ({ ctx, input }) => {
            return withExecutionSpan('execution.tenant.kill', input.tenantId, async () => {
              const existing = registry.get(input.tenantId);
              if (!existing) {
                const created = registry.register(input.tenantId, ctx.principal!.userId);
                if ('ok' in created && created.ok === false) {
                  throw new TRPCError({ code: 'BAD_REQUEST', message: created.detail });
                }
              }
              const result = registry.kill(input.tenantId, ctx.principal!.userId);
              if ('ok' in result && result.ok === false) {
                throw new TRPCError({ code: 'NOT_FOUND', message: result.detail });
              }
              return result;
            });
          }),
      }),

      oms: router({
        plan: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsPlanInput)
          .mutation(async ({ ctx, input }) => {
            return withExecutionSpan('execution.oms.plan', input.tenantId ?? 'none', async () => {
              return planOmsRoute(
                {
                  symbol: input.symbol,
                  side: input.side,
                  amount: input.amount,
                  venues: input.venues,
                  tenantId: input.tenantId,
                  actor: ctx.principal!.userId,
                },
                registry,
              );
            });
          }),
      }),
    }),
  });
}

export type ExecutionRouter = ReturnType<typeof createExecutionRouter>;
