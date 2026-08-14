import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createSupportRouter } from './router.js';
import type { SupportService } from './support-service.js';

const SECRET = 'a-support-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const OP = '33333333-3333-4333-8333-333333333333';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-support' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['support:read', 'support:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function stubSupport(overrides: Partial<SupportService> = {}): SupportService {
  return {
    createTicket: vi.fn(async () => ({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: USER,
      category: 'other' as const,
      subject: 'S',
      body: 'B',
      status: 'open' as const,
      assigneeId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    listMyTickets: vi.fn(async () => []),
    listAllTickets: vi.fn(async () => []),
    getTicket: vi.fn(),
    comment: vi.fn(),
    listComments: vi.fn(async () => []),
    setStatus: vi.fn(),
    listKb: vi.fn(async () => [
      { id: 'kb-account-access', titleKey: 'support.kb.account_access.title', bodyKey: 'support.kb.account_access.body' },
    ]),
    searchKb: vi.fn(async () => [
      { id: 'kb-account-access', titleKey: 'support.kb.account_access.title', bodyKey: 'support.kb.account_access.body' },
    ]),
    getKbArticle: vi.fn(async (id: string) =>
      id === 'kb-account-access'
        ? { id: 'kb-account-access', titleKey: 'support.kb.account_access.title', bodyKey: 'support.kb.account_access.body' }
        : null,
    ),
    listOperatorQueue: vi.fn(async () => ({ status: 'empty' as const })),
    peekNext: vi.fn(async () => null),
    claimForOperator: vi.fn(),
    listTicketEvents: vi.fn(async () => []),
    readAccountState: vi.fn(async () => ({ status: 'unread' as const, reason: 'plane_dark' as const })),
    escalate: vi.fn(),
    getCaseFile: vi.fn(async () => null),
    ...overrides,
  } as unknown as SupportService;
}

const CITATION = {
  kind: 'kb_article' as const,
  ref: 'kb-account-access',
  digest: 'a'.repeat(64),
  readAt: '2026-08-09T10:00:00.000Z',
};

describe('svc-support mount', () => {
  it('refuses anonymous create', async () => {
    let created = false;
    const support = stubSupport({
      createTicket: async () => {
        created = true;
        throw new Error('should not run');
      },
    });
    await expect(
      createSupportRouter(support).createCaller(anonymous()).create({
        category: 'other',
        subject: 'S',
        body: 'B',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(created).toBe(false);
  });

  it('allows signed create with support:write', async () => {
    const support = stubSupport();
    const ticket = await createSupportRouter(support).createCaller(signed()).create({
      category: 'account',
      subject: 'Help',
      body: 'Please',
    });
    expect(ticket.subject).toBe('S');
    expect(support.createTicket).toHaveBeenCalled();
  });

  it('listKb is public and returns Stage-2 spine from service', async () => {
    const support = stubSupport();
    const kb = await createSupportRouter(support).createCaller(anonymous()).listKb();
    expect(kb).toHaveLength(1);
    expect(kb[0]!.titleKey).toMatch(/^support\.kb\./);
  });

  it('searchKb and getKb are public', async () => {
    const support = stubSupport();
    const caller = createSupportRouter(support).createCaller(anonymous());
    const found = await caller.searchKb({ q: 'account' });
    expect(found).toHaveLength(1);
    expect(support.searchKb).toHaveBeenCalledWith('account');
    const one = await caller.getKb({ id: 'kb-account-access' });
    expect(one?.id).toBe('kb-account-access');
    const missing = await caller.getKb({ id: 'nope' });
    expect(missing).toBeNull();
  });

  it('refuses listAll without support:ops', async () => {
    const support = stubSupport();
    await expect(createSupportRouter(support).createCaller(signed()).listAll()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(support.listAllTickets).not.toHaveBeenCalled();
  });

  it('allows listAll with support:ops', async () => {
    const support = stubSupport({
      listAllTickets: vi.fn(async () => [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          userId: USER,
          category: 'other' as const,
          subject: 'S',
          body: 'B',
          status: 'open' as const,
          assigneeId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    });
    const op = principal({ scopes: ['support:read', 'support:write', 'support:ops'] });
    const tickets = await createSupportRouter(support).createCaller(signed(op)).listAll();
    expect(tickets).toHaveLength(1);
    expect(support.listAllTickets).toHaveBeenCalled();
  });

  it('refuses setStatus without support:ops', async () => {
    const support = stubSupport({
      setStatus: vi.fn(async () => {
        throw new Error('should not run');
      }),
    });
    await expect(
      createSupportRouter(support)
        .createCaller(signed())
        .setStatus({ ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'resolved' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('listComments requires authentication', async () => {
    const support = stubSupport();
    await expect(
      createSupportRouter(support).createCaller(anonymous()).listComments({ ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(support.listComments).not.toHaveBeenCalled();
  });

  it('refuses listQueue / next / claim without support:ops', async () => {
    const support = stubSupport();
    const caller = createSupportRouter(support).createCaller(signed());
    await expect(caller.listQueue()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.next()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.claim({ ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(support.listOperatorQueue).not.toHaveBeenCalled();
    expect(support.peekNext).not.toHaveBeenCalled();
    expect(support.claimForOperator).not.toHaveBeenCalled();
  });

  it('allows listQueue / next / claim with support:ops', async () => {
    const ticketId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const createdAt = '2026-08-07T10:00:00.000Z';
    const support = stubSupport({
      listOperatorQueue: vi.fn(async () => ({
        status: 'ok' as const,
        entries: [
          {
            ticketId,
            userId: USER,
            category: 'deposit_withdraw',
            status: 'open' as const,
            subject: 'S',
            score: 70,
            ageMs: 0,
            createdAt,
            timingKind: 'score_not_promise' as const,
            sla: false as const,
          },
        ],
      })),
      peekNext: vi.fn(async () => ({
        ticketId,
        userId: USER,
        category: 'deposit_withdraw',
        status: 'open' as const,
        subject: 'S',
        score: 70,
        ageMs: 0,
        createdAt,
        timingKind: 'score_not_promise' as const,
        sla: false as const,
      })),
      claimForOperator: vi.fn(async () => ({
        id: ticketId,
        userId: USER,
        category: 'deposit_withdraw' as const,
        subject: 'S',
        body: 'B',
        status: 'pending' as const,
        assigneeId: OP,
        createdAt,
        updatedAt: createdAt,
      })),
    });
    const op = principal({
      userId: OP,
      sub: OP,
      scopes: ['support:read', 'support:write', 'support:ops'],
    });
    const caller = createSupportRouter(support).createCaller(signed(op));
    const q = await caller.listQueue();
    expect(q).toMatchObject({ status: 'ok' });
    expect(await caller.next()).toMatchObject({ ticketId });
    const claimed = await caller.claim({ ticketId });
    expect(claimed.assigneeId).toBe(OP);
    expect(support.claimForOperator).toHaveBeenCalledWith({ operatorId: OP, ticketId });
  });

  /* ----------------------------------------------------------------- *
   * Stage-4 — audit trail, grounding, case file
   *
   * These hit the ROUTE through the real edge context and the real scope
   * middleware. A test that constructed the router and called the service
   * directly would pass on a procedure nothing had mounted, which is how seven
   * guards in this repo were correct in isolation and unreachable in place.
   * ----------------------------------------------------------------- */

  const TICKET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('events requires authentication', async () => {
    const support = stubSupport();
    await expect(createSupportRouter(support).createCaller(anonymous()).events({ ticketId: TICKET })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(support.listTicketEvents).not.toHaveBeenCalled();
  });

  it('events is reachable for the ticket OWNER on support:read alone', async () => {
    // The owner seeing what happened to their own complaint is the point of
    // keeping the trail, so this must NOT be an ops-only route.
    const support = stubSupport({
      listTicketEvents: vi.fn(async () => [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ticketId: TICKET,
          sequence: 1,
          kind: 'opened' as const,
          actorId: USER,
          actorRole: 'user' as const,
          fromStatus: null,
          toStatus: null,
          note: null,
          occurredAt: '2026-08-09T10:00:00.000Z',
        },
      ]),
    });
    const trail = await createSupportRouter(support).createCaller(signed()).events({ ticketId: TICKET });
    expect(trail).toHaveLength(1);
    expect(support.listTicketEvents).toHaveBeenCalledWith({ userId: USER, ticketId: TICKET, asOperator: false });
  });

  it('an operator reading a trail is passed asOperator from the PRINCIPAL', async () => {
    const support = stubSupport();
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    await createSupportRouter(support).createCaller(signed(op)).events({ ticketId: TICKET });
    expect(support.listTicketEvents).toHaveBeenCalledWith({ userId: OP, ticketId: TICKET, asOperator: true });
  });

  it('refuses accountState / escalate / caseFile without support:ops', async () => {
    const support = stubSupport();
    const caller = createSupportRouter(support).createCaller(signed());
    await expect(caller.accountState({ ticketId: TICKET })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.escalate({ ticketId: TICKET, reason: 'other', summary: 'S' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.caseFile({ ticketId: TICKET })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(support.readAccountState).not.toHaveBeenCalled();
    expect(support.escalate).not.toHaveBeenCalled();
    expect(support.getCaseFile).not.toHaveBeenCalled();
  });

  it('accountState is reachable with support:ops and takes the operator from the principal', async () => {
    const support = stubSupport({
      readAccountState: vi.fn(async () => ({
        status: 'read' as const,
        state: { userId: USER, status: 'frozen' as const, kycTier: 'basic' as const },
        readAt: '2026-08-09T10:00:00.000Z',
      })),
    });
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    const grounding = await createSupportRouter(support).createCaller(signed(op)).accountState({ ticketId: TICKET });
    expect(grounding).toMatchObject({ status: 'read' });
    expect(support.readAccountState).toHaveBeenCalledWith({ operatorId: OP, ticketId: TICKET });
  });

  it('accountState takes NO userId — there is no platform-wide account lookup here', async () => {
    const support = stubSupport();
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    const caller = createSupportRouter(support).createCaller(signed(op));
    // The input schema is strict about this on purpose: `support:ops` plus a
    // free-text user id would be an authority no scope grants.
    await expect(caller.accountState({ ticketId: TICKET, userId: USER } as unknown as { ticketId: string })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(support.readAccountState).not.toHaveBeenCalled();
  });

  it('escalate is reachable and returns the case file it wrote', async () => {
    const support = stubSupport({
      escalate: vi.fn(async () => ({
        ticketId: TICKET,
        escalatedBy: OP,
        reason: 'money_request' as const,
        citations: [CITATION],
        grounding: { status: 'unread' as const, reason: 'plane_dark' as const },
        summary: 'User asks for a refund.',
        createdAt: '2026-08-09T10:00:00.000Z',
      })),
    });
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    const file = await createSupportRouter(support)
      .createCaller(signed(op))
      .escalate({ ticketId: TICKET, reason: 'money_request', summary: 'User asks for a refund.' });
    expect(file.citations).toHaveLength(1);
    expect(support.escalate).toHaveBeenCalledWith({
      operatorId: OP,
      ticketId: TICKET,
      reason: 'money_request',
      summary: 'User asks for a refund.',
    });
  });

  it('a case file with zero citations cannot pass the route contract', async () => {
    // The refusal is at the WIRE, so an ungrounded file cannot reach a client
    // even if a future service implementation stopped refusing it.
    const support = stubSupport({
      escalate: vi.fn(async () => ({
        ticketId: TICKET,
        escalatedBy: OP,
        reason: 'other' as const,
        citations: [],
        grounding: { status: 'unread' as const, reason: 'not_attempted' as const },
        summary: 'Escalating.',
        createdAt: '2026-08-09T10:00:00.000Z',
      })),
    });
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    await expect(
      createSupportRouter(support).createCaller(signed(op)).escalate({ ticketId: TICKET, reason: 'other', summary: 'Escalating.' }),
    ).rejects.toThrow();
  });

  it('caseFile returns null for a ticket never escalated — never a fabricated empty file', async () => {
    const support = stubSupport();
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    expect(await createSupportRouter(support).createCaller(signed(op)).caseFile({ ticketId: TICKET })).toBeNull();
  });

  it('setStatus carries an optional note through to the service', async () => {
    const support = stubSupport({
      setStatus: vi.fn(async () => ({
        id: TICKET,
        userId: USER,
        category: 'other' as const,
        subject: 'S',
        body: 'B',
        status: 'resolved' as const,
        assigneeId: OP,
        createdAt: '2026-08-09T10:00:00.000Z',
        updatedAt: '2026-08-09T10:00:00.000Z',
      })),
    });
    const op = principal({ userId: OP, sub: OP, scopes: ['support:read', 'support:write', 'support:ops'] });
    await createSupportRouter(support).createCaller(signed(op)).setStatus({ ticketId: TICKET, status: 'resolved', note: 'fixed upstream' });
    expect(support.setStatus).toHaveBeenCalledWith({
      operatorId: OP,
      ticketId: TICKET,
      status: 'resolved',
      note: 'fixed upstream',
    });
  });
});
