import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryFundraisingRegistry, RAISE_ECONOMICS_UNSET_CODE } from '@intafaced/launch-fundraising';
import { createBlueprintRouter } from './router.js';
import type { BlueprintService } from './blueprint-service.js';

/**
 * Reachability for Stage-1 fundraising mounted on svc-blueprint.
 * launch:read / launch:write stay withheld from ordinary sessions; tests
 * present them on a signed principal the way an issued key would.
 */

const SECRET = 'a-blueprint-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-blueprint' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['launch:read', 'launch:write'],
    tier: 'full',
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

function stubBlueprint() {
  return {
    get: async () => null,
  } as unknown as BlueprintService;
}

describe('svc-blueprint launch fundraising mount', () => {
  it('refuses createCampaign when cap/price are unset — no invented economics', async () => {
    const caller = createBlueprintRouter(stubBlueprint(), new MemoryFundraisingRegistry()).createCaller(signed());
    const result = await caller.launch.createCampaign({ name: 'Seed round' });
    expect(result).toEqual({
      ok: false,
      code: RAISE_ECONOMICS_UNSET_CODE,
      reason: 'unset',
    });
  });

  it('lists an empty investor book as committed 0, not a fake raise', async () => {
    const caller = createBlueprintRouter(stubBlueprint(), new MemoryFundraisingRegistry()).createCaller(signed());
    const created = await caller.launch.createCampaign({
      name: 'Seed round',
      cap: '500000',
      price: '0.50',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await caller.launch.addMilestone({ campaignId: created.campaign.id, title: 'Docs' });
    const list = await caller.launch.listInvestors({ campaignId: created.campaign.id });
    expect(list.investors).toEqual([]);
    expect(list.committedAmount).toBe('0');
    expect(list.committedFrom).toBe('investor_records');
    expect(list.committedAmount).not.toBe(created.campaign.cap);
  });
});
