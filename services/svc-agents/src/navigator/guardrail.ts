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

import { isLiveWriteTool, parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

/** Must never be granted on Stage-1 navigator (tests assert undeclared refuse). */
export const NAVIGATOR_MONEY_WRITE_TOOLS = [
  'ledger.post',
  'ledger.hold',
  'pay.refund',
  'pay.capture',
  'bank.transfer',
  'bank.withdraw',
  'bank.loan',
  'trade.order',
  'trade.place',
  'trade.amend',
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
    capacityMode: 'research_only',
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
  return (NAVIGATOR_MONEY_WRITE_TOOLS as readonly string[]).includes(tool) || isLiveWriteTool(tool);
}

/** L3 — declared tool names (stable order from guardrail). */
export function navigatorDeclaredTools(g = navigatorAgentGuardrail()): readonly string[] {
  return g.tools.map((t) => t.name);
}

/** True when `tool` is on the Stage-1 product allowlist. Caller grants cannot widen this. */
export function isNavigatorAllowlistedTool(tool: string, g = navigatorAgentGuardrail()): boolean {
  return navigatorDeclaredTools(g).includes(tool.trim());
}

/** L3 — count of declared tools. */
export function navigatorDeclaredToolCount(g = navigatorAgentGuardrail()): number {
  return g.tools.length;
}

/** L3 — money denylist size. */
export function navigatorMoneyDenylistCount(): number {
  return NAVIGATOR_MONEY_WRITE_TOOLS.length;
}

/** L3 — board card for navigator Stage-1 grants. */
export function navigatorGuardrailBoardCard(g = navigatorAgentGuardrail()): {
  readonly agentId: string;
  readonly version: number;
  readonly declared: number;
  readonly moneyDenied: number;
  readonly maxActions: number;
} {
  return {
    agentId: g.agentId,
    version: g.version,
    declared: navigatorDeclaredToolCount(g),
    moneyDenied: navigatorMoneyDenylistCount(),
    maxActions: g.limits.maxActionsPerSession,
  };
}

/** L3 — status line. */
export function navigatorGuardrailStatusLine(g = navigatorAgentGuardrail()): string {
  const c = navigatorGuardrailBoardCard(g);
  return `agent=${c.agentId} v=${c.version} declared=${c.declared} moneyDenied=${c.moneyDenied}`;
}

/** L3 — parse status. Invalid → null. */
export function parseNavigatorGuardrailStatusLine(
  line: string,
): { readonly agentId: string; readonly version: number; readonly declared: number; readonly moneyDenied: number } | null {
  const m = line.trim().match(/^agent=(\S+) v=(\d+) declared=(\d+) moneyDenied=(\d+)$/);
  if (!m) return null;
  return { agentId: m[1]!, version: Number(m[2]), declared: Number(m[3]), moneyDenied: Number(m[4]) };
}

/** L3 — true when status matches guardrail. */
export function navigatorGuardrailStatusLineMatches(g = navigatorAgentGuardrail()): boolean {
  const p = parseNavigatorGuardrailStatusLine(navigatorGuardrailStatusLine(g));
  if (!p) return false;
  const c = navigatorGuardrailBoardCard(g);
  return p.agentId === c.agentId && p.version === c.version && p.declared === c.declared && p.moneyDenied === c.moneyDenied;
}

/** L3 — export header. */
export function navigatorGuardrailExportHeader(): string {
  return 'agentId,version,declared,moneyDenied';
}

/** L3 — export line. */
export function navigatorGuardrailExportLine(g = navigatorAgentGuardrail()): string {
  const c = navigatorGuardrailBoardCard(g);
  return `${c.agentId},${c.version},${c.declared},${c.moneyDenied}`;
}

/** L3 — full export. */
export function navigatorGuardrailExportText(g = navigatorAgentGuardrail()): string {
  return [navigatorGuardrailExportHeader(), navigatorGuardrailExportLine(g)].join('\n');
}

/** L3 — true when declared count is within [min,max]. Invalid → false. */
export function navigatorDeclaredInRange(min: number, max: number, g = navigatorAgentGuardrail()): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = navigatorDeclaredToolCount(g);
  return n >= min && n <= max;
}

/** L3 — true when every money-write tool is on denylist. */
export function navigatorMoneyDenylistComplete(tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS): boolean {
  return tools.length > 0 && tools.every((t) => isNavigatorMoneyWriteTool(t));
}
