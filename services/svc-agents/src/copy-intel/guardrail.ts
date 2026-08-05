/**
 * Copy-Intel Stage-1 — read/write-stats tools only; no trade placement.
 *
 * Spec: docs/ops/trk/agents.copy-intel.md Stage 1.
 */

import { parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

export const COPY_INTEL_MONEY_WRITE_TOOLS = [
  'ledger.post',
  'trade.order',
  'trade.cancel',
  'trade.copy.follow',
  'trade.copy.unfollow',
  'pay.capture',
  'p2p.release',
] as const;

export function copyIntelAgentGuardrail(overrides: { version?: number } = {}): Guardrail {
  return parseGuardrail({
    agentId: 'copy-intel',
    version: overrides.version ?? 1,
    tools: [
      { name: 'trade.copy.leaders.read', module: 'trade', mode: 'read' },
      { name: 'trade.copy.stats.write', module: 'trade', mode: 'write' },
    ],
    limits: {
      maxActionsPerSession: 40,
      maxOutputTokensPerCall: 1024,
      maxSpendPerSession: '0.25',
      allowedModules: ['trade', 'agents'],
      allowedTasks: ['copy_intel.stats'],
    },
  });
}

export function isCopyIntelMoneyWriteTool(tool: string): boolean {
  return (COPY_INTEL_MONEY_WRITE_TOOLS as readonly string[]).includes(tool);
}
