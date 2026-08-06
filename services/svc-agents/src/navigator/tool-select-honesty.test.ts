import { describe, expect, it } from 'vitest';
import {
  toolSelectBoardCard,
  toolSelectStatusLine,
  parseToolSelectStatusLine,
  toolSelectStatusLineMatches,
  toolSelectStatusLineConsistent,
  toolSelectExportHeader,
  toolSelectExportLine,
  toolSelectExportText,
  toolSelectHasNoMoneyWriteRefuse,
  toolSelectSelectedInRange,
  type ToolSelectResultInput,
} from './tool-select-honesty.js';

describe('L3 wave76 tool_select honesty', () => {
  it('ok and refuse boards', () => {
    const ok: ToolSelectResultInput = {
      status: 'ok',
      selected: ['trade.quote', 'trade.markets.list'],
      refused: [
        { tool: 'ledger.post', reason: 'money_write' },
        { tool: 'ghost.tool', reason: 'not_declared' },
        { tool: 'trade.order', reason: 'write_mode' },
      ],
    };
    expect(toolSelectBoardCard(ok)).toEqual({
      status: 'ok',
      selected: 2,
      refused: 3,
      moneyWrite: 1,
      notDeclared: 1,
      writeMode: 1,
      reason: '-',
    });
    expect(toolSelectStatusLine(ok)).toBe('status=ok selected=2 refused=3 money_write=1 not_declared=1 write_mode=1 reason=-');
    expect(toolSelectStatusLineMatches(ok)).toBe(true);
    expect(toolSelectStatusLineConsistent(toolSelectStatusLine(ok))).toBe(true);
    expect(toolSelectExportText(ok).startsWith(toolSelectExportHeader())).toBe(true);
    expect(toolSelectExportLine(ok)).toBe('ok,2,3,1,1,1,-');
    expect(toolSelectHasNoMoneyWriteRefuse(ok)).toBe(false);
    expect(toolSelectSelectedInRange(ok, 2, 2)).toBe(true);
    expect(toolSelectSelectedInRange(ok, 3, 1)).toBe(false);

    const dark: ToolSelectResultInput = { status: 'refuse', reason: 'trade_plane_dark' };
    expect(toolSelectBoardCard(dark).reason).toBe('trade_plane_dark');
    expect(toolSelectStatusLineMatches(dark)).toBe(true);
    expect(toolSelectStatusLineConsistent(toolSelectStatusLine(dark))).toBe(true);
    expect(toolSelectHasNoMoneyWriteRefuse(dark)).toBe(true);
    expect(parseToolSelectStatusLine('nope')).toBeNull();
  });
});
