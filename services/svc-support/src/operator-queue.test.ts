import { describe, expect, it } from 'vitest';
import type { SupportTicket } from '@intafaced/contracts';
import { assignNext, buildOperatorQueue, claimTicket } from './operator-queue.js';

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

describe('support Stage-2 operator queue', () => {
  it('returns empty when no open tickets', () => {
    expect(
      buildOperatorQueue([t({ id: '1', category: 'other', createdAt: '2026-08-05T00:00:00.000Z', status: 'closed' })], {
        now: NOW,
        limit: 100,
      }),
    ).toEqual({
      status: 'empty',
    });
  });

  it('ranks deposit_withdraw above other, then older first on equal weight', () => {
    const r = buildOperatorQueue(
      [
        t({ id: 'a', category: 'other', createdAt: '2026-08-05T10:00:00.000Z' }),
        t({ id: 'b', category: 'deposit_withdraw', createdAt: '2026-08-05T11:00:00.000Z' }),
        t({ id: 'c', category: 'deposit_withdraw', createdAt: '2026-08-04T12:00:00.000Z' }),
      ],
      { now: NOW, limit: 100 },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.entries.map((e) => e.ticketId)).toEqual(['c', 'b', 'a']);
    expect(r.entries[0]!.score).toBeGreaterThan(r.entries[2]!.score);
  });

  it('assignNext returns highest score ticket or null when empty', () => {
    expect(assignNext([], { now: NOW })).toBeNull();
    const next = assignNext(
      [
        t({ id: 'a', category: 'other', createdAt: '2026-08-05T10:00:00.000Z' }),
        t({ id: 'b', category: 'deposit_withdraw', createdAt: '2026-08-05T11:00:00.000Z' }),
      ],
      { now: NOW },
    );
    expect(next?.ticketId).toBe('b');
    expect(
      assignNext([t({ id: 'b', category: 'deposit_withdraw', createdAt: '2026-08-05T11:00:00.000Z' })], {
        now: NOW,
        excludeTicketIds: new Set(['b']),
      }),
    ).toBeNull();
  });

  it('claimTicket exclusive claim — refuse steal, idempotent same op', () => {
    const open = t({ id: 'x', category: 'account', createdAt: '2026-08-05T10:00:00.000Z' });
    const claimed = claimTicket({ tickets: [open], ticketId: 'x', operatorId: 'op-1', now: NOW });
    expect(claimed.status).toBe('ok');
    if (claimed.status !== 'ok') return;
    expect(claimed.ticket.assigneeId).toBe('op-1');
    expect(claimed.ticket.status).toBe('pending');

    expect(claimTicket({ tickets: [claimed.ticket], ticketId: 'x', operatorId: 'op-1', now: NOW }).status).toBe('ok');
    expect(claimTicket({ tickets: [claimed.ticket], ticketId: 'x', operatorId: 'op-2', now: NOW })).toMatchObject({
      status: 'refuse',
      reason: 'already_claimed',
    });
    expect(claimTicket({ tickets: [open], ticketId: 'nope', operatorId: 'op-1' })).toMatchObject({
      status: 'refuse',
      reason: 'not_found',
    });
  });

  /**
   * Fair claim: exclusive ownership is useless if the shared queue keeps
   * advertising the ticket. Two operators both "next" the same claimed row,
   * thrash on already_claimed, and the real free work sits underneath.
   * Shared queue = unassigned open/pending only. Assigned work is listAll/get.
   */
  it('shared queue and next skip tickets already claimed', () => {
    const free = t({ id: 'free', category: 'other', createdAt: '2026-08-05T10:00:00.000Z' });
    const owned = t({
      id: 'owned',
      category: 'deposit_withdraw',
      createdAt: '2026-08-04T12:00:00.000Z',
      status: 'pending',
      assigneeId: 'op-1',
    });
    const q = buildOperatorQueue([free, owned], { now: NOW, limit: 100 });
    expect(q.status).toBe('ok');
    if (q.status !== 'ok') return;
    expect(q.entries.map((e) => e.ticketId)).toEqual(['free']);
    expect(assignNext([free, owned], { now: NOW })?.ticketId).toBe('free');
    expect(assignNext([owned], { now: NOW })).toBeNull();
  });
});
