import { describe, expect, it } from 'vitest';
import {
  applyComplianceQueueDisposition,
  complianceQueueSnapshot,
  filterComplianceQueue,
  type ComplianceQueueItem,
} from './compliance-queue.js';

/**
 * Unit card (L16 W9)
 * Promise: docs/ops/trk/ops.compliance.md Stage 2 — queues; empty partner not pass.
 * Break: partner_cleared without partner is a green-tick factory.
 * Done bar: refuse partner_cleared when partner absent; empty queue honest; no invent cases.
 * Class N · packages/config only.
 */

const ITEM: ComplianceQueueItem = {
  id: 'case-1',
  kind: 'screening_hit',
  subjectId: 'sub-9',
  openedAt: '2026-08-09T00:00:00.000Z',
};

describe('complianceQueueSnapshot', () => {
  it('empty queue is empty — not invent pending rows', () => {
    const s = complianceQueueSnapshot([], false);
    expect(s.empty).toBe(true);
    expect(s.items).toEqual([]);
    expect(s.summary).toContain('EMPTY');
    expect(s.summary).toContain('partner_cleared');
  });

  it('names pending count when non-empty', () => {
    const s = complianceQueueSnapshot([ITEM], true);
    expect(s.empty).toBe(false);
    expect(s.summary).toContain('1 pending');
    expect(s.summary).toContain('partner=configured');
  });
});

describe('applyComplianceQueueDisposition — partner honesty', () => {
  it('refuses partner_cleared when partner is absent', () => {
    const r = applyComplianceQueueDisposition(ITEM, { status: 'partner_cleared', partnerRef: 'slot-a' }, false);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.partner_absent');
    expect(r.reason).toContain('no screening partner');
  });

  it('accepts partner_cleared only when partner is configured and ref is present', () => {
    const r = applyComplianceQueueDisposition(ITEM, { status: 'partner_cleared', partnerRef: 'slot-a' }, true);
    expect(r).toEqual({
      ok: true,
      status: 'partner_cleared',
      itemId: 'case-1',
      actor: 'partner:slot-a',
    });
  });

  it('refuses partner_cleared with empty partnerRef even when configured', () => {
    const r = applyComplianceQueueDisposition(ITEM, { status: 'partner_cleared', partnerRef: '  ' }, true);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.empty_partner_ref');
  });

  it('operator clear works without a partner', () => {
    const r = applyComplianceQueueDisposition(ITEM, { status: 'cleared', by: 'operator', actor: 'ops:alice' }, false);
    expect(r).toEqual({ ok: true, status: 'cleared', itemId: 'case-1', actor: 'ops:alice' });
  });

  it('operator clear refuses empty actor', () => {
    const r = applyComplianceQueueDisposition(ITEM, { status: 'cleared', by: 'operator', actor: '  ' }, false);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.empty_actor');
  });

  it('operator reject requires reason', () => {
    const r = applyComplianceQueueDisposition(
      ITEM,
      { status: 'rejected', by: 'operator', actor: 'ops:bob', reason: '' },
      false,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.empty_reason');
  });

  it('unknown item refuses — cannot invent a case to clear', () => {
    const r = applyComplianceQueueDisposition(null, { status: 'cleared', by: 'operator', actor: 'ops:alice' }, false);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.unknown_item');
  });
});

describe('filterComplianceQueue', () => {
  it('empty kind filter returns empty — not invent all', () => {
    expect(filterComplianceQueue([ITEM], [])).toEqual([]);
  });

  it('filters by kind', () => {
    const kyc: ComplianceQueueItem = { ...ITEM, id: 'case-2', kind: 'kyc_review' };
    expect(filterComplianceQueue([ITEM, kyc], ['kyc_review']).map((i) => i.id)).toEqual(['case-2']);
  });
});
