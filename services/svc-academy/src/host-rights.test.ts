import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_PERKS, type RankPerks } from '@intafaced/contracts';
import { AcademyError } from './errors.js';
import { BaseHostRights, createHostRightsSource, mayHost } from './host-rights.js';

/**
 * WHO MAY OPEN A LOBBY (§4.1 `rank_thresholds.perks.lobbyHostRights`).
 *
 * Two properties, and the second is the one that would actually hurt:
 *
 *   1. the perk decides, not the scope — `academy:write` is on every session;
 *   2. an unreadable perk table refuses. If svc-identity being unreachable
 *      admitted the caller instead, room creation would be open to the entire
 *      platform for the length of an outage — which is precisely the window in
 *      which nobody is looking at the room list.
 */

const perks = (overrides: Partial<RankPerks> = {}): RankPerks => ({ ...BASE_PERKS, ...overrides });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mayHost — the decision', () => {
  it('refuses rank 0, which is what BASE_PERKS is', () => {
    expect(BASE_PERKS.lobbyHostRights).toBe(false);
    expect(mayHost(BASE_PERKS)).toBe(false);
  });

  it('admits a rank carrying the perk', () => {
    expect(mayHost(perks({ lobbyHostRights: true }))).toBe(true);
  });

  it('ignores every other perk — a fee discount does not buy a stage', () => {
    expect(mayHost(perks({ feeDiscountBps: 9999, copyFollowerCap: 10_000, cardTier: 'standard' }))).toBe(false);
  });
});

describe('BaseHostRights — the dev/test fallback refuses', () => {
  it('hands back rank 0, so reaching for it by accident closes hosting rather than opening it', async () => {
    expect(mayHost(await new BaseHostRights().perksOf())).toBe(false);
  });
});

describe('createHostRightsSource — fails closed on every unreadable answer', () => {
  const SECRET = 'an-academy-host-rights-test-secret';

  it('sends service credentials — svc-identity 401s without them', async () => {
    let seen: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init.headers as Record<string, string>;
        return new Response(JSON.stringify(perks({ lobbyHostRights: true })), { status: 200 });
      }),
    );

    await createHostRightsSource('http://svc-identity:4002', SECRET).perksOf('u-1');

    // The exact header names belong to packages/contracts; what matters here is
    // that SOMETHING was signed. svc-identity's /internal route rejects an
    // unsigned caller outright, so an empty header set is a silent 401 loop.
    expect(Object.keys(seen).some((k) => k.toLowerCase().includes('service'))).toBe(true);
  });

  it('reads the perk when svc-identity answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(perks({ lobbyHostRights: true })), { status: 200 })),
    );

    const result = await createHostRightsSource('http://svc-identity:4002', SECRET).perksOf('u-1');
    expect(mayHost(result)).toBe(true);
  });

  it('refuses when the transport fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    await expect(createHostRightsSource('http://svc-identity:4002', SECRET).perksOf('u-1')).rejects.toMatchObject({
      code: 'academy.host_rights_unavailable',
    });
  });

  it('refuses on a non-2xx, including the 401 an unsigned caller would get', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"service credentials required"}', { status: 401 })),
    );

    await expect(createHostRightsSource('http://svc-identity:4002', SECRET).perksOf('u-1')).rejects.toBeInstanceOf(AcademyError);
  });

  it('refuses a payload that does not match the published perk contract', async () => {
    // A perk table we cannot parse is a perk table we must not guess at — and
    // guessing here means guessing `lobbyHostRights`.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ lobbyHostRights: 'yes' }), { status: 200 })),
    );

    await expect(createHostRightsSource('http://svc-identity:4002', SECRET).perksOf('u-1')).rejects.toMatchObject({
      code: 'academy.host_rights_unavailable',
    });
  });

  it('refuses a body that is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 200 })),
    );

    await expect(createHostRightsSource('http://svc-identity:4002', SECRET).perksOf('u-1')).rejects.toMatchObject({
      code: 'academy.host_rights_unavailable',
    });
  });
});
