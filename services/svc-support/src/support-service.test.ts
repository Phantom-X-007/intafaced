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
