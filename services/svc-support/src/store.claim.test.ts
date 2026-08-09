import { describe, expect, it } from 'vitest';
import { MemorySupportStore } from './store.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OP_A = '33333333-3333-4333-8333-333333333333';
const OP_B = '44444444-4444-4444-8444-444444444444';

describe('MemorySupportStore claim exclusivity', () => {
  it('second operator loses the claim race (already_claimed)', async () => {
    const store = new MemorySupportStore();
    const t = await store.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Help',
      body: 'Body',
    });

    const first = await store.claimTicket({ ticketId: t.id, operatorId: OP_A });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error('expected ok');
    expect(first.ticket.assigneeId).toBe(OP_A);
    expect(first.ticket.status).toBe('pending');

    const second = await store.claimTicket({ ticketId: t.id, operatorId: OP_B });
    expect(second.status).toBe('refuse');
    if (second.status !== 'refuse') throw new Error('expected refuse');
    expect(second.reason).toBe('already_claimed');
  });

  it('same operator re-claim is idempotent', async () => {
    const store = new MemorySupportStore();
    const t = await store.createTicket({
      userId: USER,
      category: 'other',
      subject: 'Q',
      body: 'B',
    });
    const a = await store.claimTicket({ ticketId: t.id, operatorId: OP_A });
    const b = await store.claimTicket({ ticketId: t.id, operatorId: OP_A });
    expect(a.status).toBe('ok');
    expect(b.status).toBe('ok');
    if (b.status === 'ok') expect(b.ticket.assigneeId).toBe(OP_A);
  });

  it('refuses claim on resolved tickets', async () => {
    const store = new MemorySupportStore();
    const t = await store.createTicket({
      userId: USER,
      category: 'trading',
      subject: 'S',
      body: 'B',
    });
    await store.setStatus(t.id, 'resolved');
    const r = await store.claimTicket({ ticketId: t.id, operatorId: OP_A });
    expect(r).toEqual({ status: 'refuse', reason: 'not_queueable' });
  });
});
