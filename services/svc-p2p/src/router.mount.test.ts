import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createP2pRouter } from './router.js';
import type { P2pService } from './p2p-service.js';

/**
 * THE MOUNT BOUNDARY, for svc-p2p (docs/decisions/mount-boundary.md).
 *
 * Not a test of P2P behaviour — `p2p-service.test.ts` owns that. What this file
 * protects is the one property mounting `/trpc` depends on:
 *
 *   **reaching the port is not sufficient to become someone.**
 *
 * So it builds its context the way `index.ts` does — through `createEdgeContext`
 * over real request headers — rather than by handing the router a `Context`
 * object a test author wrote. A context literal would pass no matter how the
 * service derived its principal in production, which is precisely the bug the
 * decision exists to catch: it would still be green if `index.ts` went back to
 * `JSON.parse(req.headers['x-intafaced-principal'])`.
 *
 * `p2p` is `OPEN_BASIC` in the jurisdiction matrix, so `basic` is the tier floor
 * and neither `p2p:read` nor `p2p:write` is in `INTERACTIVE_ONLY_SCOPES`.
 */

const SECRET = 'a-p2p-mount-test-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-p2p' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['p2p:read'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

/** No credentials of any kind — a caller who simply found the port. */
const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

/** A principal the edge really vouched for. */
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

/**
 * The forgery. A principal asserted by the caller, with no signature — exactly
 * what a hand-rolled `JSON.parse` context would have believed.
 */
function forged(p: Principal = principal()) {
  return edgeContext({
    headers: { 'x-intafaced-principal': encodePrincipal(p), 'x-intafaced-region': 'DE' },
    id: 'req-forged',
  });
}

function stubP2p(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listOffers: async () => [],
    ...overrides,
  } as unknown as P2pService;
}

describe('svc-p2p mount — authorisation', () => {
  it('refuses an anonymous caller on a scoped procedure, and reads nothing', async () => {
    // Shaped like the ledger's: it does not assert on a message, it asserts the
    // service was never asked to do the work.
    let read = false;
    const p2p = stubP2p({
      listOffers: async () => {
        read = true;
        return [];
      },
    });

    await expect(createP2pRouter(p2p).createCaller(anonymous()).offers.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(read).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * A caller who writes their own principal header gets nothing. If this fails,
   * the mount is trusting caller-supplied claims and every scope check in the
   * service — including the ones guarding escrow release — is decorative.
   */
  it('refuses a self-asserted principal, however privileged it claims to be', async () => {
    const ctx = forged(principal({ scopes: ['p2p:read', 'p2p:write', 'admin:treasury'], tier: 'full', mfa: true }));
    expect(ctx.principal).toBeNull();

    await expect(createP2pRouter(stubP2p()).createCaller(ctx).offers.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a principal the edge signed', async () => {
    // Without this the UNAUTHORIZED assertions above would also pass on a
    // router that refuses everyone.
    await expect(createP2pRouter(stubP2p()).createCaller(signed()).offers.list({})).resolves.toEqual([]);
  });
});

/**
 * THE MODERATOR SURFACE.
 *
 * Two separate promises, both asserted here because they fail in opposite
 * directions: the queue must not be readable by a user session (it contains
 * other people's disputes), and the evidence a PARTY gets back must be their
 * own (it is filed by, and about, the person they are in dispute with).
 */
describe('svc-p2p mount — the moderator queue', () => {
  const SELLER = USER;
  const BUYER = '33333333-3333-4333-8333-333333333333';

  const dispute = {
    id: '44444444-4444-4444-8444-444444444444',
    tradeId: '55555555-5555-4555-8555-555555555555',
    openedBy: BUYER,
    reason: 'nothing arrived',
    evidence: [
      { seq: 1, submittedBy: BUYER, submittedAt: new Date('2026-08-04T00:00:00.000Z'), item: { ref: 'BUYER-RECEIPT' } },
      { seq: 2, submittedBy: SELLER, submittedAt: new Date('2026-08-04T01:00:00.000Z'), item: { ref: 'SELLER-STATEMENT' } },
    ],
    moderatorId: null,
    resolution: null,
    resolutionNotes: null,
    status: 'open' as const,
    deadlineAt: new Date('2026-08-01T00:00:00.000Z'),
    openedAt: new Date('2026-07-25T00:00:00.000Z'),
    resolvedAt: null,
    lastSeenByModeratorAt: null,
    moderatorViews: 0,
    escalatedAt: null,
    escalations: 0,
  };

  const trade = { id: dispute.tradeId, sellerId: SELLER, buyerId: BUYER };

  function disputesStub(seen: { asModerator: number } = { asModerator: 0 }) {
    return stubP2p({
      listDisputes: async () => {
        seen.asModerator++;
        return { disputes: [dispute], nextCursor: null };
      },
      getTrade: async () => trade,
      getDispute: async () => dispute,
      getDisputeAsModerator: async () => {
        seen.asModerator++;
        return dispute;
      },
    });
  }

  it('refuses the queue to a user session, however much p2p it holds', async () => {
    // `admin:compliance` is a scope no user session carries. That is the point
    // of putting the queue behind it — and the reason the scope has to become
    // holdable by a real moderator, which is an owner decision, not this
    // router's.
    const seen = { asModerator: 0 };
    const ctx = signed(principal({ scopes: ['p2p:read', 'p2p:write'] }));

    await expect(createP2pRouter(disputesStub(seen)).createCaller(ctx).disputes.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(seen.asModerator).toBe(0);
  });

  it('serves a moderator the queue, with the evidence in it', async () => {
    const ctx = signed(principal({ scopes: ['p2p:read', 'admin:compliance'] }));
    const page = await createP2pRouter(disputesStub()).createCaller(ctx).disputes.list({});

    expect(page.disputes).toHaveLength(1);
    // Evidence rides the QUEUE, not only `.get`. A triage list that cannot show
    // what is alleged costs a round trip per row, which is how a queue stops
    // being used at all.
    expect(page.disputes[0]!.evidence.map((e) => e.submittedBy)).toEqual([BUYER, SELLER]);
    expect(page.disputes[0]!.overdue).toBe(true);
  });

  it('gives a PARTY only the evidence they filed themselves', async () => {
    // Their counterparty's submissions are free-form text about them, filed by
    // someone they are in dispute with, with no redaction and no erase path.
    // Handing that back is a product decision with a legal shadow; it is not
    // made here by accident.
    const ctx = signed(principal({ scopes: ['p2p:read'] })); // SELLER
    const got = await createP2pRouter(disputesStub()).createCaller(ctx).disputes.get({ tradeId: dispute.tradeId });

    expect(got.evidence).toHaveLength(1);
    expect(got.evidence[0]!.submittedBy).toBe(SELLER);
  });

  it('gives a MODERATOR the whole evidence set, and records that they were served it', async () => {
    const seen = { asModerator: 0 };
    const ctx = signed(principal({ scopes: ['p2p:read', 'admin:compliance'] }));
    const got = await createP2pRouter(disputesStub(seen)).createCaller(ctx).disputes.get({ tradeId: dispute.tradeId });

    expect(got.evidence).toHaveLength(2);
    // The stamped read, not the plain one: "a human reached this dispute" is
    // only a fact if reaching it writes something down.
    expect(seen.asModerator).toBe(1);
  });

  it('tells a party what happens if nobody rules, at the moment they open the dispute', async () => {
    const p2p = stubP2p({
      openDispute: async () => dispute,
    });
    const ctx = signed(principal({ scopes: ['p2p:read', 'p2p:write'] }));
    const opened = await createP2pRouter(p2p).createCaller(ctx).disputes.open({ tradeId: dispute.tradeId, reason: 'x' });

    expect(opened.ifNobodyRules).toBe('escalated_and_held');
  });
});

describe('svc-p2p mount — the public surface', () => {
  it('serves health to an anonymous caller', async () => {
    await expect(createP2pRouter(stubP2p()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-p2p',
    });
  });

  it('serves health even when a forged principal was presented', async () => {
    // A rejected principal makes the caller anonymous, not rejected outright.
    await expect(createP2pRouter(stubP2p()).createCaller(forged()).health()).resolves.toMatchObject({ ok: true });
  });
});
