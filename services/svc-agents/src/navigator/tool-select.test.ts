import { describe, expect, it } from 'vitest';
import { navigatorAgentGuardrail } from './guardrail.js';
import {
  orderSelectedTools,
  selectNavigatorTools,
  isToolSelectOk,
  toolSelectSelectedCount,
  toolSelectRefusedCount,
  toolSelectBoardCard,
  toolSelectStatusLine,
  parseToolSelectStatusLine,
  toolSelectStatusLineMatches,
  toolSelectExportHeader,
  toolSelectExportLine,
  toolSelectExportText,
  toolSelectSelectedInRange,
} from './tool-select.js';

describe('navigator L3 tool_select pure planner', () => {
  const g = () => navigatorAgentGuardrail();

  it('selects only declared read tools on live plane', () => {
    const r = selectNavigatorTools({
      plane: 'live',
      guardrail: g(),
      candidates: ['trade.quote', 'trade.fills.history', 'identity.session.read', 'ledger.post'],
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.selected).toEqual(['trade.quote', 'identity.session.read']);
    expect(r.refused).toEqual(
      expect.arrayContaining([
        { tool: 'trade.fills.history', reason: 'not_declared' },
        { tool: 'ledger.post', reason: 'money_write' },
      ]),
    );
  });

  it('dark plane refuses entire select — no invent', () => {
    const r = selectNavigatorTools({
      plane: 'dark',
      guardrail: g(),
      candidates: ['trade.quote'],
    });
    expect(r).toMatchObject({
      status: 'refuse',
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    });
  });

  it('empty candidates refuse', () => {
    expect(selectNavigatorTools({ plane: 'live', guardrail: g(), candidates: [] })).toEqual({
      status: 'refuse',
      reason: 'no_candidates',
    });
  });

  it('orderSelectedTools follows guardrail declaration order', () => {
    const ordered = orderSelectedTools(g(), ['identity.session.read', 'trade.quote']);
    expect(ordered).toEqual(['trade.quote', 'identity.session.read']);
  });

  it('dedupes candidates', () => {
    const r = selectNavigatorTools({
      plane: 'live',
      guardrail: g(),
      candidates: ['trade.quote', 'trade.quote', '  trade.quote  '],
    });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.selected).toEqual(['trade.quote']);
  });
});

describe('L3 wave50 tool-select status/export', () => {
  const g = navigatorAgentGuardrail();

  it('ok select status and export', () => {
    const r = selectNavigatorTools({
      plane: 'live',
      guardrail: g,
      candidates: ['trade.quote', 'ledger.post', 'ghost.tool'],
    });
    expect(isToolSelectOk(r)).toBe(true);
    expect(toolSelectSelectedCount(r)).toBe(1);
    expect(toolSelectRefusedCount(r)).toBe(2);
    expect(toolSelectBoardCard(r).ok).toBe(true);
    expect(toolSelectStatusLineMatches(r)).toBe(true);
    expect(parseToolSelectStatusLine('nope')).toBeNull();
    expect(toolSelectExportText(r).startsWith(toolSelectExportHeader())).toBe(true);
    expect(toolSelectSelectedInRange(r, 1, 1)).toBe(true);
    expect(toolSelectSelectedInRange(r, 2, 1)).toBe(false);
  });

  it('refuse plane dark status', () => {
    const r = selectNavigatorTools({ plane: 'dark', guardrail: g, candidates: ['trade.quote'] });
    expect(isToolSelectOk(r)).toBe(false);
    expect(toolSelectSelectedCount(r)).toBe(0);
    expect(toolSelectStatusLine(r)).toContain('reason=trade_plane_dark');
    expect(toolSelectStatusLineMatches(r)).toBe(true);
    expect(toolSelectExportLine(r)).toContain('refuse');
  });
});
