import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, scopedProcedure } from '@intafaced/contracts';
import { SealedHouseTenantRegistry, type TenantDescribe, type TenantRefusal } from '@intafaced/execution-house-tenant';
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
    }),
  });
}

export type ExecutionRouter = ReturnType<typeof createExecutionRouter>;
