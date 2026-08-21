import { describe, expect, it } from 'vitest';
import { createHttpNavigatorIdentitySessionPort, IDENTITY_NAVIGATOR_SESSION_PATH } from './identity-session-http-port.js';

describe('createHttpNavigatorIdentitySessionPort', () => {
  it('maps identity ok session body', async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toBe(`http://identity.test${IDENTITY_NAVIGATOR_SESSION_PATH}/sess-1`);
      return new Response(
        JSON.stringify({
          ok: true,
          session: { sessionId: 'sess-1', userId: 'user-1', status: 'open' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const port = createHttpNavigatorIdentitySessionPort({
      identityUrl: 'http://identity.test',
      internalSecret: 'a-navigator-identity-session-internal-secret-long-enough',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(port.read('sess-1')).resolves.toEqual({
      sessionId: 'sess-1',
      userId: 'user-1',
      status: 'open',
    });
  });

  it('returns null on refuse body', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ ok: false, reason: 'no_live_session_store' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });

    const port = createHttpNavigatorIdentitySessionPort({
      identityUrl: 'http://identity.test',
      internalSecret: 'a-navigator-identity-session-internal-secret-long-enough',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(port.read('sess-1')).resolves.toBeNull();
  });
});
