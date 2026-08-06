/**
 * Agents L3 — pure copy-intel money-write denylist honesty (no trade I/O).
 *
 * Mirrors guardrail.ts COPY_INTEL_MONEY_WRITE_TOOLS exactly. No invent tools.
 */

import { COPY_INTEL_MONEY_WRITE_TOOLS } from './guardrail.js';

/** L3 — denylist board from tip source of truth. */
export function copyIntelMoneyDenyBoardCard(tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): {
  readonly tools: number;
  readonly hasLedgerPost: number;
  readonly hasTradeOrder: number;
  readonly hasCopyFollow: number;
} {
  return {
    tools: tools.length,
    hasLedgerPost: tools.includes('ledger.post') ? 1 : 0,
    hasTradeOrder: tools.includes('trade.order') ? 1 : 0,
    hasCopyFollow: tools.includes('trade.copy.follow') ? 1 : 0,
  };
}

/** L3 — status line. */
export function copyIntelMoneyDenyStatusLine(tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): string {
  const c = copyIntelMoneyDenyBoardCard(tools);
  return `tools=${c.tools} ledger_post=${c.hasLedgerPost} trade_order=${c.hasTradeOrder} copy_follow=${c.hasCopyFollow}`;
}

/** L3 — parse status. */
export function parseCopyIntelMoneyDenyStatusLine(line: string): {
  readonly tools: number;
  readonly ledgerPost: number;
  readonly tradeOrder: number;
  readonly copyFollow: number;
} | null {
  const m = line.trim().match(/^tools=(\d+) ledger_post=([01]) trade_order=([01]) copy_follow=([01])$/);
  if (!m) return null;
  return {
    tools: Number(m[1]),
    ledgerPost: Number(m[2]),
    tradeOrder: Number(m[3]),
    copyFollow: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function copyIntelMoneyDenyStatusLineMatches(tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): boolean {
  const p = parseCopyIntelMoneyDenyStatusLine(copyIntelMoneyDenyStatusLine(tools));
  if (!p) return false;
  const c = copyIntelMoneyDenyBoardCard(tools);
  return p.tools === c.tools && p.ledgerPost === c.hasLedgerPost && p.tradeOrder === c.hasTradeOrder && p.copyFollow === c.hasCopyFollow;
}

/** L3 — money tools refused; ledger + trade.order present. */
export function copyIntelMoneyDenyStatusLineConsistent(line: string): boolean {
  const p = parseCopyIntelMoneyDenyStatusLine(line);
  if (!p) return false;
  return p.tools >= 1 && p.ledgerPost === 1 && p.tradeOrder === 1;
}

/** L3 — export header. */
export function copyIntelMoneyDenyExportHeader(): string {
  return 'tools,ledger_post,trade_order,copy_follow';
}

/** L3 — export line. */
export function copyIntelMoneyDenyExportLine(tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): string {
  const c = copyIntelMoneyDenyBoardCard(tools);
  return `${c.tools},${c.hasLedgerPost},${c.hasTradeOrder},${c.hasCopyFollow}`;
}

/** L3 — full export. */
export function copyIntelMoneyDenyExportText(tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): string {
  return [copyIntelMoneyDenyExportHeader(), copyIntelMoneyDenyExportLine(tools)].join('\n');
}

/** L3 — tool on denylist (delegates to tip list). */
export function isCopyIntelMoneyDenied(tool: string, tools: readonly string[] = COPY_INTEL_MONEY_WRITE_TOOLS): boolean {
  return tools.includes(tool);
}
