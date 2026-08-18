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
    const resolved = await store.setStatus({ ticketId: t.id, status: 'resolved', operatorId: OP_A });
    // Assert the setup actually happened. Without this line the old two-argument
    // call `setStatus(t.id, 'resolved')` silently became `input.ticketId ===
    // undefined`, the ticket stayed `open`, and the claim below succeeded — the
    // test failed loudly here, but a test whose SETUP can no-op is one revert
    // away from passing for the wrong reason.
    expect(resolved.status).toBe('ok');
    const r = await store.claimTicket({ ticketId: t.id, operatorId: OP_A });
    expect(r).toEqual({ status: 'refuse', reason: 'not_queueable' });
  });

  it('listByUser and listAll exact-match status in memory', async () => {
    const store = new MemorySupportStore();
    const OTHER = '22222222-2222-4222-8222-222222222222';
    const mine = await store.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Mine',
      body: 'Body',
    });
    const theirs = await store.createTicket({
      userId: OTHER,
      category: 'account',
      subject: 'Theirs',
      body: 'Body',
    });
    const moved = await store.setStatus({ ticketId: mine.id, status: 'resolved', operatorId: OP_A });
    expect(moved.status).toBe('ok');

    expect(await store.listByUser(USER, { status: 'resolved' })).toHaveLength(1);
    expect(await store.listByUser(USER, { status: 'open' })).toEqual([]);
    const otherOpen = await store.listByUser(OTHER, { status: 'open' });
    expect(otherOpen).toHaveLength(1);
    expect(otherOpen[0]!.id).toBe(theirs.id);
    expect((await store.listAll({ status: 'open' })).map((t) => t.id)).toEqual([theirs.id]);
    expect(await store.listAll({ status: 'pending' })).toEqual([]);
  });

  it('listByUser and listAll exact-match category in memory', async () => {
    const store = new MemorySupportStore();
    const OTHER = '22222222-2222-4222-8222-222222222222';
    const mineAccount = await store.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Mine account',
      body: 'Body',
    });
    const mineTrading = await store.createTicket({
      userId: USER,
      category: 'trading',
      subject: 'Mine trading',
      body: 'Body',
    });
    const theirsAccount = await store.createTicket({
      userId: OTHER,
      category: 'account',
      subject: 'Theirs account',
      body: 'Body',
    });
    const moved = await store.setStatus({ ticketId: mineAccount.id, status: 'resolved', operatorId: OP_A });
    expect(moved.status).toBe('ok');

    const omitted = await store.listByUser(USER);
    expect(omitted.map((t) => t.id).sort()).toEqual([mineAccount.id, mineTrading.id].sort());
    expect(new Set(omitted.map((t) => t.category))).toEqual(new Set(['account', 'trading']));

    expect((await store.listByUser(USER, { category: 'account' })).map((t) => t.id)).toEqual([mineAccount.id]);
    expect(await store.listByUser(USER, { category: 'other' })).toEqual([]);
    expect((await store.listByUser(OTHER, { category: 'account' })).map((t) => t.id)).toEqual([theirsAccount.id]);

    expect((await store.listAll({ category: 'account' })).map((t) => t.id).sort()).toEqual([mineAccount.id, theirsAccount.id].sort());
    expect(await store.listAll({ category: 'deposit_withdraw' })).toEqual([]);
    expect((await store.listAll({ status: 'resolved', category: 'account' })).map((t) => t.id)).toEqual([mineAccount.id]);
    expect(await store.listAll({ status: 'open', category: 'account' })).toHaveLength(1);
    expect((await store.listAll({ status: 'open', category: 'account' }))[0]!.id).toBe(theirsAccount.id);
  });
});
