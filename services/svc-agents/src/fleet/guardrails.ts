import { z } from 'zod';
import { isModuleId, type ModuleId } from '@intafaced/config';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import type { CopyKey } from '../copy.js';

/**
 * GUARDRAILS — the Agentic Law's other half (§8.2).
 *
 * "each agent = defined toolset + guardrail schema + audit log."
 *
 * The audit log answers *what did it do*. The guardrail answers *what was it
 * ever allowed to do* — and it has to answer that BEFORE the tool runs, not
 * after. An after-the-fact check on a `write` tool is not a guardrail; it is a
 * post-mortem. Every rule below is evaluated against a proposed action while
 * the action is still a proposal.
 *
 * A guardrail is DECLARED, not inferred. An agent lists the tools it may call,
 * the modules it may touch, and the ceilings it runs under. A tool that is not
 * on the list is refused for the simplest possible reason — nobody said it
 * could — and that refusal is written to `agent_actions` exactly like a success
 * would be. §8.2 requires every action to reach the audit table, and the
 * actions worth auditing most are the ones that did not happen.
 *
 * The guardrail is snapshotted onto the session at open (see `runtime.ts`), the
 * same way `stakes.multiplier_bps` is snapshotted in svc-token: widening an
 * agent's powers must not retroactively legitimise a call an in-flight session
 * already made under narrower terms.
 */

export const TOOL_MODES = ['read', 'write'] as const;
export type ToolMode = (typeof TOOL_MODES)[number];

const moduleIdSchema = z.custom<ModuleId>((value) => typeof value === 'string' && isModuleId(value), {
  message: 'must be a module id declared in packages/config/src/modules.ts',
});

const amountString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'must be an unsigned decimal string with at most 18 decimal places');

export const toolGrantSchema = z.object({
  /** Tool id as the runtime dispatches it, e.g. 'trade.quote'. */
  name: z.string().min(1).max(120),
  /** Which module the tool acts in. Checked against `limits.allowedModules`. */
  module: moduleIdSchema,
  /**
   * `write` tools change platform state on the user's behalf. They are called
   * out separately so an operator can read a guardrail and see, at a glance,
   * the blast radius of the agent rather than having to know what each tool does.
   */
  mode: z.enum(TOOL_MODES),
  /** Per-session ceiling. Absent = unlimited within the session action limit. */
  maxCallsPerSession: z.number().int().min(0).optional(),
  /** §8.2 "exec inside user guardrails" — the user confirms before this runs. */
  requiresApproval: z.boolean().default(false),
});

export const guardrailLimitsSchema = z.object({
  /** Total actions — completions and tool calls — one session may perform. */
  maxActionsPerSession: z.number().int().min(1).max(10_000),
  /** Ceiling applied on top of whatever the route allows. The tighter wins. */
  maxOutputTokensPerCall: z.number().int().min(1).max(1_000_000),
  /**
   * Metered spend ceiling for the session, in the fee asset. Null = uncapped,
   * which is legitimate for an internal operator agent and never for a user's.
   */
  maxSpendPerSession: amountString.nullable().default(null),
  /** Modules the agent may act in at all. Empty = none. */
  allowedModules: z.array(moduleIdSchema).default([]),
  /** Routing tasks the agent may invoke. Empty = it may not call the engine. */
  allowedTasks: z.array(z.string().min(1)).default([]),
});

export const guardrailSchema = z.object({
  agentId: z.string().min(1).max(64),
  /** Bumped on every change. The session records which version bound it. */
  version: z.number().int().min(1),
  tools: z.array(toolGrantSchema).default([]),
  limits: guardrailLimitsSchema,
});

export type GuardrailConfig = z.infer<typeof guardrailSchema>;

export interface ToolGrant {
  readonly name: string;
  readonly module: ModuleId;
  readonly mode: ToolMode;
  readonly maxCallsPerSession?: number;
  readonly requiresApproval: boolean;
}

export interface GuardrailLimits {
  readonly maxActionsPerSession: number;
  readonly maxOutputTokensPerCall: number;
  /** Parsed to `Amount`; null means uncapped. */
  readonly maxSpendPerSession: Amount | null;
  readonly allowedModules: readonly ModuleId[];
  readonly allowedTasks: readonly string[];
}

export interface Guardrail {
  readonly agentId: string;
  readonly version: number;
  readonly tools: readonly ToolGrant[];
  readonly limits: GuardrailLimits;
}

/**
 * Tools that must never appear on a **product** agent guardrail.
 *
 * Test probes (`probe` / `thrifty`) may still grant `trade.order` to exercise
 * approval and budget rules. Product agent ids (navigator, support, scanner,
 * merchant, copy-intel) hard-fail at parse if a money-moving tool is granted —
 * undeclared refuse alone is not enough if registration accepts a grant.
 *
 * Pure stats/write-audit tools (e.g. copy-intel `trade.copy.stats.write`) are
 * not on this list — they do not move value.
 */
export const FLEET_HARD_MONEY_WRITE_TOOLS = [
  'ledger.post',
  'ledger.hold',
  'pay.refund',
  'pay.capture',
  'pay.route.change',
  'bank.transfer',
  'bank.loan',
  'trade.order',
  'trade.cancel',
  'trade.copy.follow',
  'trade.copy.unfollow',
  'p2p.release',
] as const;

/** Product agent ids that must never grant money-write tools. */
export const PRODUCT_AGENT_IDS = ['navigator', 'support', 'scanner', 'merchant', 'copy-intel'] as const;

export function isFleetHardMoneyWriteTool(tool: string): boolean {
  return (FLEET_HARD_MONEY_WRITE_TOOLS as readonly string[]).includes(tool);
}

export function isProductAgentId(agentId: string): boolean {
  return (PRODUCT_AGENT_IDS as readonly string[]).includes(agentId);
}

export function parseGuardrail(input: unknown): Guardrail {
  const config = guardrailSchema.parse(input);

  const seen = new Set<string>();
  for (const tool of config.tools) {
    if (seen.has(tool.name)) throw new Error(`Duplicate tool grant "${tool.name}" — a tool is declared once`);
    seen.add(tool.name);

    // A tool granted in a module the agent may not act in is a contradiction,
    // and contradictions in a security policy resolve however the code happens
    // to be ordered. Reject it at parse time instead.
    if (!config.limits.allowedModules.includes(tool.module)) {
      throw new Error(
        `Tool "${tool.name}" acts in module "${tool.module}", which is not in allowedModules — ` + `grant the module or drop the tool`,
      );
    }

    // Product agents: money-moving tools are never grantable. Test probes may
    // still declare them to exercise approval / budget enforcement.
    if (isProductAgentId(config.agentId) && isFleetHardMoneyWriteTool(tool.name)) {
      throw new Error(
        `Product agent "${config.agentId}" cannot grant money-moving tool "${tool.name}" — ` +
          `value moves only via packages/ledger-client recipes`,
      );
    }
  }

  return {
    agentId: config.agentId,
    version: config.version,
    tools: config.tools.map((t) => ({
      name: t.name,
      module: t.module,
      mode: t.mode,
      requiresApproval: t.requiresApproval,
      ...(t.maxCallsPerSession === undefined ? {} : { maxCallsPerSession: t.maxCallsPerSession }),
    })),
    limits: {
      maxActionsPerSession: config.limits.maxActionsPerSession,
      maxOutputTokensPerCall: config.limits.maxOutputTokensPerCall,
      maxSpendPerSession: config.limits.maxSpendPerSession === null ? null : parseAmount(config.limits.maxSpendPerSession),
      allowedModules: config.limits.allowedModules,
      allowedTasks: config.limits.allowedTasks,
    },
  };
}

/** Serialise back to the jsonb form stored on the session. */
export function serialiseGuardrail(guardrail: Guardrail): GuardrailConfig {
  return {
    agentId: guardrail.agentId,
    version: guardrail.version,
    tools: guardrail.tools.map((t) => ({
      name: t.name,
      module: t.module,
      mode: t.mode,
      requiresApproval: t.requiresApproval,
      ...(t.maxCallsPerSession === undefined ? {} : { maxCallsPerSession: t.maxCallsPerSession }),
    })),
    limits: {
      maxActionsPerSession: guardrail.limits.maxActionsPerSession,
      maxOutputTokensPerCall: guardrail.limits.maxOutputTokensPerCall,
      maxSpendPerSession: guardrail.limits.maxSpendPerSession === null ? null : formatAmount(guardrail.limits.maxSpendPerSession),
      allowedModules: [...guardrail.limits.allowedModules],
      allowedTasks: [...guardrail.limits.allowedTasks],
    },
  };
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export const REFUSAL_CODES = [
  'agents.tool_not_declared',
  'agents.tool_call_limit',
  'agents.module_not_allowed',
  'agents.task_not_allowed',
  'agents.action_limit',
  'agents.spend_limit',
  'agents.output_limit',
  'agents.approval_required',
  'agents.session_closed',
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface Refusal {
  readonly allowed: false;
  readonly code: RefusalCode;
  readonly userMessageKey: CopyKey;
  readonly userMessageParams: Readonly<Record<string, string | number>>;
}

export type GuardrailDecision = { readonly allowed: true } | Refusal;

const ALLOWED: GuardrailDecision = { allowed: true };

function refuse(code: RefusalCode, userMessageKey: CopyKey, userMessageParams: Readonly<Record<string, string | number>> = {}): Refusal {
  return { allowed: false, code, userMessageKey, userMessageParams };
}

/**
 * What the session has consumed so far.
 *
 * Passed in rather than read here so this module stays pure: every rule is a
 * function of (guardrail, state, request), which is what makes the whole policy
 * testable without a database and identical in every caller.
 */
export interface SessionState {
  readonly status: 'open' | 'closed';
  /** Actions already recorded, refusals included — a refused attempt is an action. */
  readonly actionCount: number;
  /** Executed calls per tool. Refusals do not count against a tool's own budget. */
  readonly toolCalls: Readonly<Record<string, number>>;
  /** Metered spend accrued so far this session, in the fee asset. */
  readonly spend: Amount;
  /** Which tools the user has explicitly approved for this session. */
  readonly approvedTools: readonly string[];
}

export const EMPTY_SESSION_STATE: SessionState = {
  status: 'open',
  actionCount: 0,
  toolCalls: {},
  spend: 0n,
  approvedTools: [],
};

export interface ToolCallRequest {
  readonly tool: string;
  /** Set when the caller is presenting a user's explicit confirmation. */
  readonly approved?: boolean;
}

export interface CompletionAttempt {
  readonly task: string;
  readonly maxOutputTokens: number;
  /** Cost this call could reach at its ceiling. Checked against the spend cap. */
  readonly worstCaseCost: Amount;
}

export function findTool(guardrail: Guardrail, name: string): ToolGrant | undefined {
  return guardrail.tools.find((t) => t.name === name);
}

/**
 * May this session act at all?
 *
 * Checked first everywhere, because a closed or exhausted session must refuse
 * uniformly — a rule that only some entry points enforce is not a rule.
 */
function evaluateSession(guardrail: Guardrail, state: SessionState): GuardrailDecision {
  if (state.status === 'closed') {
    return refuse('agents.session_closed', 'agents.refused.session_closed');
  }
  if (state.actionCount >= guardrail.limits.maxActionsPerSession) {
    return refuse('agents.action_limit', 'agents.refused.step_limit', { limit: guardrail.limits.maxActionsPerSession });
  }
  return ALLOWED;
}

/** Guardrail decision for a proposed tool call. Evaluated before dispatch. */
export function evaluateToolCall(guardrail: Guardrail, state: SessionState, request: ToolCallRequest): GuardrailDecision {
  const session = evaluateSession(guardrail, state);
  if (!session.allowed) return session;

  const grant = findTool(guardrail, request.tool);
  if (!grant) {
    // The default is NO. An undeclared tool is refused rather than checked
    // against some looser rule, because "what can this agent do" must be
    // answerable by reading the guardrail alone.
    return refuse('agents.tool_not_declared', 'agents.refused.tool_not_declared', { tool: request.tool });
  }

  if (!guardrail.limits.allowedModules.includes(grant.module)) {
    // Unreachable via `parseGuardrail`, which rejects this combination — kept
    // because a guardrail can also arrive as a jsonb snapshot written by an
    // older build, and the enforcement point must not assume its input was
    // produced by the current parser.
    return refuse('agents.module_not_allowed', 'agents.refused.module_not_allowed', { module: grant.module });
  }

  if (grant.maxCallsPerSession !== undefined) {
    const used = state.toolCalls[request.tool] ?? 0;
    if (used >= grant.maxCallsPerSession) {
      return refuse('agents.tool_call_limit', 'agents.refused.tool_call_limit', {
        tool: request.tool,
        limit: grant.maxCallsPerSession,
      });
    }
  }

  if (grant.requiresApproval && !request.approved && !state.approvedTools.includes(request.tool)) {
    return refuse('agents.approval_required', 'agents.refused.approval_required', { tool: request.tool });
  }

  return ALLOWED;
}

/** Guardrail decision for a proposed engine call. Evaluated before routing dispatch. */
export function evaluateCompletion(
  guardrail: Guardrail,
  state: SessionState,
  attempt: CompletionAttempt,
  feeAssetId: string,
): GuardrailDecision {
  const session = evaluateSession(guardrail, state);
  if (!session.allowed) return session;

  if (!guardrail.limits.allowedTasks.includes(attempt.task)) {
    return refuse('agents.task_not_allowed', 'agents.refused.tool_not_declared', { tool: attempt.task });
  }

  if (attempt.maxOutputTokens > guardrail.limits.maxOutputTokensPerCall) {
    return refuse('agents.output_limit', 'agents.refused.output_limit', { limit: guardrail.limits.maxOutputTokensPerCall });
  }

  const cap = guardrail.limits.maxSpendPerSession;
  if (cap !== null) {
    // Checked against the call's WORST CASE, not its expected cost. A ceiling
    // that can be exceeded by one unlucky generation is not a ceiling, and the
    // cost is only knowable after the tokens have already been spent.
    if (state.spend + attempt.worstCaseCost > cap) {
      return refuse('agents.spend_limit', 'agents.refused.spend_limit', { limit: formatAmount(cap), asset: feeAssetId });
    }
  }

  return ALLOWED;
}

/** Convenience for the audit row: the tool/task a decision was about. */
export function refusalSummary(refusal: Refusal): string {
  return `${refusal.code}(${Object.entries(refusal.userMessageParams)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;
}
