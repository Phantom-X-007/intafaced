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

/** L3 — declared tool names. */
export function copyIntelDeclaredTools(g = copyIntelAgentGuardrail()): readonly string[] {
  return g.tools.map((t) => t.name);
}

/** L3 — declared count. */
export function copyIntelDeclaredToolCount(g = copyIntelAgentGuardrail()): number {
  return g.tools.length;
}

/** L3 — money denylist size. */
export function copyIntelMoneyDenylistCount(): number {
  return COPY_INTEL_MONEY_WRITE_TOOLS.length;
}

/** L3 — board card. */
export function copyIntelGuardrailBoardCard(g = copyIntelAgentGuardrail()): {
  readonly agentId: string;
  readonly version: number;
  readonly declared: number;
  readonly moneyDenied: number;
  readonly maxActions: number;
} {
  return {
    agentId: g.agentId,
    version: g.version,
    declared: copyIntelDeclaredToolCount(g),
    moneyDenied: copyIntelMoneyDenylistCount(),
    maxActions: g.limits.maxActionsPerSession,
  };
}

/** L3 — status line. */
export function copyIntelGuardrailStatusLine(g = copyIntelAgentGuardrail()): string {
  const c = copyIntelGuardrailBoardCard(g);
  return `agent=${c.agentId} v=${c.version} declared=${c.declared} moneyDenied=${c.moneyDenied}`;
}

/** L3 — parse status. Invalid → null. */
export function parseCopyIntelGuardrailStatusLine(
  line: string,
): { readonly agentId: string; readonly version: number; readonly declared: number; readonly moneyDenied: number } | null {
  const m = line.trim().match(/^agent=(\S+) v=(\d+) declared=(\d+) moneyDenied=(\d+)$/);
  if (!m) return null;
  return { agentId: m[1]!, version: Number(m[2]), declared: Number(m[3]), moneyDenied: Number(m[4]) };
}

/** L3 — true when status matches. */
export function copyIntelGuardrailStatusLineMatches(g = copyIntelAgentGuardrail()): boolean {
  const p = parseCopyIntelGuardrailStatusLine(copyIntelGuardrailStatusLine(g));
  if (!p) return false;
  const c = copyIntelGuardrailBoardCard(g);
  return p.agentId === c.agentId && p.version === c.version && p.declared === c.declared && p.moneyDenied === c.moneyDenied;
}

/** L3 — export header. */
export function copyIntelGuardrailExportHeader(): string {
  return 'agentId,version,declared,moneyDenied';
}

/** L3 — export line. */
export function copyIntelGuardrailExportLine(g = copyIntelAgentGuardrail()): string {
  const c = copyIntelGuardrailBoardCard(g);
  return `${c.agentId},${c.version},${c.declared},${c.moneyDenied}`;
}

/** L3 — full export. */
export function copyIntelGuardrailExportText(g = copyIntelAgentGuardrail()): string {
  return [copyIntelGuardrailExportHeader(), copyIntelGuardrailExportLine(g)].join('\n');
}

/** L3 — true when every money-write tool is on denylist. */
export function copyIntelMoneyDenylistComplete(tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): boolean {
  return tools.length > 0 && tools.every((t) => isCopyIntelMoneyWriteTool(t));
}

/** L3 — true when declared count is within [min,max]. Invalid → false. */
export function copyIntelDeclaredInRange(min: number, max: number, g = copyIntelAgentGuardrail()): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = copyIntelDeclaredToolCount(g);
  return n >= min && n <= max;
}
