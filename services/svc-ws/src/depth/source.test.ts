import { describe, expect, it } from 'vitest';
import { DepthSourceError, HttpDepthSource } from './source.js';

/**
 * The wire between two of our own services is still a wire.
 *
 * Everything here is about refusing a response rather than coercing one. A
 * depth response with a JSON number in it would become a float the moment it
 * was parsed, and a float in an order book is wrong in a way that shows up
 * eighteen decimal places later — long after anyone would look here.
 */

function respondWith(body: unknown, status = 200): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch;
}

const source = (fetchImpl: typeof globalThis.fetch) => new HttpDepthSource({ baseUrl: 'http://matching.test/', fetch: fetchImpl });

describe('HttpDepthSource', () => {
  it('reads a depth response into a DepthSnapshot', async () => {
    const s = source(respondWith({ marketId: 'BTC-USDT', bids: [['100.5', '2']], asks: [['101', '1.5']], sequence: 42 }));

    await expect(s.snapshot('BTC-USDT', 50)).resolves.toEqual({
      type: 'snapshot',
      marketId: 'BTC-USDT',
      sequence: 42,
      bids: [['100.5', '2']],
      asks: [['101', '1.5']],
    });
  });

  it('refuses a level carrying a JSON number instead of a decimal string', async () => {
    const s = source(respondWith({ bids: [[100.5, 2]], asks: [], sequence: 1 }));
    await expect(s.snapshot('BTC-USDT', 50)).rejects.toThrow(/decimal strings/);
  });

  it('refuses a response with no integer sequence', async () => {
    // Without the engine's sequence there is no safe delta stream at all, and
    // inventing one would produce a book that drifts silently.
    const s = source(respondWith({ bids: [], asks: [] }));
    await expect(s.snapshot('BTC-USDT', 50)).rejects.toThrow(/integer sequence/);
  });

  it('carries the upstream status on a failure so a caller can tell 404 from 500', async () => {
    const s = source(respondWith({ error: 'nope' }, 503));
    await expect(s.snapshot('BTC-USDT', 50)).rejects.toMatchObject({ name: 'DepthSourceError', status: 503 });
  });

  it('reports an unreachable upstream as unreachable, not as a bad response', async () => {
    const s = source((async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch);

    await expect(s.snapshot('BTC-USDT', 50)).rejects.toThrow(/svc-matching unreachable/);
  });

  it('sends no credential of any kind', async () => {
    const seen: RequestInit[] = [];
    const s = source((async (_url: unknown, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response(JSON.stringify({ markets: ['BTC-USDT'] }), { status: 200 });
    }) as unknown as typeof globalThis.fetch);

    await s.markets();

    // The whole security argument for this service is that it holds nothing.
    // A header added here later would quietly undo it.
    const headers = seen[0]?.headers;
    expect(headers).toBeUndefined();
  });

  it('percent-encodes the market id into the path', async () => {
    const urls: string[] = [];
    const s = source((async (url: unknown) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ bids: [], asks: [], sequence: 0 }), { status: 200 });
    }) as unknown as typeof globalThis.fetch);

    await s.snapshot('BTC/USDT', 25);

    expect(urls[0]).toBe('http://matching.test/markets/BTC%2FUSDT/depth?limit=25');
  });

  it('refuses a market list that is not a list of strings', async () => {
    const s = source(respondWith({ markets: [1, 2] }));
    await expect(s.markets()).rejects.toThrow(DepthSourceError);
  });

  /**
   * A LISTED MARKET WITH NO BOOK IS AN EMPTY BOOK.
   *
   * svc-matching answers 404 for a market it holds no book for — correctly:
   * reading must not allocate. But six of the sixteen listed markets have never
   * traded, and refusing to stream them made an honest empty ladder look like a
   * broken terminal. The listing check has already run by the time this call is
   * made, so a 404 here can only mean "nobody has quoted here yet".
   */
  it('turns an upstream 404 into an empty book rather than an error', async () => {
    const s = source(respondWith({ code: 'MarketNotFound' }, 404));

    await expect(s.snapshot('7b64a76b-0000-0000-0000-000000000000', 50)).resolves.toEqual({
      type: 'snapshot',
      marketId: '7b64a76b-0000-0000-0000-000000000000',
      sequence: 0,
      bids: [],
      asks: [],
    });
  });

  it('still fails loudly on every other upstream status', async () => {
    // Only 404 carries that meaning. A 500 is svc-matching being broken, and it
    // must never be drawn as a market that simply has no quotes.
    for (const status of [400, 500, 502, 503]) {
      const s = source(respondWith({ error: 'nope' }, status));
      await expect(s.snapshot('BTC-USDT', 50)).rejects.toMatchObject({ name: 'DepthSourceError', status });
    }
  });

  it('does not turn a 404 on the market list into an empty exchange', async () => {
    // "No book" is a fact about one market. A market list that 404s is a
    // misconfigured URL, and reporting it as zero markets would delist the fleet.
    const s = source(respondWith({}, 404));
    await expect(s.markets()).rejects.toThrow(/no market list/);
  });

  it('sequences an empty book at 0, so the first real quote arrives as a delta', async () => {
    // Not a placeholder — nothing has happened. When the engine's first order
    // lands its sequence is above 0 and the hub diffs into it normally, so a
    // client watching an untraded market never has to be told to resnapshot.
    const s = source(respondWith({ code: 'MarketNotFound' }, 404));
    await expect(s.snapshot('never-traded', 50)).resolves.toMatchObject({ sequence: 0 });
  });
});
