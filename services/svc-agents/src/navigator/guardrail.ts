/**
 * Navigator agent Stage-1 — task + guardrails (read-first toolset).
 *
 * Spec: docs/ops/trk/agents.navigator.md Stage 1.
 *
 * Navigator plans and selects tools inside a declared allowlist. Stage-1 grants
 * only **read** tools plus engine tasks `navigator.plan` / `navigator.tool_select`.
 * Money-mutating tools are not on the list → refuse as undeclared before dispatch.
 * Stage-2 adds grounded data tools; Stage-3 shell surface.
 */

import { parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

/** Must never be granted on Stage-1 navigator (tests assert undeclared refuse). */
export const NAVIGATOR_MONEY_WRITE_TOOLS = [
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
 * Stage-1 navigator guardrail: plan/tool_select + read-only market/identity tools.
 */
export function navigatorAgentGuardrail(overrides: { version?: number } = {}): Guardrail {
  return parseGuardrail({
    agentId: 'navigator',
    version: overrides.version ?? 1,
    tools: [
      { name: 'trade.quote', module: 'trade', mode: 'read' },
      { name: 'trade.markets.list', module: 'trade', mode: 'read' },
      { name: 'identity.session.read', module: 'identity', mode: 'read' },
    ],
    limits: {
      maxActionsPerSession: 60,
      maxOutputTokensPerCall: 4096,
      maxSpendPerSession: '1',
      allowedModules: ['trade', 'identity', 'agents'],
      allowedTasks: ['navigator.plan', 'navigator.tool_select'],
    },
  });
}

export function isNavigatorMoneyWriteTool(tool: string): boolean {
  return (NAVIGATOR_MONEY_WRITE_TOOLS as readonly string[]).includes(tool);
}
