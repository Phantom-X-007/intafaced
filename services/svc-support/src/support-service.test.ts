import { describe, expect, it } from 'vitest';
import { SupportService } from './support-service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OP = '33333333-3333-4333-8333-333333333333';

describe('SupportService Stage-1', () => {
  it('creates and lists tickets for the owner only', async () => {
    const svc = new SupportService();
    const t = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Cannot sign in',
      body: 'Reset help please',
    });
    expect(t.status).toBe('open');
    expect(t.assigneeId).toBeNull();
    // no money fields
    expect(t).not.toHaveProperty('balance');
    expect(t).not.toHaveProperty('refundAmount');

    expect(await svc.listMyTickets({ userId: USER })).toHaveLength(1);
    expect(await svc.listMyTickets({ userId: OTHER })).toHaveLength(0);
  });

  it('hides other users tickets from non-operators', async () => {
    const svc = new SupportService();
    const t = await svc.createTicket({
      userId: USER,
      category: 'other',
      subject: 'Q',
      body: 'B',
    });
    await expect(svc.getTicket({ userId: OTHER, ticketId: t.id })).rejects.toMatchObject({
      code: 'support.not_found',
    });
    await expect(svc.getTicket({ userId: OP, ticketId: t.id, asOperator: true })).resolves.toMatchObject({
      id: t.id,
    });
  });

  it('comments and status without any ledger side effects', async () => {
    const svc = new SupportService();
    const t = await svc.createTicket({
      userId: USER,
      category: 'trading',
      subject: 'Order stuck',
      body: 'Details',
    });
    const c = await svc.comment({ userId: USER, ticketId: t.id, body: 'More info' });
    expect(c.authorRole).toBe('user');
    const thread = await svc.listComments({ userId: USER, ticketId: t.id });
    expect(thread).toHaveLength(1);
    expect(thread[0]!.id).toBe(c.id);
    await expect(svc.listComments({ userId: OTHER, ticketId: t.id })).rejects.toMatchObject({
      code: 'support.not_found',
    });
    const all = await svc.listAllTickets();
    expect(all).toHaveLength(1);
    const resolved = await svc.setStatus({ operatorId: OP, ticketId: t.id, status: 'resolved' });
    expect(resolved.status).toBe('resolved');
  });

  it('lists Stage-2 platform KB spine (i18n keys only)', async () => {
    const svc = new SupportService();
    const kb = await svc.listKb();
    expect(kb.length).toBeGreaterThanOrEqual(5);
    expect(kb.every((a) => a.titleKey.startsWith('support.kb.'))).toBe(true);
    expect(kb[0]).not.toHaveProperty('balance');
  });
});

describe('SupportService Stage-2 operator queue', () => {
  it('listOperatorQueue ranks deposit_withdraw above other and skips closed', async () => {
    const svc = new SupportService();
    const closed = await svc.createTicket({
      userId: USER,
      category: 'deposit_withdraw',
      subject: 'Closed dep',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: closed.id, status: 'closed' });
    const other = await svc.createTicket({
      userId: USER,
      category: 'other',
      subject: 'Low',
      body: 'B',
    });
    const dep = await svc.createTicket({
      userId: USER,
      category: 'deposit_withdraw',
      subject: 'High',
      body: 'B',
    });

    const q = await svc.listOperatorQueue();
    expect(q.status).toBe('ok');
    if (q.status !== 'ok') return;
    expect(q.entries.map((e) => e.ticketId)).toEqual([dep.id, other.id]);
    expect(q.entries[0]!).not.toHaveProperty('balance');
    expect(q.entries[0]!).not.toHaveProperty('refundAmount');
  });

  it('peekNext and claimForOperator — exclusive claim, refuse steal', async () => {
    const svc = new SupportService();
    expect(await svc.peekNext()).toBeNull();

    const t = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Need help',
      body: 'Details',
    });
    const next = await svc.peekNext();
    expect(next?.ticketId).toBe(t.id);

    const claimed = await svc.claimForOperator({ operatorId: OP, ticketId: t.id });
    expect(claimed.assigneeId).toBe(OP);
    expect(claimed.status).toBe('pending');
    expect(claimed).not.toHaveProperty('balance');

    // idempotent same operator
    await expect(svc.claimForOperator({ operatorId: OP, ticketId: t.id })).resolves.toMatchObject({
      assigneeId: OP,
    });

    await expect(svc.claimForOperator({ operatorId: OTHER, ticketId: t.id })).rejects.toMatchObject({
      code: 'support.claim.already_claimed',
    });
  });

  it('claim refuses missing and non-queueable tickets', async () => {
    const svc = new SupportService();
    const t = await svc.createTicket({
      userId: USER,
      category: 'other',
      subject: 'Q',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: t.id, status: 'resolved' });
    await expect(svc.claimForOperator({ operatorId: OP, ticketId: t.id })).rejects.toMatchObject({
      code: 'support.claim.not_queueable',
    });
    await expect(svc.claimForOperator({ operatorId: OP, ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).rejects.toMatchObject({
      code: 'support.claim.not_found',
    });
  });
});
