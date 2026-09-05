import { describe, expect, it } from 'vitest';
import type { SupportTicket } from '@intafaced/contracts';
import { buildOperatorQueue } from './operator-queue.js';
import { assertScoreNotPromise, looksLikeSlaPromise, QUEUE_TIMING_KIND } from './sla-honesty.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

function t(partial: Partial<SupportTicket> & Pick<SupportTicket, 'id' | 'category' | 'createdAt'>): SupportTicket {
  return {
    userId: 'u1',
    subject: 'help',
    body: 'body',
    status: 'open',
    assigneeId: null,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

describe('support queue timing is a score, not an SLA', () => {
  it('stamps score_not_promise / sla:false on every queued row', () => {
    const r = buildOperatorQueue([t({ id: 'a', category: 'other', createdAt: '2026-08-05T10:00:00.000Z' })], {
      now: NOW,
      limit: 100,
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    const entry = r.entries[0]!;
    expect(entry.timingKind).toBe(QUEUE_TIMING_KIND);
    expect(entry.sla).toBe(false);
    expect(entry).not.toHaveProperty('slaMinutes');
    expect(entry).not.toHaveProperty('eta');
    expect(entry).not.toHaveProperty('dueAt');
    expect(looksLikeSlaPromise(entry)).toBe(false);
    assertScoreNotPromise(entry);
  });

  it('fails if a score is dressed as a timed promise', () => {
    expect(looksLikeSlaPromise({ score: 40, slaMinutes: 15 })).toBe(true);
    expect(looksLikeSlaPromise({ score: 40, eta: '15m' })).toBe(true);
    expect(looksLikeSlaPromise({ score: 40, dueAt: '2026-08-05T12:15:00.000Z' })).toBe(true);
    expect(looksLikeSlaPromise({ sla: true })).toBe(true);
    expect(looksLikeSlaPromise({ timingKind: 'first_response_sla' })).toBe(true);
    expect(looksLikeSlaPromise({ sla: false, timingKind: QUEUE_TIMING_KIND, score: 40 })).toBe(false);
    expect(() => assertScoreNotPromise({ slaMinutes: 30 })).toThrow(/SLA/);
  });
});
