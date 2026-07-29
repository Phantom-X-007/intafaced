import { describe, expect, it } from 'vitest';
import { AuthError, issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { createAdminApi } from './admin-api.js';
import { KillSwitchState } from './kill-switch.js';

const tokens: TokenConfig = {
  secret: 'test-only-signing-secret-at-least-32-characters-long',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';

async function tokenWith(scopes: string[], mfa: boolean): Promise<string> {
  const { token } = await issueAccessToken({ userId: OPERATOR, sessionId: SESSION, scopes, tier: 'institutional', mfa }, tokens);
  return `Bearer ${token}`;
}

function api() {
  const state = new KillSwitchState();
  return { state, admin: createAdminApi(state, tokens) };
}

describe('who may reach the control plane', () => {
  it('refuses a caller with no token', async () => {
    await expect(api().admin.authenticate(undefined)).rejects.toBeInstanceOf(AuthError);
  });

  /**
   * The property that matters most here: a NORMAL user session must not be able
   * to switch the exchange off. `defaultScopes()` in svc-identity issues exactly
   * this list, and no path anywhere adds `admin:write` to it.
   */
  it('refuses an ordinary user session, however valid', async () => {
    const header = await tokenWith(['identity:read', 'identity:write', 'trade:read', 'trade:write', 'ledger:read'], true);
    await expect(api().admin.authenticate(header)).rejects.toMatchObject({ code: 'scope.denied' });
  });

  it('refuses an operator who has not passed a second factor', async () => {
    const header = await tokenWith(['admin:write'], false);
    await expect(api().admin.authenticate(header)).rejects.toMatchObject({ code: 'mfa.required' });
  });

  it('accepts an operator with admin:write and 2FA', async () => {
    const header = await tokenWith(['admin:write'], true);
    await expect(api().admin.authenticate(header)).resolves.toMatchObject({ userId: OPERATOR });
  });

  it('refuses a token signed with another key', async () => {
    const { token } = await issueAccessToken(
      { userId: OPERATOR, sessionId: SESSION, scopes: ['admin:write'], mfa: true },
      { ...tokens, secret: 'a-completely-different-secret-that-is-long-enough' },
    );
    await expect(api().admin.authenticate(`Bearer ${token}`)).rejects.toBeInstanceOf(AuthError);
  });
});

describe('applying a toggle', () => {
  const operator = { userId: OPERATOR } as never;

  it('switches a module off and reports the new state', () => {
    const { state, admin } = api();
    const result = admin.apply({ module: 'trade', disabled: true, reason: 'stale prices on the book' }, operator);

    expect(result.disabledModules).toEqual(['trade']);
    expect(result.changed).toBe(true);
    expect(state.isKilled('trade')).toBe(true);
  });

  it('records who did it, because "somebody" is not an audit trail', () => {
    const { state, admin } = api();
    admin.apply({ module: 'trade', disabled: true, reason: 'stale prices on the book' }, operator);
    expect(state.reasonFor('trade')).toContain(OPERATOR);
  });

  it('refuses an unknown module rather than inventing one', () => {
    const { admin } = api();
    expect(() => admin.apply({ module: 'not-a-module', disabled: true, reason: 'a good enough reason' }, operator)).toThrow();
  });

  it('refuses a throwaway reason — friction is proportional to blast radius', () => {
    const { admin } = api();
    expect(() => admin.apply({ module: 'trade', disabled: true, reason: 'oops' }, operator)).toThrow();
  });

  it('is idempotent, and says so, so a double-click is not a second incident', () => {
    const { admin } = api();
    admin.apply({ module: 'trade', disabled: true, reason: 'stale prices on the book' }, operator);
    const again = admin.apply({ module: 'trade', disabled: true, reason: 'stale prices on the book' }, operator);
    expect(again.changed).toBe(false);
    expect(again.disabledModules).toEqual(['trade']);
  });
});
