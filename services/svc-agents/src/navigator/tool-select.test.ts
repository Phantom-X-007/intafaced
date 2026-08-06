import { describe, expect, it } from 'vitest';
import { navigatorAgentGuardrail } from './guardrail.js';
import { orderSelectedTools, selectNavigatorTools } from './tool-select.js';

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
