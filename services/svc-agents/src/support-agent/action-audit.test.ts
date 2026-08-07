import { describe, expect, it } from 'vitest';
import {
  appendSupportAudit,
  auditSupportDataTool,
  emptySupportAuditLog,
  supportAuditBoardCard,
  supportAuditStatusLine,
  verifySupportAuditDense,
} from './action-audit.js';
import type { SupportDataToolResult } from './data-tools.js';

const AT = '2026-08-07T22:00:00.000Z';

const ok: SupportDataToolResult = {
  status: 'ok',
  tool: 'support.ticket.read',
  ticket: { ticketId: 'tkt-1', ownerUserId: 'user-1', status: 'open', category: 'withdrawals' },
};

const refused: SupportDataToolResult = {
  status: 'refuse',
  tool: 'support.ticket.read',
  reason: 'not_ticket_owner',
  userMessageKey: 'agents.support.unavailable',
};

describe('support Stage-2 action audit', () => {
  it('records an executed read', () => {
    const log = auditSupportDataTool(emptySupportAuditLog(), ok, AT);
    expect(log.entries).toEqual([
      {
        sequence: 0,
        kind: 'tool_call',
        status: 'executed',
        tool: 'support.ticket.read',
        reason: null,
        userMessageKey: 'agents.action.executed',
        occurredAt: AT,
      },
    ]);
  });

  it('records a refusal with the same ceremony — a denial leaves a row', () => {
    const log = auditSupportDataTool(emptySupportAuditLog(), refused, AT);
    expect(log.entries[0]).toMatchObject({
      status: 'refused',
      reason: 'not_ticket_owner',
      userMessageKey: 'agents.support.unavailable',
    });
  });

  it('sequences densely from zero and never mutates the input log', () => {
    const first = auditSupportDataTool(emptySupportAuditLog(), ok, AT);
    const second = auditSupportDataTool(first, refused, AT);
    expect(first.entries).toHaveLength(1);
    expect(second.entries.map((e) => e.sequence)).toEqual([0, 1]);
    expect(verifySupportAuditDense(second)).toBe(true);
  });

  it('board card and status line count both outcomes', () => {
    const log = auditSupportDataTool(auditSupportDataTool(emptySupportAuditLog(), ok, AT), refused, AT);
    expect(supportAuditBoardCard(log)).toEqual({ total: 2, executed: 1, refused: 1, dense: true });
    expect(supportAuditStatusLine(log)).toBe('total=2 executed=1 refused=1 dense=1');
  });

  it('a gap in the sequence is visible, not silently accepted', () => {
    const log = appendSupportAudit(emptySupportAuditLog(), {
      status: 'executed',
      tool: 'support.kb.search',
      userMessageKey: 'agents.action.executed',
      occurredAt: AT,
    });
    const tampered = { entries: [{ ...log.entries[0]!, sequence: 7 }] };
    expect(verifySupportAuditDense(tampered)).toBe(false);
    expect(supportAuditBoardCard(tampered).dense).toBe(false);
  });
});
