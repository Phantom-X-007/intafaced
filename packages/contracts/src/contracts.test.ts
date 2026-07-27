import { describe, expect, it } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import { exampleIdentityRouter } from './example-router.js';
import type { Context } from './trpc.js';
import { BASE_PERKS, rankPerksSchema } from './identity.js';

const authConfig = {
  secret: 'a-test-signing-secret-that-is-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = '66666666-6666-4666-8666-666666666666';

async function ctx(scopes: string[], region = 'DE'): Promise<Context> {
  if (scopes.length === 0) return { principal: null, region, requestId: 'req-1' };
  const { token } = await issueAccessToken(
    { userId: USER, sessionId: '77777777-7777-4777-8777-777777777777', scopes, tier: 'basic' },
    authConfig,
  );
  return { principal: await verifyAccessToken(token, authConfig), region, requestId: 'req-1' };
}

describe('reference router — the zod-first pattern', () => {
  it('serves an open health check', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx([]));
    await expect(caller.health()).resolves.toEqual({ ok: true, service: 'svc-identity' });
  });

  it('rejects an anonymous call to a protected procedure', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx([]));
    await expect(caller.rank.get({ userId: USER })).rejects.toThrow(/Authentication required/);
  });

  it('rejects a principal without the scope', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx(['trade:read']));
    await expect(caller.rank.get({ userId: USER })).rejects.toThrow(/identity:read/);
  });

  it('serves a scoped principal', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx(['identity:read']));
    const rank = await caller.rank.get({ userId: USER });
    expect(rank.userId).toBe(USER);
    expect(rank.rank).toBe(0);
  });

  it('validates input at the boundary', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx(['identity:read']));
    await expect(caller.rank.get({ userId: 'not-a-uuid' })).rejects.toThrow();
  });

  it('returns a perk table that satisfies the published schema', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx(['identity:read']));
    const perks = await caller.rank.perks({ userId: USER });
    expect(rankPerksSchema.safeParse(perks).success).toBe(true);
    expect(perks).toEqual(BASE_PERKS);
  });

  it('applies the jurisdiction matrix to a guarded procedure', async () => {
    const caller = exampleIdentityRouter.createCaller(await ctx(['identity:read'], 'DE'));
    await expect(caller.me()).resolves.toMatchObject({ userId: USER, region: 'DE' });
  });
});
