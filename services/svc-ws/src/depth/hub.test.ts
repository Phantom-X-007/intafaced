import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDelta,
  bookFromSnapshot,
  type DepthBook,
  type DepthMessage,
  type DepthSnapshot,
  type WireLevel,
} from '@intafaced/market-data';
import { CLOSE_POLICY, CLOSE_TRY_LATER, DepthHub, type DepthSink } from './hub.js';
import type { DepthSource } from './source.js';

/**
 * THE FAN-OUT, FROM THE CLIENT'S SIDE.
 *
 * Almost every assertion here goes through `rebuild()`, which does exactly what
 * `apps/web`'s `DepthController` does: take the first snapshot, apply every
 * delta with `@intafaced/market-data`'s `applyDelta`, and REFUSE anything that
 * does not continue. If the server ever emits a `fromSequence` that does not
 * line up, `applyDelta` returns `{ ok: false, reason: 'gap' }` and `rebuild`
 * throws — which is the whole safety property, asserted from the side that has
 * to live with it rather than from the side that produces it.
 *
 * That is deliberate. A test that checked `delta.fromSequence === previous`
 * would pass on a server that renumbered both consistently and shipped a book
 * nobody could rebuild.
 */

const MARKET = 'BTC-USDT';
const OTHER = 'ETH-USDT';

function snapshot(
  sequence: number,
  bids: WireLevel[] = [['100', '1']],
  asks: WireLevel[] = [['101', '1']],
  marketId = MARKET,
): DepthSnapshot {
  return { type: 'snapshot', marketId, sequence, bids, asks };
}

class FakeSink implements DepthSink {
  readonly frames: string[] = [];
  closed: { code: number; reason: string } | null = null;
  bufferedBytes = 0;
  /** Set to make `send` throw, the way a socket that has already gone does. */
  broken = false;

  send(frame: string): void {
    if (this.broken) throw new Error('EPIPE');
    this.frames.push(frame);
  }

  close(code: number, reason: string): void {
    this.closed ??= { code, reason };
  }

  messages(): DepthMessage[] {
    return this.frames.map((f) => JSON.parse(f) as DepthMessage);
  }
}

class FakeSource implements DepthSource {
  readonly marketList: string[];
  readonly current = new Map<string, DepthSnapshot>();
  readonly snapshotCalls: string[] = [];
  marketCalls = 0;
  failMarkets: Error | null = null;

  constructor(marketList: string[]) {
    this.marketList = marketList;
  }

  async markets(): Promise<readonly string[]> {
    this.marketCalls += 1;
    if (this.failMarkets) throw this.failMarkets;
    return this.marketList;
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    this.snapshotCalls.push(marketId);
    const s = this.current.get(marketId);
    if (!s) throw new Error(`no upstream book for ${marketId}`);
    return s;
  }
}

/** Let every pending microtask and timer-0 continuation settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function hubFor(source: FakeSource, overrides: Partial<Parameters<typeof DepthHub.prototype.constructor>[1]> = {}) {
  return new DepthHub(source, {
    depthLimit: 50,
    highWaterBytes: 1_000,
    maxLagTicks: 3,
    maxConnections: 100,
    marketsRefreshMs: 0,
    ...overrides,
  });
}

/**
 * A client, built out of nothing but the frames it received.
 *
 * Throws on the two failures that matter: a delta before any snapshot (an
 * ordering bug on the server) and a delta that does not continue (a sequence
 * bug on the server).
 */
function rebuild(sink: FakeSink): DepthBook | null {
  let book: DepthBook | null = null;

  for (const message of sink.messages()) {
    if (message.type === 'snapshot') {
      book = bookFromSnapshot(message);
      continue;
    }
    if (book === null) throw new Error('a delta arrived before any snapshot — the client has no book to apply it to');

    const result = applyDelta(book, message);
    if (!result.ok) throw new Error(`the client refused a delta: ${result.reason} (expected ${result.expected}, got ${result.got})`);
    book = result.book;
  }

  return book;
}

/** Canonical form, so two books can be compared as strings. */
function canonical(book: DepthBook | null): string {
  if (!book) return '<none>';
  const side = (levels: DepthBook['bids']) =>
    [...levels.entries()]
      .map(([p, q]) => `${p}=${q}`)
      .sort()
      .join(',');
  return `${book.marketId}@${book.sequence} bids[${side(book.bids)}] asks[${side(book.asks)}]`;
}

describe('DepthHub — a client can always rebuild the server’s exact book', () => {
  let source: FakeSource;
  let hub: DepthHub;
  let sink: FakeSink;

  beforeEach(() => {
    source = new FakeSource([MARKET, OTHER]);
    source.current.set(MARKET, snapshot(10));
    hub = hubFor(source);
    sink = new FakeSink();
  });

  it('sends a snapshot first, then deltas that continue it', async () => {
    hub.attach(MARKET, sink);
    await settle();

    expect(sink.messages()[0]?.type).toBe('snapshot');

    hub.ingest(snapshot(11, [['100', '2']]));
    hub.ingest(
      snapshot(12, [
        ['100', '2'],
        ['99', '5'],
      ]),
    );

    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });

  /**
   * THE TEST THIS SERVICE EXISTS FOR.
   *
   * Two hundred ticks of adds, removals, requotes and quiet sequences, rebuilt
   * by the client from the frames alone. Any `fromSequence` that does not line
   * up makes `applyDelta` return `gap` and this throws.
   */
  it('survives a long, noisy stream without a single gap', async () => {
    hub.attach(MARKET, sink);
    await settle();

    // A seeded LCG, not Math.random: a test that fails one run in fifty and
    // cannot be re-run is not a test.
    let seed = 0x5eed;
    const next = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff);

    let sequence = 10;
    const bids = new Map<string, string>([['100', '1']]);
    const asks = new Map<string, string>([['101', '1']]);

    for (let tick = 0; tick < 200; tick += 1) {
      const roll = next();
      const side = roll < 0.5 ? bids : asks;
      const price = String(90 + Math.floor(next() * 20));

      if (roll < 0.15) side.delete(price);
      else if (roll < 0.85) side.set(price, `${(1 + Math.floor(next() * 9)).toString()}.${Math.floor(next() * 1e6)}`);
      // else: the sequence advances with no level change at all, which must
      // still produce a delta or every client falls behind the engine.

      sequence += 1 + Math.floor(next() * 3);
      hub.ingest(snapshot(sequence, [...bids], [...asks]));
    }

    expect(sink.frames.length).toBeGreaterThan(100);
    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });

  it('emits a delta when the sequence advances but no level changed', async () => {
    hub.attach(MARKET, sink);
    await settle();
    const before = sink.frames.length;

    const delta = hub.ingest(snapshot(11)); // identical levels, higher sequence

    expect(delta).not.toBeNull();
    expect(delta?.fromSequence).toBe(10);
    expect(delta?.sequence).toBe(11);
    expect(delta?.bids).toEqual([]);
    expect(sink.frames.length).toBe(before + 1);
    // Because it was sent, the NEXT delta continues and nobody resnapshots.
    hub.ingest(snapshot(12, [['100', '3']]));
    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });

  it('says nothing when the sequence has not moved', async () => {
    hub.attach(MARKET, sink);
    await settle();
    const before = sink.frames.length;

    expect(hub.ingest(snapshot(10))).toBeNull();
    expect(sink.frames.length).toBe(before);
  });

  it('never puts a JSON number where an amount belongs', async () => {
    hub.attach(MARKET, sink);
    await settle();
    hub.ingest(snapshot(11, [['100.123456789012345678', '0.000000000000000001']], [['101.5', '0']]));

    for (const message of sink.messages()) {
      for (const level of [...message.bids, ...message.asks]) {
        expect(typeof level[0]).toBe('string');
        expect(typeof level[1]).toBe('string');
      }
    }
    // The only JSON numbers anywhere in the stream are integer sequences.
    for (const frame of sink.frames) {
      const numbers = [...frame.matchAll(/:\s*(-?\d+(?:\.\d+)?)/g)].map((m) => m[1]!);
      for (const n of numbers) expect(Number.isInteger(Number(n))).toBe(true);
    }
  });
});

describe('DepthHub — snapshot-then-delta ordering across the connect window', () => {
  /**
   * THE CLASSIC BUG.
   *
   * A connection is registered before its snapshot exists, so deltas can and do
   * land in between. Sending one before the snapshot would have the client drop
   * it (it has no book yet); dropping it would leave the client behind. Both
   * are wrong, and both are invisible until a book quietly stops matching.
   *
   * The property asserted is the one that matters: whatever the hub does in
   * that window, the client's rebuilt book must equal the server's, and no
   * delta may reach the wire before a snapshot does.
   */
  it('buffers deltas that arrive while a snapshot is being produced, and loses none', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    const hub = hubFor(source);

    const first = new FakeSink();
    hub.attach(MARKET, first);
    await settle();

    // Second client connects. Its snapshot is produced on a later turn — and
    // the stream does not pause for it.
    const second = new FakeSink();
    hub.attach(MARKET, second);
    hub.ingest(snapshot(11, [['100', '2']]));
    hub.ingest(
      snapshot(12, [
        ['100', '2'],
        ['99', '7'],
      ]),
    );
    await settle();

    // Nothing reached the second client before its snapshot.
    expect(second.messages()[0]?.type).toBe('snapshot');
    // And nothing was lost: both clients hold the server's book, exactly.
    const server = canonical(hub.bookFor(MARKET) ?? null);
    expect(canonical(rebuild(first))).toBe(server);
    expect(canonical(rebuild(second))).toBe(server);
    expect(second.closed).toBeNull();
  });

  it('keeps working when the market is cold and the first snapshot is a round trip', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(30, [['100', '4']]));
    const hub = hubFor(source);

    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    // Registered, but nothing sent yet — the upstream fetch has not resolved.
    expect(sink.frames).toEqual([]);

    await settle();

    expect(sink.messages()[0]).toMatchObject({ type: 'snapshot', sequence: 30 });
    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });
});

describe('DepthHub — backpressure: degrade, then disconnect', () => {
  let source: FakeSource;
  let hub: DepthHub;

  beforeEach(() => {
    source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    hub = hubFor(source, { highWaterBytes: 1_000, maxLagTicks: 3 });
  });

  it('drops deltas for a backed-up client rather than queueing them', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();
    const afterSnapshot = sink.frames.length;

    sink.bufferedBytes = 5_000; // the peer is not reading
    hub.ingest(snapshot(11, [['100', '2']]));
    hub.ingest(snapshot(12, [['100', '3']]));

    // Nothing was written and nothing was retained — the server holds no queue.
    expect(sink.frames.length).toBe(afterSnapshot);
    expect(hub.stats.droppedFrames).toBe(2);
    expect(sink.closed).toBeNull();
  });

  it('repairs a lagging client with a snapshot, not with the deltas it missed', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    sink.bufferedBytes = 5_000;
    hub.ingest(snapshot(11, [['100', '2']]));
    hub.ingest(snapshot(12, [['100', '3']]));

    sink.bufferedBytes = 0; // drained
    hub.ingest(snapshot(13, [['100', '4']]));

    const last = sink.messages().at(-1);
    expect(last?.type).toBe('snapshot');
    expect(last?.sequence).toBe(13);
    // The client is whole again, from frames alone, with no resnapshot request.
    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });

  it('repairs a client that lagged into a market that then went quiet', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    sink.bufferedBytes = 5_000;
    hub.ingest(snapshot(11, [['100', '2']]));
    sink.bufferedBytes = 0;

    // A tick with NOTHING new. If repair rode on the delta rather than on the
    // tick, this client would sit on a book it believes is current forever.
    hub.ingest(snapshot(11, [['100', '2']]));

    expect(sink.messages().at(-1)).toMatchObject({ type: 'snapshot', sequence: 11 });
    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });

  it('disconnects a client that cannot absorb even a snapshot', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    sink.bufferedBytes = 5_000;
    for (let i = 1; i <= 3; i += 1) hub.ingest(snapshot(10 + i));

    expect(sink.closed?.code).toBe(CLOSE_TRY_LATER);
    expect(sink.closed?.reason).toMatch(/slow consumer/);
    expect(hub.connections).toBe(0);
    expect(hub.stats.evictions).toBe(1);
  });

  it('forgives a client that catches up before the strike limit', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    sink.bufferedBytes = 5_000;
    hub.ingest(snapshot(11));
    hub.ingest(snapshot(12));
    sink.bufferedBytes = 0;
    hub.ingest(snapshot(13));
    sink.bufferedBytes = 5_000;
    hub.ingest(snapshot(14));
    hub.ingest(snapshot(15));

    expect(sink.closed).toBeNull();
  });

  it('drops a socket whose send throws instead of retrying it every tick', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    sink.broken = true;
    hub.ingest(snapshot(11));

    expect(hub.connections).toBe(0);
    expect(sink.closed).not.toBeNull();
  });

  it('refuses new connections at capacity rather than accepting them and dying', async () => {
    const small = hubFor(source, { maxConnections: 1 });
    const first = new FakeSink();
    const second = new FakeSink();

    small.attach(MARKET, first);
    small.attach(MARKET, second);
    await settle();

    expect(second.closed?.code).toBe(CLOSE_TRY_LATER);
    expect(second.frames).toEqual([]);
  });
});

describe('DepthHub — an unknown market never reaches svc-matching', () => {
  /**
   * A market nobody lists is not a market, and a terminal must not be able to
   * confuse "nobody is quoting here" with "you asked for something that does
   * not exist" — an empty ladder drawn for a typo is a market being rendered as
   * if it were real.
   *
   * This was also, historically, a memory-safety gate: `engine.depth()` went
   * through `engine.book()`, which CREATED the book when it was missing, so a
   * depth call for an arbitrary string allocated an entry in the engine's map
   * from any browser that could open a socket here. That hole is closed at the
   * engine now (`existingBook`, plus a 404 on the depth route), so this pins the
   * honesty property rather than the allocation one.
   */
  it('refuses the subscription and makes no depth call', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    const hub = hubFor(source);

    const sink = new FakeSink();
    hub.attach('NOT-A-MARKET', sink);
    await settle();

    expect(sink.closed?.code).toBe(CLOSE_POLICY);
    expect(sink.closed?.reason).toMatch(/unknown market/);
    expect(source.snapshotCalls).toEqual([]);
    expect(hub.connections).toBe(0);
  });

  it('refetches the list once so a newly listed market works without a restart', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    source.current.set(OTHER, snapshot(4, [['20', '1']], [['21', '1']], OTHER));
    const hub = hubFor(source);

    await hub.refreshMarkets();
    expect(hub.knownMarkets).toEqual([MARKET]);

    source.marketList.push(OTHER); // svc-matching listed it a moment ago
    const sink = new FakeSink();
    hub.attach(OTHER, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.messages()[0]).toMatchObject({ type: 'snapshot', marketId: OTHER });
  });

  it('tells the client why when svc-matching cannot be reached', async () => {
    const source = new FakeSource([MARKET]);
    source.failMarkets = new Error('svc-matching unreachable: connect ECONNREFUSED');
    const hub = hubFor(source);

    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    expect(sink.closed?.code).toBe(CLOSE_TRY_LATER);
    expect(sink.closed?.reason).toMatch(/ECONNREFUSED/);
  });
});

describe('DepthHub — book lifecycle', () => {
  it('sends everyone a snapshot when the engine sequence goes backwards', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(50, [['100', '9']]));
    const hub = hubFor(source);

    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    // An engine that lost its journal, or a replica behind its peers. A delta
    // across the discontinuity would carry a `fromSequence` nobody is at.
    hub.ingest(snapshot(3, [['100', '1']]));

    const last = sink.messages().at(-1);
    expect(last?.type).toBe('snapshot');
    expect(last?.sequence).toBe(3);
    expect(canonical(rebuild(sink))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });

  it('forgets a book when the last subscriber leaves, so nobody is handed a stale one', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    const hub = hubFor(source);

    const first = new FakeSink();
    const second = new FakeSink();
    const detachFirst = hub.attach(MARKET, first);
    const detachSecond = hub.attach(MARKET, second);
    await settle();

    detachFirst();
    expect(hub.bookFor(MARKET)).toBeDefined(); // still watched

    detachSecond();
    expect(hub.bookFor(MARKET)).toBeUndefined();
    expect(hub.activeMarkets).toEqual([]);
  });

  it('leaves no book behind when a client gives up mid-connect', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    const hub = hubFor(source);

    // Detached before the upstream round trip came back. The seed still lands a
    // book; nothing must be left watching nothing.
    const detach = hub.attach(MARKET, new FakeSink());
    detach();
    await settle();

    expect(hub.connections).toBe(0);
    expect(hub.bookFor(MARKET)).toBeUndefined();
  });

  it('polls only markets someone is watching', async () => {
    const source = new FakeSource([MARKET, OTHER]);
    source.current.set(MARKET, snapshot(10));
    const hub = hubFor(source);

    hub.attach(MARKET, new FakeSink());
    await settle();

    expect(hub.activeMarkets).toEqual([MARKET]);
  });

  it('closes every socket with a reason when the kill-switch is thrown', async () => {
    const source = new FakeSource([MARKET]);
    source.current.set(MARKET, snapshot(10));
    const hub = hubFor(source);

    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    hub.closeAll(1012, 'ws.gateway flag is off');

    expect(sink.closed).toEqual({ code: 1012, reason: 'ws.gateway flag is off' });
    expect(hub.connections).toBe(0);
    expect(hub.bookFor(MARKET)).toBeUndefined();
  });

  it('keeps two markets’ streams apart', async () => {
    const source = new FakeSource([MARKET, OTHER]);
    source.current.set(MARKET, snapshot(10));
    source.current.set(OTHER, snapshot(4, [['20', '1']], [['21', '1']], OTHER));
    const hub = hubFor(source);

    const btc = new FakeSink();
    const eth = new FakeSink();
    hub.attach(MARKET, btc);
    hub.attach(OTHER, eth);
    await settle();

    hub.ingest(snapshot(11, [['100', '2']]));

    for (const message of eth.messages()) expect(message.marketId).toBe(OTHER);
    expect(eth.frames.length).toBe(1);
    expect(canonical(rebuild(btc))).toBe(canonical(hub.bookFor(MARKET) ?? null));
  });
});

/**
 * WHICH LIST DECIDES.
 *
 * The bug that made live depth unreachable for twenty-six cycles was not in any
 * of the fan-out above. It was that this hub asked svc-matching "what are the
 * markets?", and svc-matching answered with the books it holds — which, after
 * `trade.markets` was reseeded, had an EMPTY intersection with the ids the
 * browser fetches to draw the market picker. Sixteen listed, ten in the engine,
 * nothing in common, every subscription refused with `unknown market`.
 *
 * So the hub now takes a registry that is separate from its depth source, and
 * these are the two facts that must hold: the listing decides, and a listed
 * market with no book still opens.
 */
describe('DepthHub — the listing decides, not the engine', () => {
  const LISTED = 'fbbe6534-e7af-49a8-a782-bbdd1e1894ba';
  const ENGINE_ONLY = '2a70a839-aeb6-4c04-a067-2b000f392bdb';

  it('accepts a listed market the engine has never heard of', async () => {
    // The exact fleet state: the source's own list does not contain it.
    const source = new FakeSource([ENGINE_ONLY]);
    source.current.set(LISTED, snapshot(0, [], [], LISTED));
    const hub = hubFor(source, { registry: { markets: async () => [LISTED, ENGINE_ONLY] } });

    const sink = new FakeSink();
    hub.attach(LISTED, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.messages()[0]).toMatchObject({ type: 'snapshot', marketId: LISTED });
  });

  it('opens an EMPTY BOOK for a listed market that has never traded', async () => {
    // Six of the sixteen. `HttpDepthSource` turns svc-matching's 404 into this
    // snapshot; here the shape is what matters — no asks, no bids, sequence 0,
    // and a live socket rather than a close frame. The shell already renders
    // exactly this as "No asks / No bids".
    const source = new FakeSource([]);
    source.current.set(LISTED, { type: 'snapshot', marketId: LISTED, sequence: 0, bids: [], asks: [] });
    const hub = hubFor(source, { registry: { markets: async () => [LISTED] } });

    const sink = new FakeSink();
    hub.attach(LISTED, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.messages()[0]).toEqual({ type: 'snapshot', marketId: LISTED, sequence: 0, bids: [], asks: [] });
  });

  it('still refuses an id nobody lists', async () => {
    const source = new FakeSource([ENGINE_ONLY]);
    const hub = hubFor(source, { registry: { markets: async () => [LISTED, ENGINE_ONLY] } });

    const sink = new FakeSink();
    hub.attach('NOT-A-MARKET', sink);
    await settle();

    expect(sink.closed?.code).toBe(CLOSE_POLICY);
    expect(sink.closed?.reason).toMatch(/unknown market/);
    expect(source.snapshotCalls).toEqual([]);
  });

  it('never asks the depth source for the market list once a registry is given', async () => {
    // A regression here would silently restore the old behaviour: the engine's
    // book list back in charge of what a client may watch.
    const source = new FakeSource([ENGINE_ONLY]);
    const hub = hubFor(source, { registry: { markets: async () => [LISTED] } });

    await hub.refreshMarkets();

    expect(source.marketCalls).toBe(0);
    expect(hub.knownMarkets).toEqual([LISTED]);
  });

  it('keeps the last known list when the registry fails, rather than delisting everything', async () => {
    let fail = false;
    const source = new FakeSource([]);
    const hub = hubFor(source, {
      registry: {
        markets: async () => {
          if (fail) throw new Error('every market registry source failed');
          return [LISTED];
        },
      },
    });

    await hub.refreshMarkets();
    fail = true;
    await expect(hub.refreshMarkets()).rejects.toThrow(/every market registry source failed/);

    expect(hub.knownMarkets).toEqual([LISTED]);
  });
});
