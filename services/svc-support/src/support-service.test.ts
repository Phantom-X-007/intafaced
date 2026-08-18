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

  it('listMyTickets exact-matches optional status without leaking other users', async () => {
    const svc = new SupportService();
    const mineOpen = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Mine open',
      body: 'B',
    });
    const mineResolved = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Mine resolved',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: mineResolved.id, status: 'resolved' });
    await svc.createTicket({
      userId: OTHER,
      category: 'account',
      subject: 'Theirs open',
      body: 'B',
    });

    const omitted = await svc.listMyTickets({ userId: USER });
    expect(omitted.map((t) => t.id).sort()).toEqual([mineOpen.id, mineResolved.id].sort());

    const openOnly = await svc.listMyTickets({ userId: USER, status: 'open' });
    expect(openOnly).toHaveLength(1);
    expect(openOnly[0]!.id).toBe(mineOpen.id);

    const closedNone = await svc.listMyTickets({ userId: USER, status: 'closed' });
    expect(closedNone).toEqual([]);
  });

  it('listAllTickets exact-matches optional status across users', async () => {
    const svc = new SupportService();
    const a = await svc.createTicket({
      userId: USER,
      category: 'other',
      subject: 'A',
      body: 'B',
    });
    const b = await svc.createTicket({
      userId: OTHER,
      category: 'other',
      subject: 'B',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: b.id, status: 'resolved' });

    expect(await svc.listAllTickets()).toHaveLength(2);
    const resolved = await svc.listAllTickets({ status: 'resolved' });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe(b.id);
    expect(await svc.listAllTickets({ status: 'pending' })).toEqual([]);
    expect(a.status).toBe('open');
  });

  it('listMyTickets exact-matches optional category without leaking other users', async () => {
    const svc = new SupportService();
    const mineAccount = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Mine account',
      body: 'B',
    });
    const mineTrading = await svc.createTicket({
      userId: USER,
      category: 'trading',
      subject: 'Mine trading',
      body: 'B',
    });
    await svc.createTicket({
      userId: OTHER,
      category: 'account',
      subject: 'Theirs account',
      body: 'B',
    });

    const omitted = await svc.listMyTickets({ userId: USER });
    expect(omitted.map((t) => t.id).sort()).toEqual([mineAccount.id, mineTrading.id].sort());
    expect(new Set(omitted.map((t) => t.category))).toEqual(new Set(['account', 'trading']));

    const accountOnly = await svc.listMyTickets({ userId: USER, category: 'account' });
    expect(accountOnly).toHaveLength(1);
    expect(accountOnly[0]!.id).toBe(mineAccount.id);

    expect(await svc.listMyTickets({ userId: USER, category: 'other' })).toEqual([]);
  });

  it('listMyTickets ANDs category with parent status filter', async () => {
    const svc = new SupportService();
    const openAccount = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Open account',
      body: 'B',
    });
    const openTrading = await svc.createTicket({
      userId: USER,
      category: 'trading',
      subject: 'Open trading',
      body: 'B',
    });
    const resolvedAccount = await svc.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Resolved account',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: resolvedAccount.id, status: 'resolved' });

    const both = await svc.listMyTickets({ userId: USER, status: 'open', category: 'account' });
    expect(both).toHaveLength(1);
    expect(both[0]!.id).toBe(openAccount.id);
    expect(openTrading.status).toBe('open');
  });

  it('listAllTickets exact-matches optional category across users and ANDs with status', async () => {
    const svc = new SupportService();
    const a = await svc.createTicket({
      userId: USER,
      category: 'trading',
      subject: 'A',
      body: 'B',
    });
    const b = await svc.createTicket({
      userId: OTHER,
      category: 'deposit_withdraw',
      subject: 'B',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: b.id, status: 'resolved' });

    expect(await svc.listAllTickets()).toHaveLength(2);
    const omittedCats = new Set((await svc.listAllTickets()).map((t) => t.category));
    expect(omittedCats).toEqual(new Set(['trading', 'deposit_withdraw']));

    const trading = await svc.listAllTickets({ category: 'trading' });
    expect(trading).toHaveLength(1);
    expect(trading[0]!.id).toBe(a.id);

    expect(await svc.listAllTickets({ category: 'other' })).toEqual([]);
    expect(await svc.listAllTickets({ status: 'resolved', category: 'deposit_withdraw' })).toHaveLength(1);
    expect(await svc.listAllTickets({ status: 'open', category: 'deposit_withdraw' })).toEqual([]);
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
    expect(kb.every((a) => a.published === true && typeof a.revision === 'number' && a.revision >= 1)).toBe(true);
    expect(kb.every((a) => typeof a.version === 'number' && a.version >= 1)).toBe(true);
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
    expect(q.entries[0]!).toMatchObject({ timingKind: 'score_not_promise', sla: false });
    expect(q.entries[0]!).not.toHaveProperty('slaMinutes');
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

/**
 * "Somebody else's ticket" and "no such ticket" must be the SAME answer.
 *
 * Answering a foreign ticket with `not_found` rather than a forbidden is a
 * deliberate choice, and it only works if the two are indistinguishable. They
 * were not: the missing case interpolated the id and the foreign case did not,
 * and `mapError` puts i18n `userCopy(err.code)` on the wire — so a caller could ask about
 * any id and read its existence off whether the id came back.
 */
describe('a foreign ticket is indistinguishable from a missing one', () => {
  const MISSING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  async function ownedTicket() {
    const svc = new SupportService();
    const ticket = await svc.createTicket({ userId: USER, category: 'other', subject: 'Q', body: 'B' });
    return { svc, ticket };
  }

  it('refuses both with a byte-identical message and code', async () => {
    const { svc, ticket } = await ownedTicket();

    const foreign = await svc.getTicket({ userId: OTHER, ticketId: ticket.id }).catch((e: Error) => e);
    const missing = await svc.getTicket({ userId: OTHER, ticketId: MISSING }).catch((e: Error) => e);

    expect(foreign).toBeInstanceOf(Error);
    expect(missing).toBeInstanceOf(Error);
    // The whole property, in one line: nothing about the two refusals differs.
    expect((foreign as Error).message).toBe((missing as Error).message);
    expect(foreign).toMatchObject({ code: 'support.not_found' });
    expect(missing).toMatchObject({ code: 'support.not_found' });
  });

  it('never echoes the ticket id back — an echoed id is an id confirmed to exist', async () => {
    const { svc, ticket } = await ownedTicket();

    for (const id of [ticket.id, MISSING]) {
      const err = (await svc.getTicket({ userId: OTHER, ticketId: id }).catch((e: Error) => e)) as Error;
      expect(err.message).not.toContain(id);
    }

    // setStatus is operator-only but reads the same table and used to echo too.
    const status = (await svc.setStatus({ operatorId: OP, ticketId: MISSING, status: 'resolved' }).catch((e: Error) => e)) as Error;
    expect(status.message).not.toContain(MISSING);
  });

  it('holds on the paths that reach getTicket indirectly', async () => {
    const { svc, ticket } = await ownedTicket();

    // comment and listComments both route through getTicket, so they inherit
    // the check — asserted rather than assumed, because "it inherits it" is
    // exactly the sentence that stops being true after a refactor.
    for (const call of [
      () => svc.comment({ userId: OTHER, ticketId: ticket.id, body: 'x' }),
      () => svc.listComments({ userId: OTHER, ticketId: ticket.id }),
    ]) {
      const err = (await call().catch((e: Error) => e)) as Error;
      expect(err).toMatchObject({ code: 'support.not_found' });
      expect(err.message).not.toContain(ticket.id);
    }
  });
});

/**
 * The operator bypass, executed.
 *
 * `asOperator` is the flag that decides whether a caller may read another
 * user's ticket. Before this, no test invoked the router handlers that compute
 * it, and the service-level tests covered only the refusal — so the line that
 * grants the bypass, and the line that withholds it on the indirect paths, ran
 * in no test at all.
 */
describe('the operator bypass', () => {
  it('grants an operator every path a user is refused', async () => {
    const svc = new SupportService();
    const ticket = await svc.createTicket({ userId: USER, category: 'other', subject: 'Q', body: 'B' });

    await expect(svc.getTicket({ userId: OP, ticketId: ticket.id, asOperator: true })).resolves.toMatchObject({
      id: ticket.id,
    });
    await expect(svc.comment({ userId: OP, ticketId: ticket.id, body: 'looking into it', asOperator: true })).resolves.toMatchObject({
      authorRole: 'operator',
    });
    await expect(svc.listComments({ userId: OP, ticketId: ticket.id, asOperator: true })).resolves.toHaveLength(1);
  });

  it('does not turn a missing ticket into a readable one', async () => {
    const svc = new SupportService();
    // The bypass skips the OWNERSHIP check, not existence. An operator asking
    // for a ticket that is not there gets the same refusal as anyone else.
    const err = (await svc
      .getTicket({ userId: OP, ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asOperator: true })
      .catch((e: Error) => e)) as Error;
    expect(err).toMatchObject({ code: 'support.not_found' });
  });

  it('a falsy asOperator is not a bypass', async () => {
    const svc = new SupportService();
    const ticket = await svc.createTicket({ userId: USER, category: 'other', subject: 'Q', body: 'B' });

    for (const asOperator of [false, undefined]) {
      await expect(svc.getTicket({ userId: OTHER, ticketId: ticket.id, asOperator })).rejects.toMatchObject({
        code: 'support.not_found',
      });
    }
  });
});
