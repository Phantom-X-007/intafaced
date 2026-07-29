import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import {
  createEdgeContext,
  encodePrincipal,
  signPrincipalHeader,
  verifyForwardedPrincipal,
  EdgeTrustError,
  EDGE_PRINCIPAL_HEADER,
  EDGE_SIGNATURE_HEADER,
} from './edge.js';

const SECRET = 'a'.repeat(32);
const OTHER_SECRET = 'b'.repeat(32);

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: '11111111-1111-4111-8111-111111111111',
    userId: '11111111-1111-4111-8111-111111111111',
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['trade:read'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function forward(p: Principal, secret = SECRET, region = 'XX'): { raw: string; sig: string } {
  const raw = encodePrincipal(p);
  return { raw, sig: signPrincipalHeader(raw, secret, region) };
}

describe('edge principal — the happy path', () => {
  it('accepts a correctly signed principal and preserves every claim', () => {
    const p = principal({ scopes: ['trade:read', 'trade:write'], tier: 'full', mfa: true });
    const { raw, sig } = forward(p);

    const { principal: got, rejected } = verifyForwardedPrincipal(raw, sig, SECRET);

    expect(rejected).toBeNull();
    expect(got).not.toBeNull();
    expect(got?.userId).toBe(p.userId);
    expect(got?.scopes).toEqual(['trade:read', 'trade:write']);
    expect(got?.tier).toBe('full');
    expect(got?.mfa).toBe(true);
    expect(got?.sid).toBe(p.sid);
    expect(got?.expiresAt.toISOString()).toBe(p.expiresAt.toISOString());
  });

  it('treats an absent header as anonymous rather than as a rejection', () => {
    expect(verifyForwardedPrincipal(undefined, undefined, SECRET)).toEqual({ principal: null, rejected: null });
  });
});

describe('edge principal — forgery', () => {
  it('refuses an unsigned principal', () => {
    const raw = encodePrincipal(principal({ scopes: ['admin:treasury'] }));

    expect(verifyForwardedPrincipal(raw, undefined, SECRET)).toEqual({
      principal: null,
      rejected: 'bad-signature',
    });
  });

  it('refuses a principal signed with the wrong secret', () => {
    const { raw, sig } = forward(principal(), OTHER_SECRET);

    expect(verifyForwardedPrincipal(raw, sig, SECRET).principal).toBeNull();
  });

  // The attack this whole module exists to stop: reach the port, claim to be
  // someone else with treasury scope and MFA already satisfied.
  it('refuses a self-escalated principal replayed under a captured signature', () => {
    const honest = principal({ scopes: ['trade:read'], mfa: false });
    const { sig } = forward(honest);

    const escalated = encodePrincipal(principal({ scopes: ['admin:treasury', 'trade:withdraw'], mfa: true, tier: 'institutional' }));

    const { principal: got, rejected } = verifyForwardedPrincipal(escalated, sig, SECRET);

    expect(got).toBeNull();
    expect(rejected).toBe('bad-signature');
  });

  it('refuses a single flipped byte in the payload', () => {
    const { raw, sig } = forward(principal());
    const tampered = raw.replace('"tier":"basic"', '"tier":"full"');

    expect(tampered).not.toBe(raw);
    expect(verifyForwardedPrincipal(tampered, sig, SECRET).principal).toBeNull();
  });

  it('refuses non-hex, empty, and truncated signatures without throwing', () => {
    const { raw, sig } = forward(principal());

    for (const bad of ['', 'zz', 'not-hex-at-all', sig.slice(0, -1), sig.slice(0, 32), `${sig}00`]) {
      expect(() => verifyForwardedPrincipal(raw, bad, SECRET)).not.toThrow();
      expect(verifyForwardedPrincipal(raw, bad, SECRET).principal).toBeNull();
    }
  });

  it('refuses a signature that is valid hex of the right length but wrong value', () => {
    const { raw, sig } = forward(principal());
    const wrong = sig[0] === '0' ? `1${sig.slice(1)}` : `0${sig.slice(1)}`;

    expect(wrong).toHaveLength(sig.length);
    expect(verifyForwardedPrincipal(raw, wrong, SECRET).principal).toBeNull();
  });

  it('refuses malformed JSON even when correctly signed', () => {
    const raw = '{"userId": broken';

    expect(verifyForwardedPrincipal(raw, signPrincipalHeader(raw, SECRET), SECRET)).toEqual({
      principal: null,
      rejected: 'malformed',
    });
  });

  it('refuses a correctly signed payload that is not a principal', () => {
    // The edge is trusted to be honest, not to be bug-free. A signed value of
    // the wrong shape must not reach a scope check half-formed.
    for (const value of ['{}', '[]', 'null', '"admin"', '{"userId":"not-a-uuid","scopes":[]}']) {
      const result = verifyForwardedPrincipal(value, signPrincipalHeader(value, SECRET), SECRET);
      expect(result.principal).toBeNull();
      expect(result.rejected).toBe('malformed');
    }
  });
});

describe('edge principal — expiry', () => {
  it('refuses a signed but expired principal', () => {
    const p = principal({ expiresAt: new Date(Date.now() - 1) });
    const { raw, sig } = forward(p);

    expect(verifyForwardedPrincipal(raw, sig, SECRET)).toEqual({ principal: null, rejected: 'expired' });
  });

  it('refuses at exactly the expiry instant, not one tick after', () => {
    const at = new Date('2026-07-27T12:00:00.000Z');
    const { raw, sig } = forward(principal({ expiresAt: at }));

    expect(verifyForwardedPrincipal(raw, sig, SECRET, at).rejected).toBe('expired');
    expect(verifyForwardedPrincipal(raw, sig, SECRET, new Date(at.getTime() - 1)).principal).not.toBeNull();
  });
});

describe('createEdgeContext', () => {
  it('refuses to build without a secret, at boot rather than per request', () => {
    expect(() => createEdgeContext({ secret: '', serviceName: 'svc-test' })).toThrow(EdgeTrustError);
    expect(() => createEdgeContext({ secret: 'short', serviceName: 'svc-test' })).toThrow(/at least 32/);
  });

  it('names the service in the failure so an operator knows which one will not start', () => {
    expect(() => createEdgeContext({ secret: '', serviceName: 'svc-ledger' })).toThrow(/svc-ledger/);
  });

  it('puts a verified principal on the context', () => {
    const ctx = createEdgeContext({ secret: SECRET, serviceName: 'svc-test' });
    const { raw, sig } = forward(principal(), SECRET, 'GB');

    const built = ctx({
      headers: { [EDGE_PRINCIPAL_HEADER]: raw, [EDGE_SIGNATURE_HEADER]: sig, 'x-intafaced-region': 'GB' },
      id: 'req-1',
    });

    expect(built.principal?.userId).toBe(principal().userId);
    expect(built.region).toBe('GB');
    expect(built.requestId).toBe('req-1');
  });

  it('L2-4: rejects when region header does not match the signed region', () => {
    const ctx = createEdgeContext({ secret: SECRET, serviceName: 'svc-test' });
    const { raw, sig } = forward(principal(), SECRET, 'GB');

    const built = ctx({
      headers: { [EDGE_PRINCIPAL_HEADER]: raw, [EDGE_SIGNATURE_HEADER]: sig, 'x-intafaced-region': 'US' },
      id: 'req-2',
    });

    expect(built.principal).toBeNull();
  });

  it('yields an anonymous context — not an error — when the principal is forged', () => {
    const ctx = createEdgeContext({ secret: SECRET, serviceName: 'svc-test' });
    const { raw } = forward(principal({ scopes: ['admin:treasury'] }), OTHER_SECRET);

    const built = ctx({ headers: { [EDGE_PRINCIPAL_HEADER]: raw, [EDGE_SIGNATURE_HEADER]: 'deadbeef' }, id: 1 });

    // Anonymous, so `protectedProcedure` throws UNAUTHORIZED at the procedure
    // rather than the transport 500-ing and telling an attacker they got close.
    expect(built.principal).toBeNull();
  });

  it('defaults region to XX so a missing header cannot silently widen jurisdiction', () => {
    const ctx = createEdgeContext({ secret: SECRET, serviceName: 'svc-test' });

    expect(ctx({ headers: {} }).region).toBe('XX');
  });

  it('takes the first value when a header is sent twice', () => {
    const ctx = createEdgeContext({ secret: SECRET, serviceName: 'svc-test' });
    const { raw, sig } = forward(principal());

    const built = ctx({ headers: { [EDGE_PRINCIPAL_HEADER]: [raw, 'x'], [EDGE_SIGNATURE_HEADER]: [sig, 'y'] } });

    expect(built.principal).not.toBeNull();
  });
});
