import { describe, expect, it } from 'vitest';
import { readLiveNavigatorSession, type NavigatorIdentitySessionPort } from './identity-session-port.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const SESSION = {
  sessionId: 'sess-1',
  userId: USER,
  status: 'open' as const,
};

describe('readLiveNavigatorSession', () => {
  it('unset port is no_live_session — not a caller fixture', async () => {
    expect(await readLiveNavigatorSession(undefined, SESSION.sessionId, USER)).toEqual({
      ok: false,
      reason: 'no_live_session',
    });
  });

  it('blank session id is no_live_session', async () => {
    const port: NavigatorIdentitySessionPort = { read: async () => SESSION };
    expect(await readLiveNavigatorSession(port, '  ', USER)).toEqual({ ok: false, reason: 'no_live_session' });
  });

  it('null read is no_live_session', async () => {
    const port: NavigatorIdentitySessionPort = { read: async () => null };
    expect(await readLiveNavigatorSession(port, SESSION.sessionId, USER)).toEqual({
      ok: false,
      reason: 'no_live_session',
    });
  });

  it('throwing read is no_live_session', async () => {
    const port: NavigatorIdentitySessionPort = {
      read: async () => {
        throw new Error('identity down');
      },
    };
    expect(await readLiveNavigatorSession(port, SESSION.sessionId, USER)).toEqual({
      ok: false,
      reason: 'no_live_session',
    });
  });

  it('another user live row is no_live_session — never an invented open session', async () => {
    const port: NavigatorIdentitySessionPort = {
      read: async () => ({ ...SESSION, userId: OTHER }),
    };
    expect(await readLiveNavigatorSession(port, SESSION.sessionId, USER)).toEqual({
      ok: false,
      reason: 'no_live_session',
    });
  });

  it('returns the live session when the subject matches', async () => {
    const port: NavigatorIdentitySessionPort = { read: async () => SESSION };
    expect(await readLiveNavigatorSession(port, SESSION.sessionId, USER)).toEqual({
      ok: true,
      session: SESSION,
    });
  });
});
