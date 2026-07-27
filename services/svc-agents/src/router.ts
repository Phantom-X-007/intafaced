import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount } from '@intafaced/ledger-client';
import { AgentError } from './errors.js';
import type { AuditedAction } from './fleet/audit.js';
import type { ModelGateway } from './gateway/gateway.js';
import type { UsageMeter } from './metering/meter.js';
import type { AgentRuntime } from './runtime.js';

/**
 * The internal tRPC surface (§1: "Fastify + tRPC (internal) / REST (public)").
 *
 * Two rules shape every procedure here.
 *
 * **Nothing leaves this service that a user may not see.** Outputs are declared
 * with `.output()` so the contract is validated on the way out, and the shapes
 * below carry routing task ids, model ALIASES and i18n keys — never a vendor
 * name, never an upstream error body, never a prompt (Doctrine §0.7, §10).
 *
 * **The log is the product.** `log.mine` and `session.log` return the same rows
 * an auditor would read, keyed for i18n, because §8.2's Agentic Law promises
 * the user a visible log and not a summary of one.
 *
 * A user always reads their own actions: every log query is scoped to
 * `ctx.principal.userId` rather than to a userId in the input. An agent audit
 * trail that one user can query for another is a privacy incident wearing a
 * feature's clothes.
 */

const actionOutput = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  agentId: z.string(),
  sequence: z.number().int(),
  kind: z.enum(['session_open', 'session_close', 'completion', 'embedding', 'tool_call', 'usage_settlement']),
  status: z.enum(['executed', 'refused', 'failed']),
  tool: z.string().nullable(),
  /** The routing task. Configuration, not a product name. */
  task: z.string().nullable(),
  /** The routing alias. The concrete upstream id never leaves the adapter. */
  model: z.string().nullable(),
  /** Counts as strings: they are bigint in the database and JSON has no bigint. */
  inputTokens: z.string(),
  outputTokens: z.string(),
  cost: z.string(),
  refusalCode: z.string().nullable(),
  /** i18n key + params. The surface renders; this service never ships prose. */
  messageKey: z.string(),
  messageParams: z.record(z.union([z.string(), z.number()])),
  occurredAt: z.string(),
});

const sessionOutput = z.object({
  id: z.string().uuid(),
  agentId: z.string(),
  guardrailVersion: z.number().int(),
  status: z.enum(['open', 'closed']),
  metered: z.boolean(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
});

function toActionOutput(action: AuditedAction) {
  return {
    id: action.id,
    sessionId: action.sessionId,
    agentId: action.agentId,
    sequence: action.sequence,
    kind: action.kind,
    status: action.status,
    tool: action.tool,
    task: action.task,
    model: action.model,
    inputTokens: action.inputTokens.toString(),
    outputTokens: action.outputTokens.toString(),
    cost: formatAmount(action.cost),
    refusalCode: action.refusalCode,
    messageKey: action.userMessageKey,
    messageParams: action.userMessageParams,
    occurredAt: action.occurredAt.toISOString(),
  };
}

/**
 * Map a domain error onto tRPC.
 *
 * The user-facing text is the COPY KEY, not `err.message`: the message is for
 * operators and is the one string in the system that could carry an upstream's
 * own words. `intafacedCode` lets a client branch on the machine code.
 */
function toTRPCError(err: unknown): TRPCError {
  if (err instanceof AgentError) {
    const code =
      err.code === 'agents.refused'
        ? 'FORBIDDEN'
        : err.code === 'agents.session_not_found' || err.code === 'agents.agent_not_found'
          ? 'NOT_FOUND'
          : err.code === 'agents.provider_unavailable'
            ? 'SERVICE_UNAVAILABLE'
            : 'BAD_REQUEST';

    return new TRPCError({ code, message: err.userMessageKey, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'agents.error.engine_unavailable' });
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toTRPCError(err);
  }
}

export interface AgentsRouterDeps {
  readonly runtime: AgentRuntime;
  readonly gateway: ModelGateway;
  readonly meter: UsageMeter;
  readonly feeAssetId: string;
}

export function createAgentsRouter(deps: AgentsRouterDeps) {
  const { runtime, gateway, meter, feeAssetId } = deps;

  /** A session belongs to exactly one user, and only that user may touch it. */
  async function ownedSession(sessionId: string, userId: string) {
    const session = await runtime.session(sessionId);
    // Same error for "does not exist" and "is not yours": distinguishing them
    // turns this endpoint into an oracle for other people's session ids.
    if (!session || session.userId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'agents.refused.session_closed' });
    }
    return session;
  }

  return router({
    health: publicProcedure.output(z.object({ ok: z.literal(true), service: z.string() })).query(() => ({
      ok: true as const,
      service: 'svc-agents',
    })),

    /**
     * The tasks this deployment can serve, and their ceilings.
     *
     * Deliberately includes the price: §8.2 meters per user, and a metered
     * service that will not tell you its rate before you use it is a service
     * nobody should use.
     */
    routes: router({
      list: scopedProcedure('agents:read', { module: 'agents' })
        .output(
          z.array(
            z.object({
              task: z.string(),
              maxOutputTokens: z.number().int(),
              capability: z.enum(['complete', 'stream', 'embed']),
              inputPerMillion: z.string(),
              outputPerMillion: z.string(),
              assetId: z.string(),
            }),
          ),
        )
        .query(() =>
          gateway.routingTable.routes.map((route) => ({
            task: route.task,
            maxOutputTokens: route.maxOutputTokens,
            capability: route.capability,
            inputPerMillion: formatAmount(route.price.inputPerMillion),
            outputPerMillion: formatAmount(route.price.outputPerMillion),
            assetId: feeAssetId,
          })),
        ),
    }),

    agent: router({
      /** What an agent may do, so a user can read the guardrail before granting a session. */
      get: scopedProcedure('agents:read', { module: 'agents' })
        .input(z.object({ agentId: z.string().min(1) }))
        .output(
          z
            .object({
              agentId: z.string(),
              version: z.number().int(),
              enabled: z.boolean(),
              tools: z.array(
                z.object({
                  name: z.string(),
                  module: z.string(),
                  mode: z.enum(['read', 'write']),
                  requiresApproval: z.boolean(),
                  maxCallsPerSession: z.number().int().nullable(),
                }),
              ),
              limits: z.object({
                maxActionsPerSession: z.number().int(),
                maxOutputTokensPerCall: z.number().int(),
                maxSpendPerSession: z.string().nullable(),
                allowedModules: z.array(z.string()),
                allowedTasks: z.array(z.string()),
              }),
            })
            .nullable(),
        )
        .query(({ input }) =>
          guard(async () => {
            const definition = await runtime.agentDefinition(input.agentId);
            if (!definition) return null;

            const { guardrail, enabled } = definition;
            return {
              agentId: guardrail.agentId,
              version: guardrail.version,
              enabled,
              tools: guardrail.tools.map((t) => ({
                name: t.name,
                module: t.module,
                mode: t.mode,
                requiresApproval: t.requiresApproval,
                maxCallsPerSession: t.maxCallsPerSession ?? null,
              })),
              limits: {
                maxActionsPerSession: guardrail.limits.maxActionsPerSession,
                maxOutputTokensPerCall: guardrail.limits.maxOutputTokensPerCall,
                maxSpendPerSession: guardrail.limits.maxSpendPerSession === null ? null : formatAmount(guardrail.limits.maxSpendPerSession),
                allowedModules: [...guardrail.limits.allowedModules],
                allowedTasks: [...guardrail.limits.allowedTasks],
              },
            };
          }),
        ),
    }),

    session: router({
      open: scopedProcedure('agents:execute', { module: 'agents' })
        .input(z.object({ agentId: z.string().min(1) }))
        .output(sessionOutput)
        .mutation(({ ctx, input }) =>
          guard(async () => {
            const session = await runtime.openSession({ userId: ctx.principal.userId, agentId: input.agentId });
            return {
              id: session.id,
              agentId: session.agentId,
              guardrailVersion: session.guardrailVersion,
              status: session.status,
              metered: session.metered,
              openedAt: session.openedAt.toISOString(),
              closedAt: session.closedAt?.toISOString() ?? null,
            };
          }),
        ),

      close: scopedProcedure('agents:execute', { module: 'agents' })
        .input(z.object({ sessionId: z.string().uuid() }))
        .output(sessionOutput)
        .mutation(({ ctx, input }) =>
          guard(async () => {
            await ownedSession(input.sessionId, ctx.principal.userId);
            // Settle before closing: a session that ends with unbilled windows
            // leaves usage that only a sweep job would ever find.
            await runtime.settleSession(input.sessionId);
            const session = await runtime.closeSession(input.sessionId);
            return {
              id: session.id,
              agentId: session.agentId,
              guardrailVersion: session.guardrailVersion,
              status: session.status,
              metered: session.metered,
              openedAt: session.openedAt.toISOString(),
              closedAt: session.closedAt?.toISOString() ?? null,
            };
          }),
        ),

      log: scopedProcedure('agents:read', { module: 'agents' })
        .input(z.object({ sessionId: z.string().uuid() }))
        .output(z.array(actionOutput))
        .query(({ ctx, input }) =>
          guard(async () => {
            await ownedSession(input.sessionId, ctx.principal.userId);
            return (await runtime.sessionLog(input.sessionId)).map(toActionOutput);
          }),
        ),
    }),

    run: router({
      /**
       * One metered engine call.
       *
       * `requestId` is supplied by the CALLER and is the anti-double-bill
       * handle: a client that retries after a timeout reuses it, and the
       * usage is counted once no matter how many times the request arrives.
       */
      complete: scopedProcedure('agents:execute', { module: 'agents' })
        .input(
          z.object({
            sessionId: z.string().uuid(),
            requestId: z.string().min(8).max(200),
            task: z.string().min(1),
            system: z.string().max(20_000).optional(),
            messages: z
              .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(200_000) }))
              .min(1)
              .max(200),
            maxOutputTokens: z.number().int().min(1).optional(),
          }),
        )
        .output(
          z.object({
            text: z.string(),
            inputTokens: z.number().int(),
            outputTokens: z.number().int(),
            cost: z.string(),
            assetId: z.string(),
            metered: z.boolean(),
            action: actionOutput,
          }),
        )
        .mutation(({ ctx, input }) =>
          guard(async () => {
            await ownedSession(input.sessionId, ctx.principal.userId);
            const result = await runtime.think({
              sessionId: input.sessionId,
              requestId: input.requestId,
              task: input.task,
              ...(input.system ? { system: input.system } : {}),
              messages: input.messages,
              ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
            });

            return {
              text: result.text,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              cost: formatAmount(result.cost),
              assetId: feeAssetId,
              metered: result.metered,
              action: toActionOutput(result.action),
            };
          }),
        ),
    }),

    usage: router({
      /** What the current window would cost if it settled now. Bills nothing. */
      current: scopedProcedure('agents:read', { module: 'agents' })
        .input(z.object({ sessionId: z.string().uuid() }))
        .output(z.object({ windowId: z.string(), pending: z.string(), sessionTotal: z.string(), assetId: z.string() }))
        .query(({ ctx, input }) =>
          guard(async () => {
            await ownedSession(input.sessionId, ctx.principal.userId);
            const windowId = meter.windowFor();
            const [pending, sessionTotal] = await Promise.all([
              meter.pendingCost(input.sessionId, windowId),
              meter.sessionSpend(input.sessionId),
            ]);
            return {
              windowId,
              pending: formatAmount(pending),
              sessionTotal: formatAmount(sessionTotal),
              assetId: feeAssetId,
            };
          }),
        ),

      /**
       * Settle a window. Operator scope, not the user's.
       *
       * Settlement is a scheduled sweep, not something a user triggers — and
       * `admin:write` is what makes "who caused this charge" answerable when it
       * is triggered by hand.
       */
      settle: scopedProcedure('admin:write', { module: 'agents' })
        .input(z.object({ sessionId: z.string().uuid(), windowId: z.string().min(1) }))
        .output(z.object({ amount: z.string(), assetId: z.string(), chargeKey: z.string(), settled: z.boolean() }))
        .mutation(({ input }) =>
          guard(async () => {
            const result = await runtime.settleWindow(input.sessionId, input.windowId);
            return {
              amount: formatAmount(result.amount),
              assetId: feeAssetId,
              chargeKey: result.chargeKey,
              settled: result.settled,
            };
          }),
        ),
    }),

    /** THE USER-VISIBLE LOG (§8.2). Always the caller's own. */
    log: router({
      mine: scopedProcedure('agents:read', { module: 'agents' })
        .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }))
        .output(z.array(actionOutput))
        .query(({ ctx, input }) => guard(async () => (await runtime.userLog(ctx.principal.userId, input.limit)).map(toActionOutput))),
    }),
  });
}

export type AgentsRouter = ReturnType<typeof createAgentsRouter>;
