/**
 * Agents L3 — pure merchant guardrail tool catalog honesty (no pay I/O).
 *
 * Mirrors guardrail.ts MERCHANT_MONEY_WRITE_TOOLS + read tools.
 * Does not invent rail routing product law.
 */

import { MERCHANT_MONEY_WRITE_TOOLS, merchantAgentGuardrail } from './guardrail.js';

/** L3 — money refuse catalog board. */
export function merchantMoneyDenyBoardCard(
  tools: readonly string[] = MERCHANT_MONEY_WRITE_TOOLS,
): {
  readonly tools: number;
  readonly hasLedgerPost: number;
  readonly hasPayRouteChange: number;
} {
  return {
    tools: tools.length,
    hasLedgerPost: tools.includes('ledger.post') ? 1 : 0,
    hasPayRouteChange: tools.includes('pay.route.change') ? 1 : 0,
  };
}

/** L3 — money deny status line. */
export function merchantMoneyDenyStatusLine(
  tools: readonly string[] = MERCHANT_MONEY_WRITE_TOOLS,
): string {
  const c = merchantMoneyDenyBoardCard(tools);
  return `tools=${c.tools} ledger_post=${c.hasLedgerPost} pay_route_change=${c.hasPayRouteChange}`;
}

/** L3 — parse money deny. */
export function parseMerchantMoneyDenyStatusLine(line: string): {
  readonly tools: number;
  readonly ledgerPost: number;
  readonly payRouteChange: number;
} | null {
  const m = line
    .trim()
    .match(/^tools=(\d+) ledger_post=([01]) pay_route_change=([01])$/);
  if (!m) return null;
  return {
    tools: Number(m[1]),
    ledgerPost: Number(m[2]),
    payRouteChange: Number(m[3]),
  };
}

/** L3 — true when money deny matches. */
export function merchantMoneyDenyStatusLineMatches(
  tools: readonly string[] = MERCHANT_MONEY_WRITE_TOOLS,
): boolean {
  const p = parseMerchantMoneyDenyStatusLine(merchantMoneyDenyStatusLine(tools));
  if (!p) return false;
  const c = merchantMoneyDenyBoardCard(tools);
  return (
    p.tools === c.tools &&
    p.ledgerPost === c.hasLedgerPost &&
    p.payRouteChange === c.hasPayRouteChange
  );
}

/** L3 — guardrail grant board (declared tools only). */
export function merchantGuardrailBoardCard(): {
  readonly agentId: string;
  readonly tools: number;
  readonly readTools: number;
  readonly writeTools: number;
  readonly tasks: number;
} {
  const g = merchantAgentGuardrail();
  return {
    agentId: g.agentId,
    tools: g.tools.length,
    readTools: g.tools.filter((t) => t.mode === 'read').length,
    writeTools: g.tools.filter((t) => t.mode === 'write').length,
    tasks: g.limits.allowedTasks.length,
  };
}

/** L3 — guardrail status line. */
export function merchantGuardrailStatusLine(): string {
  const c = merchantGuardrailBoardCard();
  return `agent=${c.agentId} tools=${c.tools} read=${c.readTools} write=${c.writeTools} tasks=${c.tasks}`;
}

/** L3 — parse guardrail. */
export function parseMerchantGuardrailStatusLine(line: string): {
  readonly agent: string;
  readonly tools: number;
  readonly read: number;
  readonly write: number;
  readonly tasks: number;
} | null {
  const m = line
    .trim()
    .match(/^agent=([a-z0-9_-]+) tools=(\d+) read=(\d+) write=(\d+) tasks=(\d+)$/);
  if (!m) return null;
  return {
    agent: m[1]!,
    tools: Number(m[2]),
    read: Number(m[3]),
    write: Number(m[4]),
    tasks: Number(m[5]),
  };
}

/** L3 — true when guardrail status matches. */
export function merchantGuardrailStatusLineMatches(): boolean {
  const p = parseMerchantGuardrailStatusLine(merchantGuardrailStatusLine());
  if (!p) return false;
  const c = merchantGuardrailBoardCard();
  return (
    p.agent === c.agentId &&
    p.tools === c.tools &&
    p.read === c.readTools &&
    p.write === c.writeTools &&
    p.tasks === c.tasks
  );
}

/** L3 — Stage-1 is read-only grants (write=0). */
export function merchantGuardrailStatusLineConsistent(line: string): boolean {
  const p = parseMerchantGuardrailStatusLine(line);
  if (!p) return false;
  return p.agent === 'merchant' && p.write === 0 && p.read + p.write === p.tools;
}

/** L3 — export header. */
export function merchantGuardrailExportHeader(): string {
  return 'agent,tools,read,write,tasks';
}

/** L3 — export line. */
export function merchantGuardrailExportLine(): string {
  const c = merchantGuardrailBoardCard();
  return `${c.agentId},${c.tools},${c.readTools},${c.writeTools},${c.tasks}`;
}

/** L3 — full export. */
export function merchantGuardrailExportText(): string {
  return [merchantGuardrailExportHeader(), merchantGuardrailExportLine()].join('\n');
}

/** L3 — tool money-denied. */
export function isMerchantMoneyDenied(
  tool: string,
  tools: readonly string[] = MERCHANT_MONEY_WRITE_TOOLS,
): boolean {
  return tools.includes(tool);
}
