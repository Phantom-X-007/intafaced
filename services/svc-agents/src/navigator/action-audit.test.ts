import { describe, expect, it } from 'vitest';
import {
  emptyNavigatorAuditLog,
  auditNavigatorDataTool,
  appendNavigatorAudit,
  verifyNavigatorAuditDense,
  navigatorAuditBoardCard,
  navigatorAuditStatusLine,
} from './action-audit.js';
import { invokeNavigatorDataTool, NAVIGATOR_DATA_TOOLS } from './data-tools.js';

const publishedAll = {
  published: true as const,
  matrix: { free: [...NAVIGATOR_DATA_TOOLS] },
};

const now = new Date('2026-08-07T12:00:00.000Z');
const occurredAt = '2026-08-07T12:00:01.000Z';

describe('navigator Stage-2 action audit', () => {
  it('records executed and refused user-affecting tool calls', () => {
    let log = emptyNavigatorAuditLog();

    const ok = invokeNavigatorDataTool({
      tool: 'trade.quote',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
      quote: { marketId: 'm1', last: '2.5', asOf: '2026-08-07T11:59:00.000Z', maxAgeMs: 120_000 },
      now,
    });
    log = auditNavigatorDataTool(log, ok, occurredAt);

    const refused = invokeNavigatorDataTool({
      tool: 'ledger.post',
      plane: 'live',
      tierLaw: publishedAll,
      userTier: 'free',
    });
    log = auditNavigatorDataTool(log, refused, '2026-08-07T12:00:02.000Z');

    expect(verifyNavigatorAuditDense(log)).toBe(true);
    expect(navigatorAuditBoardCard(log)).toEqual({
      total: 2,
      executed: 1,
      refused: 1,
      dense: true,
    });
    expect(log.entries[0]).toMatchObject({
      sequence: 0,
      status: 'executed',
      tool: 'trade.quote',
      userMessageKey: 'agents.action.executed',
    });
    expect(log.entries[1]).toMatchObject({
      sequence: 1,
      status: 'refused',
      tool: 'ledger.post',
      reason: 'money_write',
      userMessageKey: 'agents.navigator.unavailable',
    });
    expect(navigatorAuditStatusLine(log)).toBe('total=2 executed=1 refused=1 dense=1');
  });

  it('append is append-only and sequence-dense', () => {
    const log = appendNavigatorAudit(emptyNavigatorAuditLog(), {
      status: 'refused',
      tool: 'trade.quote',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.navigator.tier_closed',
      occurredAt,
    });
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.sequence).toBe(0);
  });
});
