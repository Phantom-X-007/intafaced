import { describe, expect, it } from 'vitest';
import { CARD_DIMENSIONS, cardRasterSchema } from '@intafaced/contracts';
import { UnconfiguredCardRenderer, type CardRasterizeRequest } from './card-renderer.js';
import { HttpCardRenderer } from './http-renderer.js';

/**
 * THE RASTERIZER ADAPTER — and the one rule it exists to enforce.
 *
 * **No failure may produce a URL.** A fabricated asset URL is stored in
 * `card_asset_url`, put in an `og:image` tag, and discovered when a share
 * unfurls as a broken image on somebody else's timeline. Every test below is a
 * different way of failing, and every one of them asserts the same thing about
 * the result.
 *
 * The engine adapter has the same shape and the same stakes (`http-engine.ts`):
 * a made-up profile and a made-up asset URL are the same bug wearing different
 * clothes.
 */

const BLUEPRINT_ID = '33333333-3333-4333-8333-333333333333';

const request: CardRasterizeRequest = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"></svg>',
  size: 'portrait',
  width: CARD_DIMENSIONS.portrait.width,
  height: CARD_DIMENSIONS.portrait.height,
  blueprintId: BLUEPRINT_ID,
};

function renderer(fetchImpl: typeof fetch, timeoutMs = 5_000): HttpCardRenderer {
  return new HttpCardRenderer({ baseUrl: 'https://renderer.invalid/', fetchImpl, timeoutMs });
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('UnconfiguredCardRenderer — the deployment with no renderer', () => {
  it('reports unavailable with a permanent, actionable code', async () => {
    const raster = await new UnconfiguredCardRenderer().rasterize();

    expect(raster.status).toBe('unavailable');
    expect(raster).toMatchObject({ code: 'blueprint.card_renderer_unconfigured' });
    // The reason names the switch. A refusal a reader cannot act on is an
    // outage with better manners.
    expect(raster.status === 'unavailable' && raster.reason).toContain('BLUEPRINT_CARD_RENDERER_URL');
  });

  it('satisfies the contract schema, so it can be returned to a caller as data', () => {
    // The point of the union: this is a value a surface renders, not an
    // exception it catches.
    expect(cardRasterSchema.safeParse({ status: 'unavailable', code: 'blueprint.card_renderer_unconfigured', reason: 'x' }).success).toBe(
      true,
    );
  });

  it('has no code path that can produce a url', async () => {
    const raster = await new UnconfiguredCardRenderer().rasterize();
    expect(raster).not.toHaveProperty('url');
  });
});

describe('HttpCardRenderer — the happy path', () => {
  it('returns the rendered arm with the renderer’s url', async () => {
    const raster = await renderer(async () => json({ url: 'https://cdn.example.com/a.png', bytes: 90_000 })).rasterize(request);

    expect(raster).toEqual({ status: 'rendered', url: 'https://cdn.example.com/a.png', contentType: 'image/png', bytes: 90_000 });
    expect(cardRasterSchema.safeParse(raster).success).toBe(true);
  });

  it('posts the svg, the exact share dimensions, and a stable key', async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    await renderer(async (input, init) => {
      sent = { url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
      return json({ url: 'https://cdn.example.com/a.png', bytes: 1 });
    }).rasterize(request);

    expect(sent!.url).toBe('https://renderer.invalid/v1/render');
    // The dimensions travel explicitly: a renderer that guessed from the markup
    // would silently change output size the day the composer's markup changes.
    expect(sent!.body).toMatchObject({ format: 'png', width: 1080, height: 1350 });
    // Keyed on the blueprint, NOT the user — a public asset path must not carry
    // an account identifier.
    expect(sent!.body.key).toBe(`blueprint/${BLUEPRINT_ID}/portrait.png`);
    expect(JSON.stringify(sent!.body)).not.toContain('user');
  });

  it('sends the api key as a bearer token when configured, and omits it otherwise', async () => {
    let auth: string | null = null;
    const capture: typeof fetch = async (_input, init) => {
      auth = new Headers(init?.headers).get('authorization');
      return json({ url: 'https://cdn.example.com/a.png', bytes: 1 });
    };

    await new HttpCardRenderer({ baseUrl: 'https://r.invalid', fetchImpl: capture, apiKey: 'sekrit' }).rasterize(request);
    expect(auth).toBe('Bearer sekrit');

    await new HttpCardRenderer({ baseUrl: 'https://r.invalid', fetchImpl: capture }).rasterize(request);
    expect(auth).toBeNull();
  });
});

describe('HttpCardRenderer — every failure, and none of them a url', () => {
  const failures: Array<[string, typeof fetch, string]> = [
    [
      'transport error',
      async () => {
        throw new TypeError('fetch failed');
      },
      'blueprint.card_renderer_unreachable',
    ],
    ['http 500', async () => json({ error: 'boom' }, 500), 'blueprint.card_renderer_unreachable'],
    ['http 404 — wrong path or wrong service', async () => json({}, 404), 'blueprint.card_renderer_unreachable'],
    ['body is not json', async () => new Response('<html>gateway</html>', { status: 200 }), 'blueprint.card_renderer_protocol'],
    ['body is missing the url', async () => json({ bytes: 10 }), 'blueprint.card_renderer_protocol'],
    ['url is not a url', async () => json({ url: 'not-a-url', bytes: 10 }), 'blueprint.card_renderer_protocol'],
    // A renderer reporting zero bytes has not rendered anything. Accepting it
    // would store a URL pointing at an empty object — the broken-unfurl bug
    // arriving through the happy path.
    ['zero bytes written', async () => json({ url: 'https://cdn.example.com/a.png', bytes: 0 }), 'blueprint.card_renderer_protocol'],
  ];

  for (const [name, fetchImpl, code] of failures) {
    it(`${name} → unavailable/${code.split('.').pop()}, with no url`, async () => {
      const raster = await renderer(fetchImpl).rasterize(request);

      expect(raster.status).toBe('unavailable');
      expect(raster).toMatchObject({ code });
      expect(raster).not.toHaveProperty('url');
      expect(cardRasterSchema.safeParse(raster).success).toBe(true);
    });
  }

  it('never throws — the caller already has a complete card', async () => {
    // A throw here would turn a successful card request into a 500 over the
    // absence of an optional PNG.
    for (const [, fetchImpl] of failures) {
      await expect(renderer(fetchImpl).rasterize(request)).resolves.toBeDefined();
    }
  });

  it('times out rather than holding the request open', async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });

    const raster = await renderer(hang, 20).rasterize(request);

    expect(raster).toMatchObject({ status: 'unavailable', code: 'blueprint.card_renderer_unreachable' });
    expect(raster.status === 'unavailable' && raster.reason).toContain('timed out');
  });

  it('does not put the renderer’s response body in the reason', async () => {
    // The body is ours going out, but a reason string is logged and aggregated.
    // Quoting a response is one misbehaving renderer away from logging a card.
    const raster = await renderer(async () => json({ url: 'not-a-url', bytes: 1, echo: 'SENSITIVE-ECHO' })).rasterize(request);

    expect(raster.status === 'unavailable' && raster.reason).not.toContain('SENSITIVE-ECHO');
  });
});
