import type { DepthSnapshot, WireLevel } from '@intafaced/market-data';

/**
 * WHERE DEPTH COMES FROM.
 *
 * One port, one implementation, so the hub can be driven by a fake in tests
 * without a socket or a clock anywhere near it.
 */
export interface DepthSource {
  /**
   * Market ids the engine actually has a book for.
   *
   * This is not a convenience. `svc-matching`'s `engine.depth()` goes through
   * `engine.book()`, which **creates the book if it does not exist** — so a
   * depth read for `"../../etc/passwd"` does not 404, it allocates an entry in
   * the engine's map and returns an empty book. An anonymous browser that can
   * make this service call depth for an arbitrary string can therefore grow
   * svc-matching's memory from the public internet.
   *
   * Every subscription is checked against this list before any depth call is
   * made. That check is the whole reason this method exists.
   */
  markets(): Promise<readonly string[]>;

  /** Top-N aggregated depth, current as of an engine sequence. */
  snapshot(marketId: string, limit: number): Promise<DepthSnapshot>;
}

export class DepthSourceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'DepthSourceError';
  }
}

/**
 * Is this a decimal string?
 *
 * The wire between two of our own services is still a wire. A JSON number where
 * a price should be would parse into a float somewhere downstream, and the
 * whole point of decimal strings is that it never gets the chance. Rejecting
 * the response is better than silently coercing it — a coercion would be
 * invisible until the eighteenth decimal place mattered.
 */
const DECIMAL = /^\d+(\.\d{1,18})?$/;

function parseLevels(raw: unknown, side: string, marketId: string): WireLevel[] {
  if (!Array.isArray(raw)) throw new DepthSourceError(`${marketId}: ${side} is not an array`, null);

  return raw.map((level) => {
    if (!Array.isArray(level) || level.length !== 2) {
      throw new DepthSourceError(`${marketId}: ${side} level is not a [price, quantity] pair`, null);
    }
    const [price, quantity] = level as [unknown, unknown];
    if (typeof price !== 'string' || typeof quantity !== 'string' || !DECIMAL.test(price) || !DECIMAL.test(quantity)) {
      throw new DepthSourceError(`${marketId}: ${side} level is not a pair of decimal strings`, null);
    }
    return [price, quantity] as WireLevel;
  });
}

export interface HttpDepthSourceOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  /** Injected in tests. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * svc-matching over HTTP.
 *
 * Note what is NOT sent: no `Authorization`, no `x-intafaced-service` headers,
 * no signature. svc-matching authenticates order WRITES and leaves reads open,
 * so this client needs no credential — and because it needs none, this process
 * is not given one. The absence is the security property.
 */
export class HttpDepthSource implements DepthSource {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpDepthSourceOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async #get(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, { signal: AbortSignal.timeout(this.#timeoutMs) });
    } catch (err) {
      throw new DepthSourceError(`svc-matching unreachable: ${err instanceof Error ? err.message : String(err)}`, null);
    }
    if (!response.ok) throw new DepthSourceError(`svc-matching answered ${response.status} for ${path}`, response.status);
    return response.json();
  }

  async markets(): Promise<readonly string[]> {
    const body = await this.#get('/markets');
    const markets = (body as { markets?: unknown }).markets;
    if (!Array.isArray(markets) || markets.some((m) => typeof m !== 'string')) {
      throw new DepthSourceError('svc-matching returned no market list', null);
    }
    return markets as readonly string[];
  }

  async snapshot(marketId: string, limit: number): Promise<DepthSnapshot> {
    const body = await this.#get(`/markets/${encodeURIComponent(marketId)}/depth?limit=${limit}`);
    const raw = body as { marketId?: unknown; sequence?: unknown; bids?: unknown; asks?: unknown };

    if (typeof raw.sequence !== 'number' || !Number.isInteger(raw.sequence)) {
      throw new DepthSourceError(`${marketId}: depth response carries no integer sequence`, null);
    }
    // The engine's sequence is the only thing that makes a delta stream safe.
    // If we cannot read it, we must not invent one.
    return {
      type: 'snapshot',
      marketId,
      sequence: raw.sequence,
      bids: parseLevels(raw.bids, 'bids', marketId),
      asks: parseLevels(raw.asks, 'asks', marketId),
    };
  }
}
