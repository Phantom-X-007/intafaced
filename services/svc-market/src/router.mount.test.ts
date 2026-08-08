import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createMarketRouter } from './router.js';
import type { VendorService } from './vendor-service.js';

/**
 * REACHABILITY, NOT SHAPE.
 *
 * These tests never construct a `Context` literal. They sign a real principal
 * header the way svc-edge does and go in through `createEdgeContext`, because a
 * hand-built context proves the resolver's types and nothing about whether an
 * unsigned or absent header would have been accepted.
 *
 * Every refusal asserts TWO things: the code the caller receives, and that the
 * service was never called. A guard that throws after the work has happened is
 * not a guard.
 */

const SECRET = 'a-market-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const OP = '33333333-3333-4333-8333-333333333333';
const VENDOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-market' });

/**
 * `tier: 'basic'` by default because `market` is OPEN_BASIC in
 * DEFAULT_MODULE_RULES. The tier-`none` case is a test of its own below.
 */
function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['market:read', 'market:write'],
    tier: 'basic',
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

const vendorRow = {
  id: VENDOR,
  userId: USER,
  displayName: 'Acme',
  description: 'I sell things',
  status: 'applied' as const,
  createdAt: '2026-08-08T10:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z',
};

function stubVendors(overrides: Partial<VendorService> = {}): VendorService {
  return {
    applyAsVendor: vi.fn(async () => vendorRow),
    myVendor: vi.fn(async () => null),
    listApplications: vi.fn(async () => []),
    vet: vi.fn(async () => ({ changed: true, vendor: { ...vendorRow, status: 'approved' as const }, event: null })),
    history: vi.fn(async () => []),
    ...overrides,
  } as unknown as VendorService;
}

describe('svc-market mount — who may apply', () => {
  it('refuses an anonymous application', async () => {
    const vendors = stubVendors();
    await expect(
      createMarketRouter(vendors).createCaller(anonymous()).applyAsVendor({ displayName: 'Acme', description: 'I sell things' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(vendors.applyAsVendor).not.toHaveBeenCalled();
  });

  it('accepts a signed application with market:write', async () => {
    const vendors = stubVendors();
    const vendor = await createMarketRouter(vendors)
      .createCaller(signed())
      .applyAsVendor({ displayName: 'Acme', description: 'I sell things' });
    expect(vendor.status).toBe('applied');
    // The applicant is the PRINCIPAL, never a field in the body.
    expect(vendors.applyAsVendor).toHaveBeenCalledWith({ userId: USER, displayName: 'Acme', description: 'I sell things' });
  });

  it('refuses an application from a caller holding only market:read', async () => {
    const vendors = stubVendors();
    const reader = principal({ scopes: ['market:read'] });
    await expect(
      createMarketRouter(vendors).createCaller(signed(reader)).applyAsVendor({ displayName: 'Acme', description: 'I sell things' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(vendors.applyAsVendor).not.toHaveBeenCalled();
  });

  /**
   * The jurisdiction guard is LIVE, not decorative. `market` is OPEN_BASIC, so an
   * unverified account is refused with the matrix's own code — which is what lets
   * a screen say "verify to tier basic" instead of "refused".
   */
  it('refuses an unverified applicant with the matrix code, not a scope error', async () => {
    const vendors = stubVendors();
    const unverified = principal({ tier: 'none' });
    await expect(
      createMarketRouter(vendors).createCaller(signed(unverified)).applyAsVendor({ displayName: 'Acme', description: 'I sell things' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', cause: { code: 'denied.kyc_required', requiredTier: 'basic' } });
    expect(vendors.applyAsVendor).not.toHaveBeenCalled();
  });

  it('reads the caller own application back, and null is an answer', async () => {
    const vendors = stubVendors();
    await expect(createMarketRouter(vendors).createCaller(signed()).mine()).resolves.toBeNull();
    expect(vendors.myVendor).toHaveBeenCalledWith(USER);
  });
});

describe('svc-market mount — who may vet', () => {
  it('refuses vet, listApplications and history to an ordinary user', async () => {
    const vendors = stubVendors();
    const caller = createMarketRouter(vendors).createCaller(signed());
    await expect(caller.vet({ vendorId: VENDOR, decision: 'approved', reason: 'fine' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.listApplications()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.history({ vendorId: VENDOR })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(vendors.vet).not.toHaveBeenCalled();
    expect(vendors.listApplications).not.toHaveBeenCalled();
    expect(vendors.history).not.toHaveBeenCalled();
  });

  it('refuses an applicant vetting their own application', async () => {
    const vendors = stubVendors();
    const selfVetter = principal({ scopes: ['market:read', 'market:write'] });
    await expect(
      createMarketRouter(vendors).createCaller(signed(selfVetter)).vet({ vendorId: VENDOR, decision: 'approved', reason: 'me' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(vendors.vet).not.toHaveBeenCalled();
  });

  it('lets an operator vet, and records the operator rather than the body', async () => {
    const vendors = stubVendors();
    const operator = principal({ userId: OP, sub: OP, scopes: ['market:ops'], tier: 'none' });
    const result = await createMarketRouter(vendors)
      .createCaller(signed(operator))
      .vet({ vendorId: VENDOR, decision: 'approved', reason: 'documents check out' });
    expect(result.vendor.status).toBe('approved');
    expect(vendors.vet).toHaveBeenCalledWith({
      vendorId: VENDOR,
      decision: 'approved',
      reason: 'documents check out',
      actorId: OP,
      actorScope: 'market:ops',
    });
  });

  /**
   * An operator's authority comes from `market:ops`, not from their own
   * verification tier — a desk operator at tier `none` must still be able to work
   * the queue. This is why the operator procedures carry no `{ module }` guard.
   */
  it('does not gate the operator queue on the operator own verification tier', async () => {
    const vendors = stubVendors();
    const operator = principal({ userId: OP, sub: OP, scopes: ['market:ops'], tier: 'none' });
    await expect(createMarketRouter(vendors).createCaller(signed(operator)).listApplications()).resolves.toEqual([]);
    // Defaults to the undecided queue rather than every vendor ever.
    expect(vendors.listApplications).toHaveBeenCalledWith({ status: 'applied', limit: undefined });
  });

  it('refuses a vetting decision with a blank reason at the boundary', async () => {
    const vendors = stubVendors();
    const operator = principal({ userId: OP, sub: OP, scopes: ['market:ops'] });
    await expect(
      createMarketRouter(vendors).createCaller(signed(operator)).vet({ vendorId: VENDOR, decision: 'rejected', reason: '' }),
    ).rejects.toThrow();
    expect(vendors.vet).not.toHaveBeenCalled();
  });
});
