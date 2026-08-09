import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_HEADER, SERVICE_SIGNATURE_HEADER } from '@intafaced/contracts';
import { DarkAccountState, createAccountStateClient, type AccountStateSource } from './account-state.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'an-internal-service-secret-long-enough';

function stubFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (url: unknown, init: unknown) => impl(String(url), (init ?? {}) as RequestInit));
  vi.stubGlobal('fetch', spy);
  return spy;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account state read port', () => {
  it('a dark source never invents an active account', async () => {
    // Through the interface, not the class: what matters is that a consumer
    // holding an `AccountStateSource` gets null, whichever implementation it is.
    // 'active' is both the common case and the answer that makes a frozen
    // account look usable, which is why the null source must not guess it.
    const dark: AccountStateSource = new DarkAccountState();
    expect(await dark.stateOf(USER)).toBeNull();
  });

  it('reads the published projection over S2S credentials', async () => {
    const spy = stubFetch(() => json({ userId: USER, status: 'frozen', kycTier: 'basic' }));
    const client = createAccountStateClient('http://identity:4002/', SECRET);

    expect(await client.stateOf(USER)).toEqual({ userId: USER, status: 'frozen', kycTier: 'basic' });

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe(`http://identity:4002/internal/account/${USER}`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    // Unauthenticated would 401 at identity; asserting the headers here is what
    // caught the rank-perks defect where a client was never given credentials
    // and every call failed closed on the running fleet.
    expect(headers[SERVICE_HEADER]).toBe('svc-support');
    expect(headers[SERVICE_SIGNATURE_HEADER]).toBeTruthy();
  });

  it('fails closed to null — never to a fabricated state', async () => {
    const cases: Array<[string, () => Response | Promise<Response>]> = [
      ['401 unauthenticated', () => json({ error: 'service credentials required' }, 401)],
      ['404 unknown user', () => json({ error: 'account not found' }, 404)],
      ['500 upstream', () => json({ error: 'boom' }, 500)],
      ['transport error', () => Promise.reject(new Error('ECONNREFUSED'))],
      ['unparseable body', () => new Response('not json', { status: 200 })],
      ['shape off contract', () => json({ userId: USER, status: 'vibes', kycTier: 'basic' })],
      ['balance smuggled in but status missing', () => json({ userId: USER, balance: '100.00' })],
    ];

    for (const [name, impl] of cases) {
      stubFetch(impl);
      const client = createAccountStateClient('http://identity:4002', SECRET);
      expect(await client.stateOf(USER), name).toBeNull();
      vi.unstubAllGlobals();
    }
  });

  it('a user id is url-encoded into the path, not concatenated', async () => {
    const spy = stubFetch(() => json({ userId: USER, status: 'active', kycTier: 'none' }));
    await createAccountStateClient('http://identity:4002', SECRET).stateOf('../rank/x y');
    expect(String(spy.mock.calls[0]![0])).toBe('http://identity:4002/internal/account/..%2Frank%2Fx%20y');
  });

  it('a body whose userId is not the one we asked about is unread, not swapped', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999';
    // Valid shape, wrong account — the exact swap a misrouted identity plane
    // or a hostile peer could return. Accepting it would ground the ticket on
    // somebody else's freeze state.
    stubFetch(() => json({ userId: OTHER, status: 'active', kycTier: 'none' }));
    const client = createAccountStateClient('http://identity:4002', SECRET);
    expect(await client.stateOf(USER)).toBeNull();
  });
});
