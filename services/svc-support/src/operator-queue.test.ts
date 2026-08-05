import { describe, expect, it } from 'vitest';
import type { SupportTicket } from '@intafaced/contracts';
import { buildOperatorQueue } from './operator-queue.js';

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
      buildOperatorQueue([t({ id: '1', category: 'other', createdAt: '2026-08-05T00:00:00.000Z', status: 'closed' })], { now: NOW }),
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
      { now: NOW },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.entries.map((e) => e.ticketId)).toEqual(['c', 'b', 'a']);
    expect(r.entries[0]!.score).toBeGreaterThan(r.entries[2]!.score);
  });
});
