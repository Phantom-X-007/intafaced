import { describe, expect, it } from 'vitest';
import {
  auditStatusHistogram,
  auditKindHistogram,
  auditLogBoardCard,
  auditLogStatusLine,
  parseAuditLogStatusLine,
  auditLogStatusLineMatches,
  auditLogStatusLineConsistent,
  auditLogExportHeader,
  auditLogExportLine,
  auditLogExportText,
  auditCatalogBoardCard,
  auditCatalogStatusLine,
  parseAuditCatalogStatusLine,
  auditCatalogStatusLineMatches,
  auditEntryCountInRange,
  AUDIT_ACTION_KINDS,
  AUDIT_ACTION_STATUSES,
  type AuditBoardEntry,
} from './audit-honesty.js';

describe('L3 wave74 audit log honesty', () => {
  it('empty and mixed audit boards', () => {
    const empty: readonly AuditBoardEntry[] = [];
    expect(auditLogBoardCard(empty).entries).toBe(0);
    expect(auditLogStatusLineMatches(empty)).toBe(true);
    expect(auditLogStatusLineConsistent(auditLogStatusLine(empty))).toBe(true);
    expect(parseAuditLogStatusLine('nope')).toBeNull();

    const mixed: readonly AuditBoardEntry[] = [
      { kind: 'session_open', status: 'executed', tool: null },
      { kind: 'tool_call', status: 'refused', tool: 'ledger.post' },
      { kind: 'tool_call', status: 'executed', tool: 'pay.metrics.read' },
      { kind: 'completion', status: 'failed', tool: null },
    ];
    expect(auditStatusHistogram(mixed)).toEqual({ executed: 2, refused: 1, failed: 1 });
    expect(auditKindHistogram(mixed).tool_call).toBe(2);
    expect(auditLogBoardCard(mixed)).toEqual({
      entries: 4,
      executed: 2,
      refused: 1,
      failed: 1,
      toolCalls: 2,
    });
    expect(auditLogStatusLine(mixed)).toBe(
      'entries=4 executed=2 refused=1 failed=1 tool_calls=2',
    );
    expect(auditLogStatusLineMatches(mixed)).toBe(true);
    expect(auditLogStatusLineConsistent(auditLogStatusLine(mixed))).toBe(true);
    expect(auditLogExportText(mixed).startsWith(auditLogExportHeader())).toBe(true);
    expect(auditLogExportLine(mixed)).toBe('4,2,1,1,2');
    expect(auditEntryCountInRange(mixed, 4, 4)).toBe(true);
    expect(auditEntryCountInRange(mixed, 5, 1)).toBe(false);
  });

  it('catalog sizes', () => {
    expect(AUDIT_ACTION_KINDS).toHaveLength(6);
    expect(AUDIT_ACTION_STATUSES).toHaveLength(3);
    expect(auditCatalogBoardCard()).toEqual({ kinds: 6, statuses: 3 });
    expect(auditCatalogStatusLineMatches()).toBe(true);
    expect(parseAuditCatalogStatusLine(auditCatalogStatusLine())).toEqual({
      kinds: 6,
      statuses: 3,
    });
  });
});
