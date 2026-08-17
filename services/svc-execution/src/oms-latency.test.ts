import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';
import { observeOmsLatency, type OmsLatencyFn } from './oms-latency.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-latency-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

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

function ungraded(over: Partial<VenueLatencyGrade> = {}): VenueLatencyGrade {
  return {
    venueId: 'street',
    measurement: 'rest-round-trip',
    grade: null,
    samples: 0,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: null,
    errorRateBps: null,
    staleMs: null,
    provisional: false,
    reasons: ['no observations in window'],
    ...over,
  };
}

class FakeLatency {
  calls = 0;
  constructor(private readonly next: VenueLatencyGrade | Error) {}
  fn: OmsLatencyFn = () => {
    this.calls += 1;
    if (this.next instanceof Error) throw this.next;
    return this.next;
  };
}

describe('observeOmsLatency', () => {
  it('returns the venue observation without rewriting a null grade as F', async () => {
    const street = new FakeLatency(ungraded());
    const result = await observeOmsLatency({
      venueId: 'street',
      latencyByVenue: { street: street.fn },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.latency.grade).toBeNull();
    expect(result.latency.samples).toBe(0);
    expect(result.latency.rejectRateBps).toBeNull();
    expect(street.calls).toBe(1);
  });

  it('refuses internal venues and does not observe', async () => {
    const book = new FakeLatency(ungraded({ grade: 'A', samples: 12 }));
    const result = await observeOmsLatency({
      venueId: 'book',
      kind: 'internal',
      latencyByVenue: { book: book.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'internal_venue' });
    expect(book.calls).toBe(0);
  });

  it('surfaces a thrown street as observe_failed, never an invented F', async () => {
    const street = new FakeLatency(new Error('latencyGrade is not wired on this market-data adapter'));
    const result = await observeOmsLatency({
      venueId: 'street',
      latencyByVenue: { street: street.fn },
    });
    expect(result).toMatchObject({ ok: false, reason: 'observe_failed' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('latency' in result).toBe(false);
  });

  it('missing injection is observe_failed', async () => {
    const result = await observeOmsLatency({ venueId: 'street' });
    expect(result).toMatchObject({
      ok: false,
      reason: 'observe_failed',
      detail: 'no latency-grade observation injected for venue street',
    });
  });
});

describe('execution.oms.latency tRPC', () => {
  it('refuses anonymous observe', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    const anon = edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
    await expect(router.createCaller(anon).execution.oms.latency({ venueId: 'street' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('observes through the injected map', async () => {
    const street = new FakeLatency(ungraded({ grade: 'B', samples: 40, p50Ms: 80, p95Ms: 120, rejectRateBps: 0, errorRateBps: 0 }));
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      { street: street.fn },
    ).createCaller(signed());
    const out = await caller.execution.oms.latency({ venueId: 'street' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.latency.grade).toBe('B');
    expect(street.calls).toBe(1);
  });
});
