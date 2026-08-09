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
    ...overrides,
  } as unknown as SupportService;
}

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
});
