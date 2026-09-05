/**
 * Market Scanner Stage-2 — read-only spot data toolset.
 *
 * Spec: docs/ops/trk/agents.scanner.md Stage 2.
 *
 * Declares allowlisted public market tools only. Money-mutating tools are not
 * on the list → refuse as undeclared / money_write before dispatch. No orders
 * from scanner unless product law explicitly adds them later.
 */

import { isLiveWriteTool, parseGuardrail, type Guardrail } from '../fleet/guardrails.js';

/** Must never be granted on scanner (tests assert money_write / undeclared refuse). */
export const SCANNER_MONEY_WRITE_TOOLS = [
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

/** Stage-2 allowlisted spot / public read tools. */
export const SCANNER_DATA_TOOLS = ['trade.ticker', 'trade.markets.list', 'trade.book.top'] as const;
export type ScannerDataToolName = (typeof SCANNER_DATA_TOOLS)[number];

/**
 * Stage-2 scanner guardrail: scanner.rank + read-only spot tools.
 */
export function scannerAgentGuardrail(overrides: { version?: number } = {}): Guardrail {
  return parseGuardrail({
    agentId: 'scanner',
    version: overrides.version ?? 1,
    capacityMode: 'research_only',
    tools: [
      { name: 'trade.ticker', module: 'trade', mode: 'read' },
      { name: 'trade.markets.list', module: 'trade', mode: 'read' },
      { name: 'trade.book.top', module: 'trade', mode: 'read' },
    ],
    limits: {
      maxActionsPerSession: 80,
      maxOutputTokensPerCall: 4096,
      maxSpendPerSession: '1',
      allowedModules: ['trade', 'agents'],
      allowedTasks: ['scanner.rank'],
    },
  });
}

export function isScannerMoneyWriteTool(tool: string): boolean {
  return (SCANNER_MONEY_WRITE_TOOLS as readonly string[]).includes(tool) || isLiveWriteTool(tool);
}

export function isScannerDataTool(tool: string): tool is ScannerDataToolName {
  return (SCANNER_DATA_TOOLS as readonly string[]).includes(tool);
}

/** Declared tool names (stable order from guardrail). */
export function scannerDeclaredTools(g = scannerAgentGuardrail()): readonly string[] {
  return g.tools.map((t) => t.name);
}

/** Board card for ops / tests. */
export function scannerGuardrailBoardCard(g = scannerAgentGuardrail()): {
  readonly agentId: string;
  readonly version: number;
  readonly declared: number;
  readonly moneyDenied: number;
  readonly maxActions: number;
} {
  return {
    agentId: g.agentId,
    version: g.version,
    declared: g.tools.length,
    moneyDenied: SCANNER_MONEY_WRITE_TOOLS.length,
    maxActions: g.limits.maxActionsPerSession,
  };
}
