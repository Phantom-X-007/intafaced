import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { formatAmount } from '@intafaced/ledger-client';
import { AgentError } from './errors.js';
import type { AuditedAction } from './fleet/audit.js';
import type { ModelGateway } from './gateway/gateway.js';
import type { UsageMeter } from './metering/meter.js';
import type { AgentRuntime } from './runtime.js';
import { rankFixtures } from './scanner/rank.js';
import { rankLiveFromTickers } from './scanner/rank-live.js';
import { scannerAgentGuardrail } from './scanner/guardrail.js';
import { invokeScannerDataTool } from './scanner/data-tools.js';
import { scannerTierGate } from './scanner/tier-gate.js';
import { runScannerRankSession } from './scanner/session-run.js';
import { SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL } from './scanner/signal-inputs-law.js';
import { navigatorGrounded } from './navigator/grounded.js';
import { selectNavigatorTools } from './navigator/tool-select.js';
import { navigatorAgentGuardrail } from './navigator/guardrail.js';
import { invokeNavigatorDataTool } from './navigator/data-tools.js';
import { navigatorTierGate } from './navigator/tier-gate.js';
import { runNavigatorAnswerSession } from './navigator/session-run.js';
import { auditNavigatorDataTool, emptyNavigatorAuditLog } from './navigator/action-audit.js';
import { supportAgentGuardrail } from './support-agent/guardrail.js';
import { buildLeaderStats } from './copy-intel/stats.js';
import { runCopyIntelStatsSession } from './copy-intel/session-run.js';
import { watchApprovalFixtures } from './merchant/watch.js';
import { runMerchantWatchSession } from './merchant/session-run.js';
import { parseGuardrail, serialiseGuardrail } from './fleet/guardrails.js';
import { draftTicketComment } from './support-agent/comment-draft.js';
import { supportGrounded } from './support-agent/grounded.js';
import { supportTierGate } from './support-agent/tier-gate.js';
import { invokeSupportDataTool, supportAnswerOrEscalate } from './support-agent/data-tools.js';
import { runSupportReplySession } from './support-agent/session-run.js';
import { auditSupportDataTool, emptySupportAuditLog } from './support-agent/action-audit.js';

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

/**
 * What a metered agent run cost, on the wire.
 *
 * Amounts are decimal STRINGS: they are scaled bigint in the meter and JSON has
 * no bigint, and a money field that arrives as a `number` has already lost the
 * argument (§0.5). Shared by every run that opens a session, so two agents can
 * never drift into reporting their bill in two different shapes.
 */
const runMeteringOutput = z.object({
  sessionId: z.string().nullable(),
  billedAmount: z.string(),
  assetId: z.string(),
  sessionClosed: z.boolean(),
  settlements: z.array(
    z.object({
      windowId: z.string(),
      amount: z.string(),
      chargeKey: z.string(),
      settled: z.boolean(),
    }),
  ),
});

/**
 * One grounded fact a navigator data tool returned.
 *
 * Every branch is an echo of what the tool was given or found. There is no
 * "assumed" or "estimated" member, and there is nowhere for one to hide: a
 * navigator answer is exactly the union of these, or it is a refusal.
 */
const navigatorFindingOutput = z.union([
  z.object({
    status: z.literal('ok'),
    tool: z.literal('trade.quote'),
    marketId: z.string(),
    last: z.string(),
    asOf: z.string(),
  }),
  z.object({
    status: z.literal('ok'),
    tool: z.literal('trade.markets.list'),
    markets: z.array(
      z.object({
        marketId: z.string(),
        symbol: z.string(),
        status: z.enum(['open', 'halted', 'closed']),
      }),
    ),
  }),
  z.object({
    status: z.literal('ok'),
    tool: z.literal('identity.session.read'),
    session: z.object({
      sessionId: z.string(),
      userId: z.string(),
      status: z.enum(['open', 'closed']),
    }),
  }),
]);

/** An ask that produced no fact, and who refused it. */
const navigatorUnansweredOutput = z.object({
  tool: z.string(),
  refusedBy: z.enum(['guardrail', 'tool']),
  reason: z.string(),
  userMessageKey: z.string(),
});

/**
 * One grounded fact a support desk tool returned.
 *
 * Same shape discipline as the navigator's: every branch echoes a row the caller
 * supplied or the desk held. The account projection carries status and KYC tier
 * and nothing else — there is no balance field here to leak or invent, which is
 * how §0.6 is kept by construction rather than by review.
 */
const supportFindingOutput = z.union([
  z.object({
    status: z.literal('ok'),
    tool: z.literal('support.kb.search'),
    articles: z.array(
      z.object({
        articleKey: z.string(),
        titleKey: z.string(),
        bodyKey: z.string(),
      }),
    ),
  }),
  z.object({
    status: z.literal('ok'),
    tool: z.literal('support.ticket.read'),
    ticket: z.object({
      ticketId: z.string(),
      ownerUserId: z.string(),
      status: z.enum(['open', 'pending', 'resolved', 'closed']),
      category: z.string(),
    }),
  }),
  z.object({
    status: z.literal('ok'),
    tool: z.literal('identity.account.read'),
    account: z.object({
      userId: z.string(),
      status: z.enum(['active', 'frozen', 'closed']),
      kycTier: z.string(),
    }),
  }),
]);

/** A desk read that produced no fact, and who refused it. */
const supportUnansweredOutput = z.object({
  tool: z.string(),
  refusedBy: z.enum(['guardrail', 'tool']),
  reason: z.string(),
  userMessageKey: z.string(),
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

      /**
       * Settle every open (or sealed-unbilled) window on a session.
       *
       * Same money path as `session.close` / `runtime.settleSession` — one
       * `feeCharge` per window, ledger-keyed, idempotent. Operator-only so a
       * user cannot force a house sweep; `usage.settle` remains for a single
       * known window id.
       */
      settleSession: scopedProcedure('admin:write', { module: 'agents' })
        .input(z.object({ sessionId: z.string().uuid() }))
        .output(
          z.object({
            assetId: z.string(),
            settlements: z.array(
              z.object({
                windowId: z.string(),
                amount: z.string(),
                chargeKey: z.string(),
                settled: z.boolean(),
              }),
            ),
          }),
        )
        .mutation(({ input }) =>
          guard(async () => {
            const results = await runtime.settleSession(input.sessionId);
            return {
              assetId: feeAssetId,
              settlements: results.map((r) => ({
                windowId: r.windowId,
                amount: formatAmount(r.amount),
                chargeKey: r.chargeKey,
                settled: r.settled,
              })),
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

    /**
     * Market Scanner — Stage-1 fixture rank + Stage-2 live data tools residual.
     *
     * Spec: docs/ops/trk/agents.scanner.md. Never invents prices or market rows:
     * caller hands allowlisted fixtures / tool rows. Dark plane + blank tier law
     * + unsealed D26-P0-11 signal-inputs law refuse-closed. No ledger, no order placement.
     */
    scanner: router({
      rankFixtures: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            fixtures: z
              .array(
                z.object({
                  marketId: z.string().min(1).max(64),
                  last: z.string().nullable(),
                  volume24h: z.string().nullable(),
                  change24hBps: z.number().int().nullable(),
                  asOf: z.string().min(1),
                  maxAgeMs: z.number().int().positive().max(86_400_000),
                }),
              )
              .max(500),
            limit: z.number().int().min(1).max(100).optional(),
            marketPlane: z.enum(['live', 'dark']).optional(),
            marketAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            now: z.string().datetime().optional(),
            /** D26-P0-11. Blank / omitted → refuse ranked signals (D26-P1-A3). */
            signalInputsLaw: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  p0_11: z.literal('sealed'),
                  allowedInputs: z
                    .array(z.enum(['last', 'volume24h', 'change24hBps', 'spread', 'funding']))
                    .max(20),
                  rankingRecipeId: z.literal('abs_change_x_log_volume'),
                }),
              ])
              .nullable()
              .optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              signals: z.array(
                z.object({
                  marketId: z.string(),
                  score: z.string(),
                  reasons: z.array(z.string()),
                }),
              ),
              rankedAt: z.string(),
              considered: z.number().int(),
              skippedStale: z.number().int(),
              skippedIncomplete: z.number().int(),
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.scanner.empty'),
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.scanner.unavailable'),
              reason: z.enum(['stale', 'no_quotes', 'market_plane_dark']),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum([
                'signal_inputs_law_blank',
                'inputs_empty',
                'ranking_recipe_unknown',
                'required_inputs_missing',
              ]),
              userMessageKey: z.literal('agents.scanner.signal_inputs_closed'),
              residual: z.literal(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = rankFixtures(input.fixtures, {
            ...(input.limit === undefined ? {} : { limit: input.limit }),
            ...(input.marketPlane === undefined ? {} : { marketPlane: input.marketPlane }),
            ...(input.marketAllowlist === undefined ? {} : { marketAllowlist: input.marketAllowlist }),
            ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            signalInputsLaw: input.signalInputsLaw ?? null,
          });
          // Strip readonly for the wire shape (zod output is mutable arrays).
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              rankedAt: result.rankedAt,
              considered: result.considered,
              skippedStale: result.skippedStale,
              skippedIncomplete: result.skippedIncomplete,
              signals: result.signals.map((s) => ({
                marketId: s.marketId,
                score: s.score,
                reasons: [...s.reasons],
              })),
            };
          }
          return result;
        }),

      /**
       * Stage-2 declared read-only spot toolset. Money-write tools are not on
       * the list (refuse as undeclared / money_write before dispatch).
       */
      stage2Guardrail: scopedProcedure('agents:read', { module: 'agents' })
        .output(
          z.object({
            agentId: z.string(),
            version: z.number().int(),
            tools: z.array(
              z.object({
                name: z.string(),
                module: z.string(),
                mode: z.enum(['read', 'write']),
                requiresApproval: z.boolean(),
                maxCallsPerSession: z.number().int().optional(),
              }),
            ),
            limits: z.object({
              maxActionsPerSession: z.number().int(),
              maxOutputTokensPerCall: z.number().int(),
              maxSpendPerSession: z.string().nullable(),
              allowedModules: z.array(z.string()),
              allowedTasks: z.array(z.string()),
            }),
          }),
        )
        .query(() => serialiseGuardrail(scannerAgentGuardrail())),

      /**
       * Stage-2 tier gate — signal depth. Product-law matrix blank/unpublished
       * → refuse-closed. Does not invent free/staked depth.
       */
      tierGate: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z
                    .record(
                      z.object({
                        maxSignals: z.number().int().min(0).max(100),
                        tools: z.array(z.string().min(1).max(120)).max(100),
                      }),
                    )
                    .default({}),
                }),
              ])
              .nullable()
              .optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              userTier: z.string(),
              maxSignals: z.number().int(),
              allowedTools: z.array(z.string()),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['tier_law_blank', 'tier_not_granted', 'depth_invalid']),
              userMessageKey: z.literal('agents.scanner.tier_closed'),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = scannerTierGate({ law: input.law ?? null, userTier: input.userTier });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              userTier: result.userTier,
              maxSignals: result.maxSignals,
              allowedTools: [...result.allowedTools],
            };
          }
          return result;
        }),

      /**
       * Stage-2 real data tool invoke. Fixtures only — no invent quotes.
       * Tier law blank → refuse-closed. Max-age / incomplete → typed refuse.
       */
      invokeDataTool: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            tool: z.string().min(1).max(120),
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64).optional(),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z
                    .record(
                      z.object({
                        maxSignals: z.number().int().min(0).max(100),
                        tools: z.array(z.string().min(1).max(120)).max(100),
                      }),
                    )
                    .default({}),
                }),
              ])
              .nullable()
              .optional(),
            now: z.string().datetime().optional(),
            ticker: z
              .object({
                marketId: z.string().min(1).max(64),
                last: z.string().nullable(),
                volume24h: z.string().nullable(),
                change24hBps: z.number().int().nullable(),
                asOf: z.string().min(1),
                maxAgeMs: z.number().int().positive().max(86_400_000),
              })
              .nullable()
              .optional(),
            markets: z
              .array(
                z.object({
                  marketId: z.string().min(1).max(64),
                  symbol: z.string().min(1).max(64),
                  status: z.enum(['open', 'halted', 'closed']),
                }),
              )
              .max(500)
              .nullable()
              .optional(),
            bookTop: z
              .object({
                marketId: z.string().min(1).max(64),
                bid: z.string().nullable(),
                ask: z.string().nullable(),
                asOf: z.string().min(1),
                maxAgeMs: z.number().int().positive().max(86_400_000),
              })
              .nullable()
              .optional(),
          }),
        )
        .output(
          z.union([
            z.object({
              status: z.literal('ok'),
              tool: z.literal('trade.ticker'),
              marketId: z.string(),
              last: z.string(),
              volume24h: z.string(),
              change24hBps: z.number().int(),
              asOf: z.string(),
            }),
            z.object({
              status: z.literal('ok'),
              tool: z.literal('trade.markets.list'),
              markets: z.array(
                z.object({
                  marketId: z.string(),
                  symbol: z.string(),
                  status: z.enum(['open', 'halted', 'closed']),
                }),
              ),
            }),
            z.object({
              status: z.literal('ok'),
              tool: z.literal('trade.book.top'),
              marketId: z.string(),
              bid: z.string(),
              ask: z.string(),
              asOf: z.string(),
            }),
            z.object({
              status: z.literal('refuse'),
              tool: z.string(),
              reason: z.enum([
                'market_plane_dark',
                'tier_law_blank',
                'tier_not_granted',
                'depth_invalid',
                'tool_not_declared',
                'money_write',
                'tool_not_in_tier',
                'missing_fixture',
                'incomplete_ticker',
                'incomplete_book',
                'invalid_decimal',
                'stale',
                'empty_markets',
              ]),
              userMessageKey: z.enum(['agents.scanner.unavailable', 'agents.scanner.tier_closed']),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = invokeScannerDataTool({
            tool: input.tool,
            plane: input.plane,
            tierLaw: input.law ?? null,
            userTier: input.userTier ?? '',
            ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            ticker: input.ticker ?? null,
            markets: input.markets ?? null,
            bookTop: input.bookTop ?? null,
          });
          if (result.status === 'ok' && result.tool === 'trade.markets.list') {
            return {
              status: 'ok' as const,
              tool: 'trade.markets.list' as const,
              markets: result.markets.map((m) => ({
                marketId: m.marketId,
                symbol: m.symbol,
                status: m.status,
              })),
            };
          }
          return result;
        }),

      /**
       * Stage-2 rank via allowlisted ticker tools + tier depth.
       * Blank P0-11 / blank law / dark plane / all tickers refused → typed refuse (no invent).
       */
      rankLive: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z
                    .record(
                      z.object({
                        maxSignals: z.number().int().min(0).max(100),
                        tools: z.array(z.string().min(1).max(120)).max(100),
                      }),
                    )
                    .default({}),
                }),
              ])
              .nullable()
              .optional(),
            signalInputsLaw: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  p0_11: z.literal('sealed'),
                  allowedInputs: z
                    .array(z.enum(['last', 'volume24h', 'change24hBps', 'spread', 'funding']))
                    .max(20),
                  rankingRecipeId: z.literal('abs_change_x_log_volume'),
                }),
              ])
              .nullable()
              .optional(),
            tickers: z
              .array(
                z.object({
                  marketId: z.string().min(1).max(64),
                  last: z.string().nullable(),
                  volume24h: z.string().nullable(),
                  change24hBps: z.number().int().nullable(),
                  asOf: z.string().min(1),
                  maxAgeMs: z.number().int().positive().max(86_400_000),
                }),
              )
              .max(500),
            marketAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              signals: z.array(
                z.object({
                  marketId: z.string(),
                  score: z.string(),
                  reasons: z.array(z.string()),
                }),
              ),
              rankedAt: z.string(),
              considered: z.number().int(),
              skippedStale: z.number().int(),
              skippedIncomplete: z.number().int(),
              maxSignals: z.number().int(),
              userTier: z.string(),
              tickersAccepted: z.number().int(),
              tickersRefused: z.number().int(),
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.scanner.empty'),
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.scanner.unavailable'),
              reason: z.enum(['stale', 'no_quotes', 'market_plane_dark']),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum([
                'tier_law_blank',
                'tier_not_granted',
                'depth_invalid',
                'market_plane_dark',
                'no_live_tickers',
                'signal_inputs_law_blank',
                'inputs_empty',
                'ranking_recipe_unknown',
                'required_inputs_missing',
              ]),
              userMessageKey: z.enum([
                'agents.scanner.unavailable',
                'agents.scanner.tier_closed',
                'agents.scanner.signal_inputs_closed',
              ]),
              residual: z.literal(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL).optional(),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = rankLiveFromTickers({
            plane: input.plane,
            tierLaw: input.law ?? null,
            userTier: input.userTier,
            tickers: input.tickers,
            signalInputsLaw: input.signalInputsLaw ?? null,
            ...(input.marketAllowlist === undefined ? {} : { marketAllowlist: input.marketAllowlist }),
            ...(input.now === undefined ? {} : { now: new Date(input.now) }),
          });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              rankedAt: result.rankedAt,
              considered: result.considered,
              skippedStale: result.skippedStale,
              skippedIncomplete: result.skippedIncomplete,
              maxSignals: result.maxSignals,
              userTier: result.userTier,
              tickersAccepted: result.tickersAccepted,
              tickersRefused: result.tickersRefused,
              signals: result.signals.map((s) => ({
                marketId: s.marketId,
                score: s.score,
                reasons: [...s.reasons],
              })),
            };
          }
          return result;
        }),

      /**
       * Stage-2 `scanner.rank` as a METERED RUN on the fleet runtime.
       *
       * The routes above are pure: they answer "what would the scanner say"
       * without a session, so the declared guardrail is enforced by nothing at
       * call time and the usage is metered by nothing at all. This one runs the
       * same pure ranker through `openSession → act → settle → closeSession`,
       * so every ticker fetch is guardrail-checked and audited, and the run
       * settles through `UsageMeter` → ledger — the only accounting path.
       *
       * A mutation, not a query: it opens a session and writes audit rows.
       */
      runSession: scopedProcedure('agents:execute', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z
                    .record(
                      z.object({
                        maxSignals: z.number().int().min(0).max(100),
                        tools: z.array(z.string().min(1).max(120)).max(100),
                      }),
                    )
                    .default({}),
                }),
              ])
              .nullable()
              .optional(),
            signalInputsLaw: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  p0_11: z.literal('sealed'),
                  allowedInputs: z
                    .array(z.enum(['last', 'volume24h', 'change24hBps', 'spread', 'funding']))
                    .max(20),
                  rankingRecipeId: z.literal('abs_change_x_log_volume'),
                }),
              ])
              .nullable()
              .optional(),
            // Capped well under the guardrail's per-session action budget: one
            // ticker is one audited tool call.
            tickers: z
              .array(
                z.object({
                  marketId: z.string().min(1).max(64),
                  last: z.string().nullable(),
                  volume24h: z.string().nullable(),
                  change24hBps: z.number().int().nullable(),
                  asOf: z.string().min(1),
                  maxAgeMs: z.number().int().positive().max(86_400_000),
                }),
              )
              .max(50),
            marketAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              signals: z.array(
                z.object({
                  marketId: z.string(),
                  score: z.string(),
                  reasons: z.array(z.string()),
                }),
              ),
              rankedAt: z.string(),
              considered: z.number().int(),
              skippedStale: z.number().int(),
              skippedIncomplete: z.number().int(),
              maxSignals: z.number().int(),
              userTier: z.string(),
              tickersAccepted: z.number().int(),
              tickersRefusedByTool: z.number().int(),
              tickersRefusedByGuardrail: z.number().int(),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.scanner.empty'),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.scanner.unavailable'),
              reason: z.enum(['stale', 'no_quotes', 'market_plane_dark']),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum([
                'tier_law_blank',
                'tier_not_granted',
                'depth_invalid',
                'market_plane_dark',
                'no_live_tickers',
                'signal_inputs_law_blank',
                'inputs_empty',
                'ranking_recipe_unknown',
                'required_inputs_missing',
              ]),
              userMessageKey: z.enum([
                'agents.scanner.unavailable',
                'agents.scanner.tier_closed',
                'agents.scanner.signal_inputs_closed',
              ]),
              residual: z.literal(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL).optional(),
              tickersRefusedByTool: z.number().int(),
              tickersRefusedByGuardrail: z.number().int(),
              metering: runMeteringOutput,
            }),
          ]),
        )
        .mutation(({ ctx, input }) =>
          guard(async () => {
            const result = await runScannerRankSession({
              runtime,
              userId: ctx.principal.userId,
              feeAssetId,
              plane: input.plane,
              tierLaw: input.law ?? null,
              signalInputsLaw: input.signalInputsLaw ?? null,
              userTier: input.userTier,
              tickers: input.tickers,
              ...(input.marketAllowlist === undefined ? {} : { marketAllowlist: input.marketAllowlist }),
              ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            });

            const metering = {
              sessionId: result.metering.sessionId,
              billedAmount: result.metering.billedAmount,
              assetId: result.metering.assetId,
              sessionClosed: result.metering.sessionClosed,
              settlements: result.metering.settlements.map((s) => ({
                windowId: s.windowId,
                amount: s.amount,
                chargeKey: s.chargeKey,
                settled: s.settled,
              })),
            };

            if (result.status === 'ok') {
              return {
                status: 'ok' as const,
                rankedAt: result.rankedAt,
                considered: result.considered,
                skippedStale: result.skippedStale,
                skippedIncomplete: result.skippedIncomplete,
                maxSignals: result.maxSignals,
                userTier: result.userTier,
                tickersAccepted: result.tickersAccepted,
                tickersRefusedByTool: result.tickersRefusedByTool,
                tickersRefusedByGuardrail: result.tickersRefusedByGuardrail,
                signals: result.signals.map((s) => ({
                  marketId: s.marketId,
                  score: s.score,
                  reasons: [...s.reasons],
                })),
                metering,
              };
            }

            if (result.status === 'refuse') {
              return {
                status: 'refuse' as const,
                reason: result.reason,
                userMessageKey: result.userMessageKey,
                ...(result.residual === undefined ? {} : { residual: result.residual }),
                tickersRefusedByTool: result.tickersRefusedByTool,
                tickersRefusedByGuardrail: result.tickersRefusedByGuardrail,
                metering,
              };
            }

            if (result.status === 'empty') {
              return { status: 'empty' as const, userMessageKey: result.userMessageKey, metering };
            }

            return {
              status: 'unavailable' as const,
              userMessageKey: result.userMessageKey,
              reason: result.reason,
              metering,
            };
          }),
        ),
    }),

    /**
     * Navigator Stage-2 grounded plane gate.
     *
     * Caller states whether the trade data plane is live or dark. Dark refuses
     * plan/tool_select grounding rather than inventing market context.
     * Spec: docs/ops/trk/agents.navigator.md Stage 2.
     */
    navigator: router({
      grounded: scopedProcedure('agents:read', { module: 'agents' })
        .input(z.object({ plane: z.enum(['live', 'dark']) }))
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              plane: z.literal('live'),
              allowedTasks: z.tuple([z.literal('navigator.plan'), z.literal('navigator.tool_select')]),
            }),
            z.object({
              status: z.literal('refuse'),
              plane: z.literal('dark'),
              reason: z.literal('trade_plane_dark'),
              userMessageKey: z.literal('agents.navigator.unavailable'),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = navigatorGrounded(input.plane);
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              plane: 'live' as const,
              allowedTasks: ['navigator.plan', 'navigator.tool_select'] as ['navigator.plan', 'navigator.tool_select'],
            };
          }
          return result;
        }),

      /**
       * Stage-1 declared toolset + ceilings. Money-write tools are not on the
       * list (refuse as undeclared before dispatch). Spec: agents.navigator Stage 1.
       */
      stage1Guardrail: scopedProcedure('agents:read', { module: 'agents' })
        .output(
          z.object({
            agentId: z.string(),
            version: z.number().int(),
            tools: z.array(
              z.object({
                name: z.string(),
                module: z.string(),
                mode: z.enum(['read', 'write']),
                requiresApproval: z.boolean(),
                maxCallsPerSession: z.number().int().optional(),
              }),
            ),
            limits: z.object({
              maxActionsPerSession: z.number().int(),
              maxOutputTokensPerCall: z.number().int(),
              maxSpendPerSession: z.string().nullable(),
              allowedModules: z.array(z.string()),
              allowedTasks: z.array(z.string()),
            }),
          }),
        )
        .query(() => serialiseGuardrail(navigatorAgentGuardrail())),

      /**
       * Stage-2 tool_select: intersect candidates with declared read tools.
       * Dark plane / empty candidates refuse; money-write candidates refused.
       * Caller supplies the session guardrail tool grants — no invent tools.
       */
      selectTools: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            candidates: z.array(z.string().min(1).max(120)).max(100),
            tools: z
              .array(
                z.object({
                  name: z.string().min(1).max(120),
                  module: z.string().min(1).max(64),
                  mode: z.enum(['read', 'write']),
                  requiresApproval: z.boolean().optional(),
                }),
              )
              .max(100),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              selected: z.array(z.string()),
              refused: z.array(
                z.object({
                  tool: z.string(),
                  reason: z.enum(['not_declared', 'money_write', 'write_mode']),
                }),
              ),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['trade_plane_dark', 'no_candidates']),
              userMessageKey: z.literal('agents.navigator.unavailable').optional(),
            }),
          ]),
        )
        .query(({ input }) => {
          const modules = [...new Set(input.tools.map((t) => t.module))];
          const guardrail = parseGuardrail({
            agentId: 'navigator',
            version: 1,
            tools: input.tools.map((t) => ({
              name: t.name,
              module: t.module,
              mode: t.mode,
              requiresApproval: t.requiresApproval ?? false,
            })),
            limits: {
              maxActionsPerSession: 100,
              maxOutputTokensPerCall: 4096,
              maxSpendPerSession: null,
              allowedModules: modules,
              allowedTasks: ['navigator.plan', 'navigator.tool_select'],
            },
          });
          const result = selectNavigatorTools({
            plane: input.plane,
            guardrail,
            candidates: input.candidates,
          });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              selected: [...result.selected],
              refused: result.refused.map((r) => ({ tool: r.tool, reason: r.reason })),
            };
          }
          return result;
        }),

      /**
       * Stage-2 tier gate. Product-law matrix blank/unpublished → refuse-closed.
       * Does not invent free/staked/premium grants.
       */
      tierGate: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              userTier: z.string(),
              allowedTools: z.array(z.string()),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['tier_law_blank', 'tier_not_granted']),
              userMessageKey: z.literal('agents.navigator.tier_closed'),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = navigatorTierGate({ law: input.law ?? null, userTier: input.userTier });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              userTier: result.userTier,
              allowedTools: [...result.allowedTools],
            };
          }
          return result;
        }),

      /**
       * Stage-2 real data tool invoke + user-affecting audit row.
       * Fixtures only — no invent quotes. Tier law blank → refuse-closed.
       */
      invokeDataTool: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            tool: z.string().min(1).max(120),
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64).optional(),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
            now: z.string().datetime().optional(),
            quote: z
              .object({
                marketId: z.string().min(1).max(64),
                last: z.string().nullable(),
                asOf: z.string().min(1),
                maxAgeMs: z.number().int().positive().max(86_400_000),
              })
              .nullable()
              .optional(),
            markets: z
              .array(
                z.object({
                  marketId: z.string().min(1).max(64),
                  symbol: z.string().min(1).max(64),
                  status: z.enum(['open', 'halted', 'closed']),
                }),
              )
              .max(500)
              .nullable()
              .optional(),
            session: z
              .object({
                sessionId: z.string().min(1).max(120),
                userId: z.string().min(1).max(120),
                status: z.enum(['open', 'closed']),
              })
              .nullable()
              .optional(),
            occurredAt: z.string().datetime().optional(),
          }),
        )
        .output(
          z.object({
            result: z.union([
              z.object({
                status: z.literal('ok'),
                tool: z.literal('trade.quote'),
                marketId: z.string(),
                last: z.string(),
                asOf: z.string(),
              }),
              z.object({
                status: z.literal('ok'),
                tool: z.literal('trade.markets.list'),
                markets: z.array(
                  z.object({
                    marketId: z.string(),
                    symbol: z.string(),
                    status: z.enum(['open', 'halted', 'closed']),
                  }),
                ),
              }),
              z.object({
                status: z.literal('ok'),
                tool: z.literal('identity.session.read'),
                session: z.object({
                  sessionId: z.string(),
                  userId: z.string(),
                  status: z.enum(['open', 'closed']),
                }),
              }),
              z.object({
                status: z.literal('refuse'),
                tool: z.string(),
                reason: z.enum([
                  'trade_plane_dark',
                  'tier_law_blank',
                  'tier_not_granted',
                  'tool_not_declared',
                  'money_write',
                  'tool_not_in_tier',
                  'missing_fixture',
                  'incomplete_quote',
                  'invalid_decimal',
                  'stale',
                  'empty_markets',
                  'incomplete_session',
                  'subject_mismatch',
                ]),
                userMessageKey: z.enum(['agents.navigator.unavailable', 'agents.navigator.tier_closed']),
              }),
            ]),
            audit: z.object({
              sequence: z.number().int(),
              kind: z.literal('tool_call'),
              status: z.enum(['executed', 'refused']),
              tool: z.string(),
              reason: z.string().nullable(),
              userMessageKey: z.string(),
              occurredAt: z.string(),
            }),
          }),
        )
        .query(({ ctx, input }) => {
          const result = invokeNavigatorDataTool({
            tool: input.tool,
            plane: input.plane,
            tierLaw: input.law ?? null,
            userTier: input.userTier ?? '',
            requesterUserId: ctx.principal.userId,
            ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            quote: input.quote ?? null,
            markets: input.markets ?? null,
            session: input.session ?? null,
          });
          const occurredAt = input.occurredAt ?? new Date().toISOString();
          const log = auditNavigatorDataTool(emptyNavigatorAuditLog(), result, occurredAt);
          const audit = log.entries[0]!;
          if (result.status === 'ok' && result.tool === 'trade.markets.list') {
            return {
              result: {
                status: 'ok' as const,
                tool: 'trade.markets.list' as const,
                markets: result.markets.map((m) => ({
                  marketId: m.marketId,
                  symbol: m.symbol,
                  status: m.status,
                })),
              },
              audit: {
                sequence: audit.sequence,
                kind: 'tool_call' as const,
                status: audit.status,
                tool: audit.tool,
                reason: audit.reason,
                userMessageKey: audit.userMessageKey,
                occurredAt: audit.occurredAt,
              },
            };
          }
          return {
            result,
            audit: {
              sequence: audit.sequence,
              kind: 'tool_call' as const,
              status: audit.status,
              tool: audit.tool,
              reason: audit.reason,
              userMessageKey: audit.userMessageKey,
              occurredAt: audit.occurredAt,
            },
          };
        }),

      /**
       * Stage-2 `navigator.answer` as a METERED RUN on the fleet runtime.
       *
       * The navigator routes above are pure: they answer "what would the
       * navigator say" without a session, so the declared guardrail is enforced
       * by nothing at call time and the usage is metered by nothing at all.
       * This one drives the same pure tools through
       * `openSession → act → settle → closeSession`, so every lookup is
       * guardrail-checked and audited, and the run settles through `UsageMeter`
       * → ledger — the only accounting path.
       *
       * A mutation, not a query: it opens a session and writes audit rows.
       */
      runSession: scopedProcedure('agents:execute', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
            // Capped well under the guardrail's per-session action budget: one
            // ask is one audited tool call, refusals included.
            asks: z
              .array(
                z.object({
                  tool: z.string().min(1).max(120),
                  quote: z
                    .object({
                      marketId: z.string().min(1).max(64),
                      last: z.string().nullable(),
                      asOf: z.string().min(1),
                      maxAgeMs: z.number().int().positive().max(86_400_000),
                    })
                    .nullable()
                    .optional(),
                  markets: z
                    .array(
                      z.object({
                        marketId: z.string().min(1).max(64),
                        symbol: z.string().min(1).max(64),
                        status: z.enum(['open', 'halted', 'closed']),
                      }),
                    )
                    .max(500)
                    .nullable()
                    .optional(),
                  session: z
                    .object({
                      sessionId: z.string().min(1).max(120),
                      userId: z.string().min(1).max(120),
                      status: z.enum(['open', 'closed']),
                    })
                    .nullable()
                    .optional(),
                }),
              )
              .max(20),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              userTier: z.string(),
              findings: z.array(navigatorFindingOutput),
              unanswered: z.array(navigatorUnansweredOutput),
              asked: z.number().int(),
              answered: z.number().int(),
              complete: z.boolean(),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.navigator.empty'),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['trade_plane_dark', 'tier_law_blank', 'tier_not_granted', 'no_grounded_answer']),
              userMessageKey: z.enum(['agents.navigator.unavailable', 'agents.navigator.tier_closed']),
              unanswered: z.array(navigatorUnansweredOutput),
              metering: runMeteringOutput,
            }),
          ]),
        )
        .mutation(({ ctx, input }) =>
          guard(async () => {
            const result = await runNavigatorAnswerSession({
              runtime,
              userId: ctx.principal.userId,
              feeAssetId,
              plane: input.plane,
              tierLaw: input.law ?? null,
              userTier: input.userTier,
              asks: input.asks.map((ask) => ({
                tool: ask.tool,
                quote: ask.quote ?? null,
                markets: ask.markets ?? null,
                session: ask.session ?? null,
              })),
              ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            });

            const metering = {
              sessionId: result.metering.sessionId,
              billedAmount: result.metering.billedAmount,
              assetId: result.metering.assetId,
              sessionClosed: result.metering.sessionClosed,
              settlements: result.metering.settlements.map((s) => ({
                windowId: s.windowId,
                amount: s.amount,
                chargeKey: s.chargeKey,
                settled: s.settled,
              })),
            };

            if (result.status === 'empty') {
              return { status: 'empty' as const, userMessageKey: result.userMessageKey, metering };
            }

            const unanswered = result.unanswered.map((u) => ({
              tool: u.tool,
              refusedBy: u.refusedBy,
              reason: u.reason,
              userMessageKey: u.userMessageKey as string,
            }));

            if (result.status === 'refuse') {
              return {
                status: 'refuse' as const,
                reason: result.reason,
                userMessageKey: result.userMessageKey,
                unanswered,
                metering,
              };
            }

            return {
              status: 'ok' as const,
              userTier: result.userTier,
              findings: result.findings.map((f) =>
                f.tool === 'trade.markets.list'
                  ? { status: 'ok' as const, tool: 'trade.markets.list' as const, markets: f.markets.map((m) => ({ ...m })) }
                  : f,
              ),
              unanswered,
              asked: result.asked,
              answered: result.answered,
              complete: result.complete,
              metering,
            };
          }),
        ),
    }),

    /**
     * Support Stage-2 comment draft gate.
     *
     * Pure validation for ticket comments: missing ticket, empty/overlong body,
     * and money-invent language refuse. Does not post — caller still needs a
     * real ticket surface + guardrail. Spec: docs/ops/trk/ops.support.md.
     */
    support: router({
      draftComment: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            ticketId: z.string().max(120).nullable().optional(),
            body: z.string().max(5_000).nullable().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              ticketId: z.string(),
              body: z.string(),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['missing_ticket', 'empty_body', 'body_too_long', 'money_invent_language']),
              userMessageKey: z.literal('agents.support.comment_refused'),
            }),
          ]),
        )
        .query(({ input }) => draftTicketComment({ ticketId: input.ticketId, body: input.body })),

      /**
       * Stage-2 desk plane gate: dark or empty-KB refuses invent answers.
       * Spec: docs/ops/trk/ops.support.md / agents.support.
       */
      grounded: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            kbHitCount: z.number().int().min(0).max(10_000).optional(),
            requireKb: z.boolean().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              plane: z.literal('live'),
              allowedTasks: z.tuple([z.literal('support.classify'), z.literal('support.reply')]),
            }),
            z.object({
              status: z.literal('refuse'),
              plane: z.literal('dark'),
              reason: z.enum(['desk_plane_dark', 'kb_empty']),
              userMessageKey: z.literal('agents.support.unavailable'),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = supportGrounded({
            plane: input.plane,
            ...(input.kbHitCount === undefined ? {} : { kbHitCount: input.kbHitCount }),
            ...(input.requireKb === undefined ? {} : { requireKb: input.requireKb }),
          });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              plane: 'live' as const,
              allowedTasks: ['support.classify', 'support.reply'] as ['support.classify', 'support.reply'],
            };
          }
          return result;
        }),

      /**
       * Stage-1/2 declared toolset. Money tools never granted (undeclared refuse).
       * Spec: agents.support Stage 1.
       */
      stage1Guardrail: scopedProcedure('agents:read', { module: 'agents' })
        .output(
          z.object({
            agentId: z.string(),
            version: z.number().int(),
            tools: z.array(
              z.object({
                name: z.string(),
                module: z.string(),
                mode: z.enum(['read', 'write']),
                requiresApproval: z.boolean(),
                maxCallsPerSession: z.number().int().optional(),
              }),
            ),
            limits: z.object({
              maxActionsPerSession: z.number().int(),
              maxOutputTokensPerCall: z.number().int(),
              maxSpendPerSession: z.string().nullable(),
              allowedModules: z.array(z.string()),
              allowedTasks: z.array(z.string()),
            }),
          }),
        )
        .query(() => serialiseGuardrail(supportAgentGuardrail())),

      /**
       * Stage-2 tier gate. Product-law matrix blank/unpublished → refuse-closed.
       * Does not invent which plan may use the assist layer.
       */
      tierGate: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              userTier: z.string(),
              allowedTools: z.array(z.string()),
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['tier_law_blank', 'tier_not_granted']),
              userMessageKey: z.literal('agents.support.tier_closed'),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = supportTierGate({ law: input.law ?? null, userTier: input.userTier });
          if (result.status === 'ok') {
            return { status: 'ok' as const, userTier: result.userTier, allowedTools: [...result.allowedTools] };
          }
          return result;
        }),

      /**
       * Stage-2 desk data tool invoke + user-affecting audit row.
       *
       * Fixtures only — no invent KB answers, tickets or account state. The
       * requester is `ctx.principal.userId`, never an input field: a ticket or
       * account belonging to somebody else refuses rather than reads.
       */
      invokeDataTool: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            tool: z.string().min(1).max(120),
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64).optional(),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
            articles: z
              .array(
                z.object({
                  articleKey: z.string().min(1).max(160),
                  titleKey: z.string().min(1).max(160),
                  bodyKey: z.string().min(1).max(160),
                }),
              )
              .max(200)
              .nullable()
              .optional(),
            ticket: z
              .object({
                ticketId: z.string().min(1).max(120),
                ownerUserId: z.string().max(120),
                status: z.enum(['open', 'pending', 'resolved', 'closed']),
                category: z.string().max(64),
              })
              .nullable()
              .optional(),
            account: z
              .object({
                userId: z.string().max(120),
                status: z.enum(['active', 'frozen', 'closed']),
                kycTier: z.string().max(64),
              })
              .nullable()
              .optional(),
            occurredAt: z.string().datetime().optional(),
          }),
        )
        .output(
          z.object({
            result: z.union([
              z.object({
                status: z.literal('ok'),
                tool: z.literal('support.kb.search'),
                articles: z.array(
                  z.object({
                    articleKey: z.string(),
                    titleKey: z.string(),
                    bodyKey: z.string(),
                  }),
                ),
              }),
              z.object({
                status: z.literal('ok'),
                tool: z.literal('support.ticket.read'),
                ticket: z.object({
                  ticketId: z.string(),
                  ownerUserId: z.string(),
                  status: z.enum(['open', 'pending', 'resolved', 'closed']),
                  category: z.string(),
                }),
              }),
              z.object({
                status: z.literal('ok'),
                tool: z.literal('identity.account.read'),
                account: z.object({
                  userId: z.string(),
                  status: z.enum(['active', 'frozen', 'closed']),
                  kycTier: z.string(),
                }),
              }),
              z.object({
                status: z.literal('refuse'),
                tool: z.string(),
                reason: z.enum([
                  'desk_plane_dark',
                  'kb_empty',
                  'tier_law_blank',
                  'tier_not_granted',
                  'tool_not_declared',
                  'money_tool',
                  'tool_not_in_tier',
                  'missing_requester',
                  'missing_fixture',
                  'empty_results',
                  'incomplete_article',
                  'incomplete_ticket',
                  'incomplete_account',
                  'not_ticket_owner',
                  'account_owner_mismatch',
                ]),
                userMessageKey: z.enum(['agents.support.unavailable', 'agents.support.tier_closed']),
              }),
            ]),
            audit: z.object({
              sequence: z.number().int(),
              kind: z.literal('tool_call'),
              status: z.enum(['executed', 'refused']),
              tool: z.string(),
              reason: z.string().nullable(),
              userMessageKey: z.string(),
              occurredAt: z.string(),
            }),
          }),
        )
        .query(({ ctx, input }) => {
          const result = invokeSupportDataTool({
            tool: input.tool,
            plane: input.plane,
            requesterUserId: ctx.principal.userId,
            tierLaw: input.law ?? null,
            userTier: input.userTier ?? '',
            articles: input.articles ?? null,
            ticket: input.ticket ?? null,
            account: input.account ?? null,
          });
          const occurredAt = input.occurredAt ?? new Date().toISOString();
          const audit = auditSupportDataTool(emptySupportAuditLog(), result, occurredAt).entries[0]!;
          return {
            result:
              result.status === 'ok' && result.tool === 'support.kb.search'
                ? {
                    status: 'ok' as const,
                    tool: 'support.kb.search' as const,
                    articles: result.articles.map((a) => ({
                      articleKey: a.articleKey,
                      titleKey: a.titleKey,
                      bodyKey: a.bodyKey,
                    })),
                  }
                : result,
            audit: {
              sequence: audit.sequence,
              kind: 'tool_call' as const,
              status: audit.status,
              tool: audit.tool,
              reason: audit.reason,
              userMessageKey: audit.userMessageKey,
              occurredAt: audit.occurredAt,
            },
          };
        }),

      /**
       * Stage-2 typed "I don't know" — the escalate path.
       *
       * A KB read that refused or came back empty, or a request to move money,
       * escalates to a human ticket. There is no branch here that answers anyway.
       */
      answerOrEscalate: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            tool: z.string().min(1).max(120),
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64).optional(),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
            articles: z
              .array(
                z.object({
                  articleKey: z.string().min(1).max(160),
                  titleKey: z.string().min(1).max(160),
                  bodyKey: z.string().min(1).max(160),
                }),
              )
              .max(200)
              .nullable()
              .optional(),
            moneyRequest: z.boolean().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('answer'),
              citedArticleKeys: z.array(z.string()).min(1),
            }),
            z.object({
              status: z.literal('escalate'),
              reason: z.enum(['kb_no_hit', 'money_request', 'desk_refused']),
              userMessageKey: z.literal('agents.support.escalated'),
            }),
          ]),
        )
        .query(({ ctx, input }) => {
          const kbResult = invokeSupportDataTool({
            tool: input.tool,
            plane: input.plane,
            requesterUserId: ctx.principal.userId,
            tierLaw: input.law ?? null,
            userTier: input.userTier ?? '',
            articles: input.articles ?? null,
          });
          const decision = supportAnswerOrEscalate({
            kbResult,
            ...(input.moneyRequest === undefined ? {} : { moneyRequest: input.moneyRequest }),
          });
          if (decision.status === 'answer') {
            return { status: 'answer' as const, citedArticleKeys: [...decision.citedArticleKeys] };
          }
          return decision;
        }),

      /**
       * Stage-2 `support.reply` as a METERED RUN on the fleet runtime.
       *
       * The support routes above are pure: they answer "what would the desk say"
       * without a session, so the declared toolset is enforced by nothing at call
       * time and the usage is metered by nothing at all. This one drives the same
       * pure tools through `openSession → act → settle → closeSession`, so every
       * desk read is guardrail-checked and audited, and the run settles through
       * `UsageMeter` → ledger — the only accounting path.
       *
       * The requester is `ctx.principal.userId`, never an input field: a support
       * run that could read another user's ticket or account projection would be
       * a PII incident wearing a feature's clothes.
       *
       * A mutation, not a query: it opens a session and writes audit rows.
       */
      runSession: scopedProcedure('agents:execute', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            userTier: z.string().max(64),
            law: z
              .union([
                z.object({ published: z.literal(false) }),
                z.object({
                  published: z.literal(true),
                  matrix: z.record(z.array(z.string().min(1).max(120)).max(100)).default({}),
                }),
              ])
              .nullable()
              .optional(),
            /** The user is asking for money to move. Escalates to a person, free. */
            moneyRequest: z.boolean().optional(),
            // Capped well under the guardrail's per-session action budget: one
            // read is one audited tool call, refusals included.
            asks: z
              .array(
                z.object({
                  tool: z.string().min(1).max(120),
                  articles: z
                    .array(
                      z.object({
                        articleKey: z.string().min(1).max(160),
                        titleKey: z.string().min(1).max(160),
                        bodyKey: z.string().min(1).max(160),
                      }),
                    )
                    .max(200)
                    .nullable()
                    .optional(),
                  ticket: z
                    .object({
                      ticketId: z.string().min(1).max(120),
                      ownerUserId: z.string().max(120),
                      status: z.enum(['open', 'pending', 'resolved', 'closed']),
                      category: z.string().max(64),
                    })
                    .nullable()
                    .optional(),
                  account: z
                    .object({
                      userId: z.string().max(120),
                      status: z.enum(['active', 'frozen', 'closed']),
                      kycTier: z.string().max(64),
                    })
                    .nullable()
                    .optional(),
                }),
              )
              .max(20),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              userTier: z.string(),
              findings: z.array(supportFindingOutput),
              unanswered: z.array(supportUnansweredOutput),
              citedArticleKeys: z.array(z.string()).min(1),
              asked: z.number().int(),
              answered: z.number().int(),
              complete: z.boolean(),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('escalate'),
              reason: z.enum(['kb_no_hit', 'money_request', 'desk_refused']),
              userMessageKey: z.literal('agents.support.escalated'),
              findings: z.array(supportFindingOutput),
              unanswered: z.array(supportUnansweredOutput),
              caseFile: z.object({
                reason: z.enum(['kb_no_hit', 'money_request', 'desk_refused']),
                moneyRequest: z.boolean(),
                findings: z.array(supportFindingOutput),
                unanswered: z.array(supportUnansweredOutput),
                ticketIds: z.array(z.string()),
                citedArticleKeys: z.array(z.string()),
                accounts: z.array(
                  z.object({
                    userId: z.string(),
                    status: z.enum(['active', 'frozen', 'closed']),
                    kycTier: z.string(),
                  }),
                ),
              }),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.support.empty'),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['desk_plane_dark', 'tier_law_blank', 'tier_not_granted', 'no_grounded_read']),
              userMessageKey: z.enum(['agents.support.unavailable', 'agents.support.tier_closed']),
              unanswered: z.array(supportUnansweredOutput),
              metering: runMeteringOutput,
            }),
          ]),
        )
        .mutation(({ ctx, input }) =>
          guard(async () => {
            const result = await runSupportReplySession({
              runtime,
              userId: ctx.principal.userId,
              feeAssetId,
              plane: input.plane,
              tierLaw: input.law ?? null,
              userTier: input.userTier,
              ...(input.moneyRequest === undefined ? {} : { moneyRequest: input.moneyRequest }),
              asks: input.asks.map((ask) => ({
                tool: ask.tool,
                articles: ask.articles ?? null,
                ticket: ask.ticket ?? null,
                account: ask.account ?? null,
              })),
            });

            const metering = {
              sessionId: result.metering.sessionId,
              billedAmount: result.metering.billedAmount,
              assetId: result.metering.assetId,
              sessionClosed: result.metering.sessionClosed,
              settlements: result.metering.settlements.map((s) => ({
                windowId: s.windowId,
                amount: s.amount,
                chargeKey: s.chargeKey,
                settled: s.settled,
              })),
            };

            if (result.status === 'empty') {
              return { status: 'empty' as const, userMessageKey: result.userMessageKey, metering };
            }

            const unanswered = result.unanswered.map((u) => ({
              tool: u.tool,
              refusedBy: u.refusedBy,
              reason: u.reason,
              userMessageKey: u.userMessageKey as string,
            }));

            if (result.status === 'refuse') {
              return {
                status: 'refuse' as const,
                reason: result.reason,
                userMessageKey: result.userMessageKey,
                unanswered,
                metering,
              };
            }

            const findings = result.findings.map((f) =>
              f.tool === 'support.kb.search'
                ? { status: 'ok' as const, tool: 'support.kb.search' as const, articles: f.articles.map((a) => ({ ...a })) }
                : f,
            );

            if (result.status === 'escalate') {
              const cf = result.caseFile;
              return {
                status: 'escalate' as const,
                reason: result.reason,
                userMessageKey: result.userMessageKey,
                findings,
                unanswered,
                caseFile: {
                  reason: cf.reason,
                  moneyRequest: cf.moneyRequest,
                  findings,
                  unanswered,
                  ticketIds: [...cf.ticketIds],
                  citedArticleKeys: [...cf.citedArticleKeys],
                  accounts: cf.accounts.map((a) => ({ ...a })),
                },
                metering,
              };
            }

            return {
              status: 'ok' as const,
              userTier: result.userTier,
              findings,
              unanswered,
              citedArticleKeys: [...result.citedArticleKeys],
              asked: result.asked,
              answered: result.answered,
              complete: result.complete,
              metering,
            };
          }),
        ),
    }),

    /**
     * Copy-Intel Stage-1 — audited leader stats from caller fixtures only.
     * trade.copy is on tip; live leader plane is residual — dark refuses invent.
     * Spec: docs/ops/trk/agents.copy-intel.md Stage 1.
     */
    copyIntel: router({
      buildStats: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            fixtures: z
              .array(
                z.object({
                  leaderId: z.string().min(1).max(64),
                  realisedPnl: z.string().nullable(),
                  closedTrades: z.number().int().nullable(),
                  winningTrades: z.number().int().nullable(),
                  windowStart: z.string().min(1),
                  windowEnd: z.string().min(1),
                  source: z.string().min(1).max(64),
                }),
              )
              .max(500),
            copyPlane: z.enum(['live', 'dark']).optional(),
            leaderAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              stats: z.array(
                z.object({
                  leaderId: z.string(),
                  realisedPnl: z.string(),
                  closedTrades: z.number().int(),
                  winRate: z.string(),
                  windowStart: z.string(),
                  windowEnd: z.string(),
                }),
              ),
              audit: z.array(
                z.object({
                  id: z.string(),
                  writtenAt: z.string(),
                  source: z.string(),
                  leaderId: z.string(),
                  stat: z.object({
                    leaderId: z.string(),
                    realisedPnl: z.string(),
                    closedTrades: z.number().int(),
                    winRate: z.string(),
                    windowStart: z.string(),
                    windowEnd: z.string(),
                  }),
                  provenance: z.object({
                    fixture: z.literal(true),
                    source: z.string(),
                    windowStart: z.string(),
                    windowEnd: z.string(),
                  }),
                }),
              ),
              skippedIncomplete: z.number().int(),
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.copy_intel.empty'),
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.copy_intel.unavailable'),
              reason: z.enum(['no_data', 'invalid_window', 'copy_plane_dark']),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = buildLeaderStats(input.fixtures, {
            ...(input.copyPlane === undefined ? {} : { copyPlane: input.copyPlane }),
            ...(input.leaderAllowlist === undefined ? {} : { leaderAllowlist: input.leaderAllowlist }),
            ...(input.now === undefined ? {} : { now: new Date(input.now) }),
          });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              skippedIncomplete: result.skippedIncomplete,
              stats: result.stats.map((s) => ({ ...s })),
              audit: result.audit.map((a) => ({
                id: a.id,
                writtenAt: a.writtenAt,
                source: a.source,
                leaderId: a.leaderId,
                stat: { ...a.stat },
                provenance: { ...a.provenance },
              })),
            };
          }
          return result;
        }),

      /**
       * Stage-2 `copy_intel.stats` as a METERED RUN on the fleet runtime.
       *
       * Pure `buildStats` answers without a session. This mutation runs the
       * same builder through `openSession → act → settle → closeSession` so
       * every leader read is guardrail-checked and audited. Dark copy plane
       * refuses before any session opens (unbilled). Never invents fee share.
       */
      runSession: scopedProcedure('agents:execute', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            fixtures: z
              .array(
                z.object({
                  leaderId: z.string().min(1).max(64),
                  realisedPnl: z.string().nullable(),
                  closedTrades: z.number().int().nullable(),
                  winningTrades: z.number().int().nullable(),
                  windowStart: z.string().min(1),
                  windowEnd: z.string().min(1),
                  source: z.string().min(1).max(64),
                }),
              )
              .max(50),
            leaderAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              stats: z.array(
                z.object({
                  leaderId: z.string(),
                  realisedPnl: z.string(),
                  closedTrades: z.number().int(),
                  winRate: z.string(),
                  windowStart: z.string(),
                  windowEnd: z.string(),
                }),
              ),
              audit: z.array(
                z.object({
                  id: z.string(),
                  writtenAt: z.string(),
                  source: z.string(),
                  leaderId: z.string(),
                  stat: z.object({
                    leaderId: z.string(),
                    realisedPnl: z.string(),
                    closedTrades: z.number().int(),
                    winRate: z.string(),
                    windowStart: z.string(),
                    windowEnd: z.string(),
                  }),
                  provenance: z.object({
                    fixture: z.literal(true),
                    source: z.string(),
                    windowStart: z.string(),
                    windowEnd: z.string(),
                  }),
                }),
              ),
              skippedIncomplete: z.number().int(),
              fixturesAccepted: z.number().int(),
              fixturesRefusedByGuardrail: z.number().int(),
              writesRefusedByGuardrail: z.number().int(),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.copy_intel.empty'),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.copy_intel.unavailable'),
              reason: z.enum(['no_data', 'invalid_window', 'copy_plane_dark']),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['copy_plane_dark', 'no_live_leaders', 'writes_refused']),
              userMessageKey: z.literal('agents.copy_intel.unavailable'),
              fixturesRefusedByGuardrail: z.number().int(),
              writesRefusedByGuardrail: z.number().int(),
              metering: runMeteringOutput,
            }),
          ]),
        )
        .mutation(({ ctx, input }) =>
          guard(async () => {
            const result = await runCopyIntelStatsSession({
              runtime,
              userId: ctx.principal.userId,
              feeAssetId,
              plane: input.plane,
              fixtures: input.fixtures,
              ...(input.leaderAllowlist === undefined ? {} : { leaderAllowlist: input.leaderAllowlist }),
              ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            });

            const metering = {
              sessionId: result.metering.sessionId,
              billedAmount: result.metering.billedAmount,
              assetId: result.metering.assetId,
              sessionClosed: result.metering.sessionClosed,
              settlements: result.metering.settlements.map((s) => ({
                windowId: s.windowId,
                amount: s.amount,
                chargeKey: s.chargeKey,
                settled: s.settled,
              })),
            };

            if (result.status === 'ok') {
              return {
                status: 'ok' as const,
                skippedIncomplete: result.skippedIncomplete,
                fixturesAccepted: result.fixturesAccepted,
                fixturesRefusedByGuardrail: result.fixturesRefusedByGuardrail,
                writesRefusedByGuardrail: result.writesRefusedByGuardrail,
                stats: result.stats.map((s) => ({ ...s })),
                audit: result.audit.map((a) => ({
                  id: a.id,
                  writtenAt: a.writtenAt,
                  source: a.source,
                  leaderId: a.leaderId,
                  stat: { ...a.stat },
                  provenance: { ...a.provenance },
                })),
                metering,
              };
            }

            if (result.status === 'empty') {
              return { status: 'empty' as const, userMessageKey: result.userMessageKey, metering };
            }

            if (result.status === 'unavailable') {
              return {
                status: 'unavailable' as const,
                userMessageKey: result.userMessageKey,
                reason: result.reason,
                metering,
              };
            }

            return {
              status: 'refuse' as const,
              reason: result.reason,
              userMessageKey: result.userMessageKey,
              fixturesRefusedByGuardrail: result.fixturesRefusedByGuardrail,
              writesRefusedByGuardrail: result.writesRefusedByGuardrail,
              metering,
            };
          }),
        ),
    }),

    /**
     * Merchant Stage-1 — approval-rate watch from caller fixtures only.
     * pay.routing / live metrics residual — dark pay plane refuses invent.
     * Money tools denied (guardrail). Spec: docs/ops/trk/agents.merchant.md Stage 1.
     */
    merchant: router({
      watch: scopedProcedure('agents:read', { module: 'agents' })
        .input(
          z.object({
            points: z
              .array(
                z.object({
                  railId: z.string().min(1).max(64),
                  approvalRate: z.string().nullable(),
                  attempts: z.number().int().nullable(),
                  asOf: z.string().min(1),
                  maxAgeMs: z.number().int().positive(),
                }),
              )
              .max(500),
            threshold: z.string().optional(),
            payPlane: z.enum(['live', 'dark']).optional(),
            railAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            /** Sample floor — default 1 (zero attempts never alerts). */
            minAttempts: z.number().int().min(1).max(1_000_000).optional(),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              watchedAt: z.string(),
              considered: z.number().int(),
              skippedStale: z.number().int(),
              skippedIncomplete: z.number().int(),
              skippedLowSample: z.number().int(),
              alerts: z.array(
                z.object({
                  railId: z.string(),
                  approvalRate: z.string(),
                  attempts: z.number().int(),
                  threshold: z.string(),
                  kind: z.literal('below_threshold'),
                }),
              ),
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.merchant.empty'),
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.merchant.unavailable'),
              reason: z.enum(['stale', 'no_metrics', 'pay_plane_dark']),
            }),
          ]),
        )
        .query(({ input }) => {
          const result = watchApprovalFixtures(input.points, {
            ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
            ...(input.payPlane === undefined ? {} : { payPlane: input.payPlane }),
            ...(input.railAllowlist === undefined ? {} : { railAllowlist: input.railAllowlist }),
            ...(input.minAttempts === undefined ? {} : { minAttempts: input.minAttempts }),
            ...(input.now === undefined ? {} : { now: new Date(input.now) }),
          });
          if (result.status === 'ok') {
            return {
              status: 'ok' as const,
              watchedAt: result.watchedAt,
              considered: result.considered,
              skippedStale: result.skippedStale,
              skippedIncomplete: result.skippedIncomplete,
              skippedLowSample: result.skippedLowSample,
              alerts: result.alerts.map((a) => ({ ...a })),
            };
          }
          return result;
        }),

      /**
       * Stage-2 `merchant.watch` as a METERED RUN on the fleet runtime.
       *
       * The pure `watch` query above answers "what would the merchant say"
       * without a session. This mutation runs the same watcher through
       * `openSession → act → settle → closeSession`, so every metrics read is
       * guardrail-checked and audited, and the run settles through the meter.
       * Dark pay plane refuses before any session opens (unbilled).
       */
      runSession: scopedProcedure('agents:execute', { module: 'agents' })
        .input(
          z.object({
            plane: z.enum(['live', 'dark']),
            points: z
              .array(
                z.object({
                  railId: z.string().min(1).max(64),
                  approvalRate: z.string().nullable(),
                  attempts: z.number().int().nullable(),
                  asOf: z.string().min(1),
                  maxAgeMs: z.number().int().positive().max(86_400_000),
                }),
              )
              .max(50),
            threshold: z.string().optional(),
            railAllowlist: z.array(z.string().min(1).max(64)).max(500).optional(),
            minAttempts: z.number().int().min(1).max(1_000_000).optional(),
            now: z.string().datetime().optional(),
          }),
        )
        .output(
          z.discriminatedUnion('status', [
            z.object({
              status: z.literal('ok'),
              watchedAt: z.string(),
              considered: z.number().int(),
              skippedStale: z.number().int(),
              skippedIncomplete: z.number().int(),
              skippedLowSample: z.number().int(),
              alerts: z.array(
                z.object({
                  railId: z.string(),
                  approvalRate: z.string(),
                  attempts: z.number().int(),
                  threshold: z.string(),
                  kind: z.literal('below_threshold'),
                }),
              ),
              pointsAccepted: z.number().int(),
              pointsRefusedByGuardrail: z.number().int(),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('empty'),
              userMessageKey: z.literal('agents.merchant.empty'),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('unavailable'),
              userMessageKey: z.literal('agents.merchant.unavailable'),
              reason: z.enum(['stale', 'no_metrics', 'pay_plane_dark']),
              metering: runMeteringOutput,
            }),
            z.object({
              status: z.literal('refuse'),
              reason: z.enum(['pay_plane_dark', 'no_live_metrics']),
              userMessageKey: z.literal('agents.merchant.unavailable'),
              pointsRefusedByGuardrail: z.number().int(),
              metering: runMeteringOutput,
            }),
          ]),
        )
        .mutation(({ ctx, input }) =>
          guard(async () => {
            const result = await runMerchantWatchSession({
              runtime,
              userId: ctx.principal.userId,
              feeAssetId,
              plane: input.plane,
              points: input.points,
              ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
              ...(input.railAllowlist === undefined ? {} : { railAllowlist: input.railAllowlist }),
              ...(input.minAttempts === undefined ? {} : { minAttempts: input.minAttempts }),
              ...(input.now === undefined ? {} : { now: new Date(input.now) }),
            });

            const metering = {
              sessionId: result.metering.sessionId,
              billedAmount: result.metering.billedAmount,
              assetId: result.metering.assetId,
              sessionClosed: result.metering.sessionClosed,
              settlements: result.metering.settlements.map((s) => ({
                windowId: s.windowId,
                amount: s.amount,
                chargeKey: s.chargeKey,
                settled: s.settled,
              })),
            };

            if (result.status === 'ok') {
              return {
                status: 'ok' as const,
                watchedAt: result.watchedAt,
                considered: result.considered,
                skippedStale: result.skippedStale,
                skippedIncomplete: result.skippedIncomplete,
                skippedLowSample: result.skippedLowSample,
                alerts: result.alerts.map((a) => ({ ...a })),
                pointsAccepted: result.pointsAccepted,
                pointsRefusedByGuardrail: result.pointsRefusedByGuardrail,
                metering,
              };
            }

            if (result.status === 'empty') {
              return { status: 'empty' as const, userMessageKey: result.userMessageKey, metering };
            }

            if (result.status === 'unavailable') {
              return {
                status: 'unavailable' as const,
                userMessageKey: result.userMessageKey,
                reason: result.reason,
                metering,
              };
            }

            return {
              status: 'refuse' as const,
              reason: result.reason,
              userMessageKey: result.userMessageKey,
              pointsRefusedByGuardrail: result.pointsRefusedByGuardrail,
              metering,
            };
          }),
        ),
    }),
  });
}

export type AgentsRouter = ReturnType<typeof createAgentsRouter>;
