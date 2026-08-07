import { describe, expect, it } from 'vitest';
import {
  isScannerMoneyWriteTool,
  scannerAgentGuardrail,
  scannerDeclaredTools,
  scannerGuardrailBoardCard,
  SCANNER_DATA_TOOLS,
  SCANNER_MONEY_WRITE_TOOLS,
} from './guardrail.js';

describe('scannerAgentGuardrail (Stage-2)', () => {
  it('declares only read spot tools + scanner.rank task', () => {
    const g = scannerAgentGuardrail();
    expect(g.agentId).toBe('scanner');
    expect(scannerDeclaredTools(g)).toEqual([...SCANNER_DATA_TOOLS]);
    expect(g.tools.every((t) => t.mode === 'read')).toBe(true);
    expect(g.limits.allowedTasks).toEqual(['scanner.rank']);
  });

  it('denies money-write tools', () => {
    expect(isScannerMoneyWriteTool('ledger.post')).toBe(true);
    expect(isScannerMoneyWriteTool('trade.order')).toBe(true);
    expect(isScannerMoneyWriteTool('trade.ticker')).toBe(false);
    expect(SCANNER_MONEY_WRITE_TOOLS.length).toBeGreaterThan(0);
  });

  it('board card summarises grants', () => {
    const card = scannerGuardrailBoardCard();
    expect(card).toMatchObject({
      agentId: 'scanner',
      declared: SCANNER_DATA_TOOLS.length,
      moneyDenied: SCANNER_MONEY_WRITE_TOOLS.length,
    });
  });
});
