/**
 * Agents L3 — pure navigator money-write denylist honesty (no trade I/O).
 *
 * Mirrors guardrail.ts NAVIGATOR_MONEY_WRITE_TOOLS exactly.
 */

import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';

/** L3 — denylist board. */
export function navigatorMoneyDenyBoardCard(
  tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS,
): {
  readonly tools: number;
  readonly hasLedgerPost: number;
  readonly hasTradeOrder: number;
  readonly hasBankTransfer: number;
} {
  return {
    tools: tools.length,
    hasLedgerPost: tools.includes('ledger.post') ? 1 : 0,
    hasTradeOrder: tools.includes('trade.order') ? 1 : 0,
    hasBankTransfer: tools.includes('bank.transfer') ? 1 : 0,
  };
}

/** L3 — status line. */
export function navigatorMoneyDenyStatusLine(
  tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS,
): string {
  const c = navigatorMoneyDenyBoardCard(tools);
  return `tools=${c.tools} ledger_post=${c.hasLedgerPost} trade_order=${c.hasTradeOrder} bank_transfer=${c.hasBankTransfer}`;
}

/** L3 — parse status. */
export function parseNavigatorMoneyDenyStatusLine(line: string): {
  readonly tools: number;
  readonly ledgerPost: number;
  readonly tradeOrder: number;
  readonly bankTransfer: number;
} | null {
  const m = line
    .trim()
    .match(
      /^tools=(\d+) ledger_post=([01]) trade_order=([01]) bank_transfer=([01])$/,
    );
  if (!m) return null;
  return {
    tools: Number(m[1]),
    ledgerPost: Number(m[2]),
    tradeOrder: Number(m[3]),
    bankTransfer: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function navigatorMoneyDenyStatusLineMatches(
  tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS,
): boolean {
  const p = parseNavigatorMoneyDenyStatusLine(navigatorMoneyDenyStatusLine(tools));
  if (!p) return false;
  const c = navigatorMoneyDenyBoardCard(tools);
  return (
    p.tools === c.tools &&
    p.ledgerPost === c.hasLedgerPost &&
    p.tradeOrder === c.hasTradeOrder &&
    p.bankTransfer === c.hasBankTransfer
  );
}

/** L3 — money tools refused. */
export function navigatorMoneyDenyStatusLineConsistent(line: string): boolean {
  const p = parseNavigatorMoneyDenyStatusLine(line);
  if (!p) return false;
  return p.tools >= 1 && p.ledgerPost === 1 && p.tradeOrder === 1;
}

/** L3 — export header. */
export function navigatorMoneyDenyExportHeader(): string {
  return 'tools,ledger_post,trade_order,bank_transfer';
}

/** L3 — export line. */
export function navigatorMoneyDenyExportLine(
  tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS,
): string {
  const c = navigatorMoneyDenyBoardCard(tools);
  return `${c.tools},${c.hasLedgerPost},${c.hasTradeOrder},${c.hasBankTransfer}`;
}

/** L3 — full export. */
export function navigatorMoneyDenyExportText(
  tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS,
): string {
  return [navigatorMoneyDenyExportHeader(), navigatorMoneyDenyExportLine(tools)].join('\n');
}

/** L3 — tool denied. */
export function isNavigatorMoneyDenied(
  tool: string,
  tools: readonly string[] = NAVIGATOR_MONEY_WRITE_TOOLS,
): boolean {
  return tools.includes(tool);
}
