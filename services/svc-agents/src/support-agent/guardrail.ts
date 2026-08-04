/**
 * Support agent Stage-1 — declared toolset + money-tool refuse policy.
 *
 * Spec: docs/ops/trk/agents.support.md Stage 1.
 *
 * The support agent may classify/reply and (later) read KB / tickets. It must
 * never hold money tools (ledger, pay, bank, trade write). That is enforced by
 * the declared tool list: undeclared tools are refused by `evaluateToolCall`
 * before dispatch — not by hoping the model "knows better".
 */

import { parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

/** Money-path tools that must NEVER appear on the support agent grant list. */
export const SUPPORT_MONEY_TOOLS = [
  'ledger.post',
  'ledger.hold',
  'pay.refund',
  'pay.capture',
  'bank.transfer',
  'bank.loan',
  'trade.order',
  'trade.cancel',
  'p2p.release',
] as const;

/**
 * Stage-1 support agent guardrail.
 *
 * Tools: read-only desk helpers only. Completions: support.classify + support.reply.
 * Module: support only. No spend cap needed for mock Stage-1 (null = uncapped
 * internal) — production user-facing should set a cap; residual.
 */
export function supportAgentGuardrail(overrides: { version?: number } = {}): Guardrail {
  return parseGuardrail({
    agentId: 'support',
    version: overrides.version ?? 1,
    tools: [
      { name: 'support.ticket.read', module: 'support', mode: 'read' },
      { name: 'support.kb.search', module: 'support', mode: 'read' },
      // Stage-2 may add support.ticket.comment as write with approval.
    ],
    limits: {
      maxActionsPerSession: 40,
      maxOutputTokensPerCall: 2048,
      maxSpendPerSession: '0.5',
      allowedModules: ['support'],
      allowedTasks: ['support.classify', 'support.reply'],
    },
  });
}

/** True if a tool name is on the hard money denylist (for tests + docs). */
export function isSupportMoneyTool(tool: string): boolean {
  return (SUPPORT_MONEY_TOOLS as readonly string[]).includes(tool);
}
