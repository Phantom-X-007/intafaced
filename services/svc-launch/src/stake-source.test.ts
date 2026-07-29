import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { createStakeSource, FixedStake } from './stake-source.js';
import { LaunchError } from './errors.js';

/** Service-to-service signing refuses anything shorter than 32 characters (§2). */
const SECRET = 'test-internal-service-secret-32-chars-min';

/**
 * THE STAKE GATE (§8.4 "allocation tiers by `token.stakeOf`").
 *
 * Two things are asserted here and both have already been wrong once:
 *
 *   1. The WIRE FORMAT. svc-token's `/internal/stake/:userId` returned
 *      `staked.toString()` of a SCALED bigint, and this client reads it back
 *      with `parseAmount`, which scales again. A 4000 IFC stake arrived as
 *      4e39 instead of 4e21, so every tier gate admitted every caller who had
 *      staked anything at all. The gate was decorative and nothing said so.
 *
 *   2. FAILING CLOSED. An unreadable stake refuses the commitment. Admitting at
 *      the lowest gate instead sells a staked allocation to someone who does
 *      not hold the stake, and unwinding that means asking people to hand
 *      tokens back after a raise has settled.
 */

const stakeResponse = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createStakeSource — wire format', () => {
  it('reads a decimal string at the scale the ledger uses', async () => {
    vi.stubGlobal('fetch', stakeResponse({ staked: '4000' }));
    const staked = await createStakeSource('http://token', SECRET).stakeOf('user-1');

    expect(staked).toBe(amt('4000'));
    expect(formatAmount(staked)).toBe('4000');
  });

  /**
   * The regression. A raw scaled integer on the wire is 10^18 times too large
   * once `parseAmount` has scaled it again — which is precisely how a gate that
   * looks strict admits everybody.
   */
  it('does not silently accept a stake at 10^18 times its real size', async () => {
    vi.stubGlobal('fetch', stakeResponse({ staked: '4000' }));
    const honest = await createStakeSource('http://token', SECRET).stakeOf('user-1');

    // What the bug produced, for comparison: the raw scale parsed a second time.
    const doubleScaled = amt('4000000000000000000000');
    expect(honest).not.toBe(doubleScaled);
    expect(honest < doubleScaled).toBe(true);

    // A 1000 IFC tier must refuse a 1 IFC staker. Under the bug it admitted them.
    vi.stubGlobal('fetch', stakeResponse({ staked: '1' }));
    const small = await createStakeSource('http://token', SECRET).stakeOf('user-2');
    expect(small < amt('1000')).toBe(true);
  });

  it('carries fractional stakes without losing precision', async () => {
    vi.stubGlobal('fetch', stakeResponse({ staked: '1234.567890123456789' }));
    const staked = await createStakeSource('http://token', SECRET).stakeOf('user-1');
    expect(formatAmount(staked)).toBe('1234.567890123456789');
  });

  it('reads a zero stake as zero rather than as unavailable', async () => {
    vi.stubGlobal('fetch', stakeResponse({ staked: '0' }));
    expect(await createStakeSource('http://token', SECRET).stakeOf('user-1')).toBe(0n);
  });
});

describe('createStakeSource — fails closed', () => {
  const expectRefusal = async (fetchImpl: unknown) => {
    vi.stubGlobal('fetch', fetchImpl);
    const source = createStakeSource('http://token', SECRET);
    await expect(source.stakeOf('user-1')).rejects.toThrow(LaunchError);
    await expect(source.stakeOf('user-1')).rejects.toMatchObject({ code: 'launch.stake_unavailable' });
  };

  it('refuses when the stake gate is unreachable', async () => {
    await expectRefusal(
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
  });

  it('refuses on a non-200 from the stake gate', async () => {
    await expectRefusal(stakeResponse({ error: 'nope' }, 503));
  });

  it('refuses an unauthenticated read rather than treating it as no stake', async () => {
    await expectRefusal(stakeResponse({ error: 'service credentials required' }, 401));
  });

  it('refuses a payload with no stake in it', async () => {
    await expectRefusal(stakeResponse({ tier: 'Base' }));
  });

  /** A number is not a decimal string. Guessing at its scale is how bug 1 happened. */
  it('refuses a numeric stake rather than coercing it', async () => {
    await expectRefusal(stakeResponse({ staked: 4000 }));
  });

  it('refuses an unparseable amount', async () => {
    await expectRefusal(stakeResponse({ staked: 'quite a lot' }));
  });

  it('refuses a body that is not JSON at all', async () => {
    await expectRefusal(vi.fn(async () => new Response('<html>502</html>', { status: 200 })));
  });
});

describe('createStakeSource — request shape', () => {
  it('sends service credentials and encodes the user id', async () => {
    const fetchMock = stakeResponse({ staked: '10' });
    vi.stubGlobal('fetch', fetchMock);

    await createStakeSource('http://token/', SECRET).stakeOf('user/one');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Trailing slash trimmed, and the id encoded so it cannot escape the path.
    expect(url).toBe('http://token/internal/stake/user%2Fone');
    expect(init.method).toBe('GET');
    expect(Object.keys(init.headers as Record<string, string>).length).toBeGreaterThan(1);
  });
});

describe('FixedStake', () => {
  /** Explicit construction only — never something a catch block can fall into. */
  it('returns the stake it was built with', async () => {
    expect(await new FixedStake(amt('500')).stakeOf()).toBe(amt('500'));
  });
});
