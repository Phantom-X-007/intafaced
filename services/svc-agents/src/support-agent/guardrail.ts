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

import { isLiveWriteTool, parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

/** Money-path tools that must NEVER appear on the support agent grant list. */
export const SUPPORT_MONEY_TOOLS = [
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
 * Support agent guardrail (Stage-1 reads + Stage-2 L3 comment write).
 *
 * Tools: ticket/kb read; ticket.comment is write + requiresApproval (never silent).
 * Completions: support.classify + support.reply.
 * Money tools stay undeclared → refuse before dispatch.
 *
 * `identity.account.read` (v3) is the Stage-2 read-only account projection the
 * tracker asks for. It is a read in the `identity` module and carries status +
 * KYC tier only — never a balance, which is why granting it does not put the
 * support agent anywhere near a money path (Doctrine §0.6).
 */
export function supportAgentGuardrail(overrides: { version?: number } = {}): Guardrail {
  return parseGuardrail({
    agentId: 'support',
    version: overrides.version ?? 3,
    capacityMode: 'research_only',
    tools: [
      { name: 'support.ticket.read', module: 'support', mode: 'read' },
      { name: 'support.kb.search', module: 'support', mode: 'read' },
      { name: 'identity.account.read', module: 'identity', mode: 'read' },
      // Stage-2 L3: comment only with explicit user/operator approval.
      {
        name: 'support.ticket.comment',
        module: 'support',
        mode: 'write',
        requiresApproval: true,
        maxCallsPerSession: 20,
      },
    ],
    limits: {
      maxActionsPerSession: 40,
      maxOutputTokensPerCall: 2048,
      maxSpendPerSession: '0.5',
      allowedModules: ['support', 'identity'],
      allowedTasks: ['support.classify', 'support.reply'],
    },
  });
}

/** True if a tool name is on the hard money denylist (for tests + docs). */
export function isSupportMoneyTool(tool: string): boolean {
  return (SUPPORT_MONEY_TOOLS as readonly string[]).includes(tool) || isLiveWriteTool(tool);
}

/** L3 — declared support tool names. */
export function supportDeclaredTools(g = supportAgentGuardrail()): readonly string[] {
  return g.tools.map((t) => t.name);
}

/** L3 — declared tool count. */
export function supportDeclaredToolCount(g = supportAgentGuardrail()): number {
  return g.tools.length;
}

/** L3 — money denylist size. */
export function supportMoneyDenylistCount(): number {
  return SUPPORT_MONEY_TOOLS.length;
}

/** L3 — count of tools requiring approval. */
export function supportApprovalRequiredCount(g = supportAgentGuardrail()): number {
  return g.tools.filter((t) => t.requiresApproval === true).length;
}

/** L3 — support guardrail board card. */
export function supportGuardrailBoardCard(g = supportAgentGuardrail()): {
  readonly agentId: string;
  readonly version: number;
  readonly declared: number;
  readonly moneyDenied: number;
  readonly approvalRequired: number;
} {
  return {
    agentId: g.agentId,
    version: g.version,
    declared: supportDeclaredToolCount(g),
    moneyDenied: supportMoneyDenylistCount(),
    approvalRequired: supportApprovalRequiredCount(g),
  };
}

/** L3 — status line. */
export function supportGuardrailStatusLine(g = supportAgentGuardrail()): string {
  const c = supportGuardrailBoardCard(g);
  return `agent=${c.agentId} v=${c.version} declared=${c.declared} moneyDenied=${c.moneyDenied} approval=${c.approvalRequired}`;
}

/** L3 — parse status. Invalid → null. */
export function parseSupportGuardrailStatusLine(line: string): {
  readonly agentId: string;
  readonly version: number;
  readonly declared: number;
  readonly moneyDenied: number;
  readonly approval: number;
} | null {
  const m = line.trim().match(/^agent=(\S+) v=(\d+) declared=(\d+) moneyDenied=(\d+) approval=(\d+)$/);
  if (!m) return null;
  return {
    agentId: m[1]!,
    version: Number(m[2]),
    declared: Number(m[3]),
    moneyDenied: Number(m[4]),
    approval: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function supportGuardrailStatusLineMatches(g = supportAgentGuardrail()): boolean {
  const p = parseSupportGuardrailStatusLine(supportGuardrailStatusLine(g));
  if (!p) return false;
  const c = supportGuardrailBoardCard(g);
  return (
    p.agentId === c.agentId &&
    p.version === c.version &&
    p.declared === c.declared &&
    p.moneyDenied === c.moneyDenied &&
    p.approval === c.approvalRequired
  );
}

/** L3 — export header. */
export function supportGuardrailExportHeader(): string {
  return 'agentId,version,declared,moneyDenied,approvalRequired';
}

/** L3 — export line. */
export function supportGuardrailExportLine(g = supportAgentGuardrail()): string {
  const c = supportGuardrailBoardCard(g);
  return `${c.agentId},${c.version},${c.declared},${c.moneyDenied},${c.approvalRequired}`;
}

/** L3 — full export. */
export function supportGuardrailExportText(g = supportAgentGuardrail()): string {
  return [supportGuardrailExportHeader(), supportGuardrailExportLine(g)].join('\n');
}

/** L3 — true when declared count is within [min,max]. Invalid → false. */
export function supportDeclaredInRange(min: number, max: number, g = supportAgentGuardrail()): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = supportDeclaredToolCount(g);
  return n >= min && n <= max;
}

/** L3 — true when every money tool is on denylist. */
export function supportMoneyDenylistComplete(tools: readonly string[] = SUPPORT_MONEY_TOOLS): boolean {
  return tools.length > 0 && tools.every((t) => isSupportMoneyTool(t));
}
