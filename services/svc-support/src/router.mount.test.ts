import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createSupportRouter } from './router.js';
import type { SupportService } from './support-service.js';

const SECRET = 'a-support-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';

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
    setStatus: vi.fn(),
    listKb: vi.fn(async () => [
      { id: 'kb-account-access', titleKey: 'support.kb.account_access.title', bodyKey: 'support.kb.account_access.body' },
    ]),
    listComments: vi.fn(() => []),
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
});
