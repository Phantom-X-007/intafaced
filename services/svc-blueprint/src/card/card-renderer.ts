import type { CardRaster, CardSize } from '@intafaced/contracts';

/**
 * CardRenderer — the rasterization adapter (§7.1, Doctrine §0.4).
 *
 * §7.1 specifies the card as "rendered server-side (… → PNG)". Turning our SVG
 * into a *hosted PNG* needs two things this service does not have and should not
 * grow: a rasterizer with fonts, and somewhere to put the bytes. Doctrine §0.4
 * settles the shape — "Adapters, not integrations. All external rails sit behind
 * internal interfaces… the platform never depends on them to function."
 *
 * So this is the interface, and the two implementations either side of it are
 * `HttpCardRenderer` (a real external renderer) and `UnconfiguredCardRenderer`
 * (this deployment has none, and says so).
 *
 * ── The rule this interface exists to enforce ───────────────────────────────
 *
 * **Never return a URL that does not resolve to a card.** Not a placeholder, not
 * a default image, not a signed URL for an upload that never happened. A
 * fabricated asset URL is worse than an error by some distance: the caller
 * stores it in `card_asset_url`, a page puts it in an `<meta og:image>` tag, and
 * the first time anyone finds out is when a share unfurls as a broken image on
 * somebody else's timeline — which is precisely the moment this artifact exists
 * to work.
 *
 * That is why `rasterize` returns `CardRaster` — a union with an `unavailable`
 * arm — instead of throwing or returning `string | null`. A missing renderer is
 * a *state of the deployment*, reported as data with a typed code, and every
 * implementation has to state which arm it is returning.
 *
 * ── Fonts, stated because it is the thing that silently degrades ────────────
 *
 * The card names the brand display face with a system fallback. A renderer that
 * does not have the brand face produces a legible card in a system font — not a
 * failure, but not the designed artifact either. Font provisioning belongs to
 * whatever implements this interface; nothing on this side can detect it, and
 * this comment is here so the next person does not spend an afternoon deciding
 * the composer is broken.
 */
export interface CardRenderer {
  readonly id: string;

  /**
   * Rasterize a composed card.
   *
   * `svg` is already complete and already carries its own pixel dimensions;
   * `size` is passed so a renderer can name or route the asset without parsing
   * the markup, and so the two never disagree.
   */
  rasterize(request: CardRasterizeRequest): Promise<CardRaster>;
}

export interface CardRasterizeRequest {
  readonly svg: string;
  readonly size: CardSize;
  readonly width: number;
  readonly height: number;
  /**
   * Stable identity for the asset, so re-rendering the same card overwrites
   * rather than accumulating. The blueprint id — never the user id, which would
   * put an account identifier in a public asset path.
   */
  readonly blueprintId: string;
}

/**
 * The renderer for a deployment that has none.
 *
 * This is what boots when `BLUEPRINT_CARD_RENDERER_URL` is unset, and it is a
 * deliberate implementation rather than a `null` the callers check. Two reasons,
 * and the second is the one that matters:
 *
 *  1. `blueprint.card` has exactly one code path whether or not a renderer
 *     exists, so the configured path cannot rot untested.
 *
 *  2. A `null` renderer invites `renderer?.rasterize(...) ?? somethingElse`, and
 *     `somethingElse` is where a placeholder URL gets introduced by someone in a
 *     hurry. There is nowhere to put one here: this class can only answer
 *     `unavailable`.
 *
 * It is NOT a failure mode. The vector card still renders and is still a
 * complete artifact — what is absent is the hosted PNG, and the code says which.
 */
export class UnconfiguredCardRenderer implements CardRenderer {
  readonly id = 'card-renderer-unconfigured';

  async rasterize(): Promise<CardRaster> {
    return {
      status: 'unavailable',
      code: 'blueprint.card_renderer_unconfigured',
      reason: 'No card renderer is configured for this deployment — set BLUEPRINT_CARD_RENDERER_URL. The vector card is unaffected.',
    };
  }
}
