/**
 * Agents L3 — pure support money-tool denylist honesty (no ticket I/O).
 *
 * Mirrors guardrail.ts SUPPORT_MONEY_TOOLS exactly. No invent tools.
 */

import { SUPPORT_MONEY_TOOLS } from './guardrail.js';

/** L3 — denylist board. */
export function supportMoneyDenyBoardCard(tools: readonly string[] = SUPPORT_MONEY_TOOLS): {
  readonly tools: number;
  readonly hasLedgerPost: number;
  readonly hasPayRefund: number;
  readonly hasTradeOrder: number;
} {
  return {
    tools: tools.length,
    hasLedgerPost: tools.includes('ledger.post') ? 1 : 0,
    hasPayRefund: tools.includes('pay.refund') ? 1 : 0,
    hasTradeOrder: tools.includes('trade.order') ? 1 : 0,
  };
}

/** L3 — status line. */
export function supportMoneyDenyStatusLine(tools: readonly string[] = SUPPORT_MONEY_TOOLS): string {
  const c = supportMoneyDenyBoardCard(tools);
  return `tools=${c.tools} ledger_post=${c.hasLedgerPost} pay_refund=${c.hasPayRefund} trade_order=${c.hasTradeOrder}`;
}

/** L3 — parse status. */
export function parseSupportMoneyDenyStatusLine(line: string): {
  readonly tools: number;
  readonly ledgerPost: number;
  readonly payRefund: number;
  readonly tradeOrder: number;
} | null {
  const m = line.trim().match(/^tools=(\d+) ledger_post=([01]) pay_refund=([01]) trade_order=([01])$/);
  if (!m) return null;
  return {
    tools: Number(m[1]),
    ledgerPost: Number(m[2]),
    payRefund: Number(m[3]),
    tradeOrder: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function supportMoneyDenyStatusLineMatches(tools: readonly string[] = SUPPORT_MONEY_TOOLS): boolean {
  const p = parseSupportMoneyDenyStatusLine(supportMoneyDenyStatusLine(tools));
  if (!p) return false;
  const c = supportMoneyDenyBoardCard(tools);
  return p.tools === c.tools && p.ledgerPost === c.hasLedgerPost && p.payRefund === c.hasPayRefund && p.tradeOrder === c.hasTradeOrder;
}

/** L3 — money tools refused. */
export function supportMoneyDenyStatusLineConsistent(line: string): boolean {
  const p = parseSupportMoneyDenyStatusLine(line);
  if (!p) return false;
  return p.tools >= 1 && p.ledgerPost === 1 && p.payRefund === 1 && p.tradeOrder === 1;
}

/** L3 — export header. */
export function supportMoneyDenyExportHeader(): string {
  return 'tools,ledger_post,pay_refund,trade_order';
}

/** L3 — export line. */
export function supportMoneyDenyExportLine(tools: readonly string[] = SUPPORT_MONEY_TOOLS): string {
  const c = supportMoneyDenyBoardCard(tools);
  return `${c.tools},${c.hasLedgerPost},${c.hasPayRefund},${c.hasTradeOrder}`;
}

/** L3 — full export. */
export function supportMoneyDenyExportText(tools: readonly string[] = SUPPORT_MONEY_TOOLS): string {
  return [supportMoneyDenyExportHeader(), supportMoneyDenyExportLine(tools)].join('\n');
}

/** L3 — tool denied. */
export function isSupportMoneyDenied(tool: string, tools: readonly string[] = SUPPORT_MONEY_TOOLS): boolean {
  return tools.includes(tool);
}
