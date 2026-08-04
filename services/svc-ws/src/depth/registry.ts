import type { HubLogger } from './hub.js';

/**
 * WHICH MARKETS EXIST.
 *
 * ── The bug this port exists to fix ─────────────────────────────────────────
 *
 * svc-ws used to answer "is this a market?" with `GET /markets` on
 * svc-matching. That list is `engine.markets` — `[...books.keys()]`, the books
 * the engine currently holds, which is the set of markets that have already
 * traded or been replayed out of the journal. It is not the set of markets that
 * are LISTED.
 *
 * Against the running fleet the two sets had **zero** overlap. svc-trade served
 * sixteen markets out of its Postgres (`trade.markets`, ids `defaultRandom()`),
 * svc-matching knew ten ids recovered from an older journal written before that
 * table was reseeded, and the intersection was empty:
 *
 *     listed   fbbe6534-…  17097ffd-…  7b64a76b-…   (16, from trade.markets)
 *     engine   2a70a839-…  771981a8-…  802e5fe0-…   (10, from journal replay)
 *
 * So every id a browser could legitimately discover — the ids in the very JSON
 * it fetches to draw the market picker — was refused by the socket with
 * `unknown market`, and no client could open depth for anything it was allowed
 * to trade.
 *
 * ── Who is authoritative ────────────────────────────────────────────────────
 *
 * The `markets` table is. A market is listed when a human lists it, not when a
 * stranger trades it, and a listed market that has never traded must still be
 * subscribable. The honest answer for one is an EMPTY book, which is what
 * `HttpDepthSource` now produces on an upstream 404 (see `source.ts`) and what
 * the shell already renders as "No asks / No bids".
 *
 * Narrowing the listing to match the engine was the other option and it is
 * wrong twice over: it would silently delist six real markets, and it would
 * make "may I watch this?" depend on whether somebody else has traded it yet.
 *
 * ── Why this is still a check at all ────────────────────────────────────────
 *
 * The original reason was memory safety: `engine.depth()` went through
 * `book()`, which CREATED the book, so an unvalidated id was a memory-growth
 * primitive against the engine driven from a browser. That hole is closed at
 * the engine now (`existingBook`, and a 404 on the depth route), so this check
 * is no longer the only thing between an anonymous socket and svc-matching's
 * heap.
 *
 * It stays because it is still the difference between two facts a terminal must
 * not confuse: "this market exists and nobody is quoting" and "you asked for
 * something that is not a market". An empty ladder drawn for a typo is a market
 * that does not exist being rendered as if it did.
 *
 * ── No credential ───────────────────────────────────────────────────────────
 *
 * The market list is public — it is the same JSON the browser fetches, and
 * svc-trade's route says so in as many words ("No auth — public market data") —
 * so this reads it with no `Authorization`, no service signature and no
 * database URL. svc-ws still holds nothing, which is the entire argument for
 * svc-ws being its own process, and this port does not spend it.
 */
export interface MarketRegistry {
  /** Ids a client may subscribe to. Order is not significant. */
  markets(): Promise<readonly string[]>;
}

export class MarketRegistryError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'MarketRegistryError';
  }
}

export interface HttpMarketRegistryOptions {
  /** The listing service's base, e.g. `http://svc-trade:4004`. */
  readonly baseUrl: string;
  /** Path to the public market list. */
  readonly path?: string;
  readonly timeoutMs?: number;
  /** Injected in tests. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * The listing service's public market list, over HTTP.
 *
 * The response is the exchange-contract market array the terminal already
 * consumes: `[{ id, symbol, ... }]`. Only `id` is read — svc-ws has no opinion
 * about precision, fees or limits, and reading fields it does not need would
 * couple this service to a shape it has no reason to care about.
 *
 * A row with no string `id` is skipped rather than fatal: one malformed market
 * must not delist the other fifteen.
 */
export class HttpMarketRegistry implements MarketRegistry {
  readonly #url: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpMarketRegistryOptions) {
    this.#url = `${options.baseUrl.replace(/\/+$/, '')}${options.path ?? '/api/v1/markets'}`;
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async markets(): Promise<readonly string[]> {
    let response: Response;
    try {
      response = await this.#fetch(this.#url, { signal: AbortSignal.timeout(this.#timeoutMs) });
    } catch (err) {
      throw new MarketRegistryError(`market registry unreachable: ${err instanceof Error ? err.message : String(err)}`, null);
    }
    if (!response.ok) throw new MarketRegistryError(`market registry answered ${response.status}`, response.status);

    const body: unknown = await response.json();
    // Tolerated both ways: a bare array (the exchange contract) and
    // `{markets: [...]}` (svc-matching's shape), so pointing this at a
    // different list is a URL change and not a code change.
    const rows = Array.isArray(body) ? body : (body as { markets?: unknown }).markets;
    if (!Array.isArray(rows)) throw new MarketRegistryError('market registry returned no market list', null);

    const ids: string[] = [];
    for (const row of rows) {
      if (typeof row === 'string') {
        ids.push(row);
        continue;
      }
      const id = (row as { id?: unknown }).id;
      if (typeof id === 'string' && id !== '') ids.push(id);
    }
    if (ids.length === 0 && rows.length > 0) throw new MarketRegistryError('market registry returned rows with no ids', null);
    return ids;
  }
}

export interface RegistryPart {
  readonly name: string;
  readonly registry: MarketRegistry;
}

/**
 * Every id any source vouches for.
 *
 * Two sources, and the union of them rather than either alone:
 *
 *   · **the listing service** is the authority on what is LISTED. It is the
 *     reason this file exists and it is the source that carries the markets
 *     nobody has traded yet.
 *   · **svc-matching** is proof of what the engine actually HAS A BOOK FOR. An
 *     id on that list cannot be junk — a book exists only because svc-trade
 *     accepted an order for it, and svc-trade validated that order against the
 *     same row the listing comes from. It is a subset that is provably real,
 *     and after a reseed it is the only record that those older ids ever meant
 *     anything.
 *
 * The union is what makes the failure modes survivable. If the listing service
 * is down, every market that has ever traded still streams — a public book feed
 * that goes dark because an API container is restarting is a worse service than
 * one that serves the ten books it can prove. If svc-matching is down, the
 * sixteen listed markets still resolve and each opens an empty book, which is
 * the truth anyway while the engine is not answering.
 *
 * Only when EVERY source fails does this throw, and `DepthHub.refreshMarkets`
 * then keeps serving its last known list rather than refusing the fleet.
 */
export class UnionMarketRegistry implements MarketRegistry {
  readonly #parts: readonly RegistryPart[];
  readonly #log: HubLogger;

  constructor(parts: readonly RegistryPart[], log: HubLogger) {
    this.#parts = parts;
    this.#log = log;
  }

  async markets(): Promise<readonly string[]> {
    // Concurrent: the slowest source should cost one round trip, not N.
    const settled = await Promise.allSettled(this.#parts.map((part) => part.registry.markets()));

    const ids = new Set<string>();
    const failures: string[] = [];

    settled.forEach((result, index) => {
      const part = this.#parts[index];
      if (!part) return;
      if (result.status === 'fulfilled') {
        for (const id of result.value) ids.add(id);
        return;
      }
      failures.push(`${part.name}: ${String(result.reason)}`);
      this.#log.warn({ source: part.name, err: String(result.reason) }, 'ws: a market registry source failed — using the others');
    });

    if (failures.length === this.#parts.length) {
      throw new MarketRegistryError(`every market registry source failed — ${failures.join('; ')}`, null);
    }
    return [...ids];
  }
}
