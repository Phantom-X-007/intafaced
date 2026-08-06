/**
 * Merchant agent Stage-1 — declared toolset + money-tool refuse.
 *
 * Spec: docs/ops/trk/agents.merchant.md Stage 1.
 *
 * Watch task only. No rail change tools. No ledger posts.
 */

import { parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

export const MERCHANT_MONEY_WRITE_TOOLS = [
  'ledger.post',
  'ledger.hold',
  'pay.refund',
  'pay.capture',
  'pay.route.change',
  'bank.transfer',
  'trade.order',
  'p2p.release',
] as const;

export function merchantAgentGuardrail(overrides: { version?: number } = {}): Guardrail {
  return parseGuardrail({
    agentId: 'merchant',
    version: overrides.version ?? 1,
    tools: [
      { name: 'pay.metrics.read', module: 'pay', mode: 'read' },
      { name: 'pay.rails.list', module: 'pay', mode: 'read' },
    ],
    limits: {
      maxActionsPerSession: 40,
      maxOutputTokensPerCall: 1024,
      maxSpendPerSession: '0.25',
      allowedModules: ['pay', 'agents'],
      allowedTasks: ['merchant.watch'],
    },
  });
}

export function isMerchantMoneyWriteTool(tool: string): boolean {
  return (MERCHANT_MONEY_WRITE_TOOLS as readonly string[]).includes(tool);
}
