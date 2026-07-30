import { describe, expect, it, vi } from 'vitest';
import { AuthError, issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { createAdminApi, type LedgerOperatorCall } from './admin-api.js';
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

function api(ledger: LedgerOperatorCall | null = null) {
  const state = new KillSwitchState();
  return { state, admin: createAdminApi(state, { tokens, ledger }) };
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

/**
 * Halting one market and halting ALL value movement are different authorities,
 * and the whole point of separating them is that holding the smaller one must
 * not get you the larger.
 */
describe('the treasury authority is not the module authority', () => {
  it('refuses admin:write on the ledger freeze', async () => {
    const header = await tokenWith(['admin:write'], true);
    await expect(api().admin.authenticateTreasury(header)).rejects.toMatchObject({ code: 'scope.denied' });
  });

  it('accepts admin:treasury on the ledger freeze', async () => {
    const header = await tokenWith(['admin:treasury'], true);
    await expect(api().admin.authenticateTreasury(header)).resolves.toMatchObject({ userId: OPERATOR });
  });

  /**
   * `admin:treasury` is in `INTERACTIVE_ONLY_SCOPES`, so `requireScope` enforces
   * the second factor itself. Asserted here rather than assumed, because the
   * whole guard rests on that list still containing it.
   */
  it('refuses admin:treasury without a second factor', async () => {
    const header = await tokenWith(['admin:treasury'], false);
    await expect(api().admin.authenticateTreasury(header)).rejects.toMatchObject({ code: 'mfa.required' });
  });

  it('does not let admin:treasury alone halt a module — the reverse is also true', async () => {
    const header = await tokenWith(['admin:treasury'], true);
    await expect(api().admin.authenticate(header)).rejects.toMatchObject({ code: 'scope.denied' });
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

/**
 * §14.6 deliverable: who, when, what, and THE PRIOR STATE. The last one is what
 * turns a list of events into a timeline somebody can reconstruct.
 */
describe('the audit trail', () => {
  const operator = { userId: OPERATOR } as never;

  it('carries who, when, what, why and what it was before', () => {
    const { admin } = api();
    admin.apply({ module: 'trade', disabled: true, reason: 'book quoting stale prices' }, operator);

    const [entry] = admin.read().audit;
    expect(entry).toMatchObject({
      module: 'trade',
      actor: OPERATOR,
      reason: 'book quoting stale prices',
      previous: false,
      next: true,
      changed: true,
    });
    expect(Date.parse(entry!.at)).not.toBeNaN();
  });

  it('is newest-first, so the console opens on the last thing that happened', () => {
    const { admin } = api();
    admin.apply({ module: 'trade', disabled: true, reason: 'book quoting stale prices' }, operator);
    admin.apply({ module: 'pay', disabled: true, reason: 'rail partner outage, stop taking payments' }, operator);

    expect(admin.read().audit.map((e) => e.module)).toEqual(['pay', 'trade']);
  });

  /**
   * A re-halt of an already-halted module records `changed: false`. Without it,
   * an incident review cannot tell a second operator acting on stale
   * information from the first operator's action arriving twice.
   */
  it('records a no-op flip rather than dropping it', () => {
    const { admin } = api();
    admin.apply({ module: 'trade', disabled: true, reason: 'book quoting stale prices' }, operator);
    admin.apply({ module: 'trade', disabled: true, reason: 'confirming the halt from the desk' }, operator);

    const audit = admin.read().audit;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ previous: true, next: true, changed: false });
  });

  it('records the resume too — an incident ends as well as starts', () => {
    const { admin } = api();
    admin.apply({ module: 'trade', disabled: true, reason: 'book quoting stale prices' }, operator);
    admin.apply({ module: 'trade', disabled: false, reason: 'feed recovered, resuming the market' }, operator);

    expect(admin.read().audit[0]).toMatchObject({ previous: true, next: false, changed: true });
  });

  it('keeps the record even when the switch was never actually moved', () => {
    // A refused toggle must not be silently absent from the trail. This one is
    // rejected by the schema before `set`, so nothing is recorded AND nothing is
    // switched — the two stay consistent, which is the invariant that matters.
    const { admin } = api();
    expect(() => admin.apply({ module: 'trade', disabled: true, reason: 'no' }, operator)).toThrow();
    expect(admin.read().audit).toHaveLength(0);
    expect(admin.read().disabledModules).toEqual([]);
  });

  it('is bounded, because an authenticated endpoint feeding an unbounded array is a leak', () => {
    const { admin } = api();
    for (let i = 0; i < KillSwitchState.AUDIT_LIMIT + 20; i += 1) {
      admin.apply({ module: 'trade', disabled: i % 2 === 0, reason: `load test iteration number ${i}` }, operator);
    }
    expect(admin.read().audit).toHaveLength(KillSwitchState.AUDIT_LIMIT);
  });
});

describe('reaching the ledger freeze', () => {
  it('tells the console it is unreachable rather than reporting success', async () => {
    const res = await api(null).admin.setFreeze(true, { reason: 'reconciliation mismatch on BTC' }, 'Bearer x');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'edge.ledger_unreachable' });
  });

  it('forwards the operator OWN token, so svc-ledger writes the actor itself', async () => {
    const call = vi.fn<LedgerOperatorCall>().mockResolvedValue({ status: 200, body: { frozen: true } });
    await api(call).admin.setFreeze(true, { reason: 'reconciliation mismatch on BTC' }, 'Bearer operator-token');

    expect(call).toHaveBeenCalledWith('/operator/freeze', 'POST', 'Bearer operator-token', { reason: 'reconciliation mismatch on BTC' });
  });

  it('refuses an unexplained freeze before it leaves the edge', async () => {
    const call = vi.fn<LedgerOperatorCall>().mockResolvedValue({ status: 200, body: {} });
    await expect(api(call).admin.setFreeze(true, { reason: 'x' }, 'Bearer t')).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  /**
   * A thaw carries no reason — "why it is frozen" is meaningless once it is not,
   * and `writeFreeze` clears the column for that argument. So requiring one here
   * would be friction with nothing behind it.
   */
  it('needs no reason to thaw, and hits the other path', async () => {
    const call = vi.fn<LedgerOperatorCall>().mockResolvedValue({ status: 200, body: { frozen: false } });
    await api(call).admin.setFreeze(false, undefined, 'Bearer t');
    expect(call).toHaveBeenCalledWith('/operator/unfreeze', 'POST', 'Bearer t', undefined);
  });

  it('passes svc-ledger failures through instead of turning them into a success', async () => {
    const call = vi.fn<LedgerOperatorCall>().mockResolvedValue({ status: 502, body: { code: 'edge.ledger_unavailable' } });
    const res = await api(call).admin.setFreeze(true, { reason: 'reconciliation mismatch on BTC' }, 'Bearer t');
    expect(res.status).toBe(502);
  });
});
