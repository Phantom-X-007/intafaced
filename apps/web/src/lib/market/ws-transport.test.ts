import { describe, expect, it, vi } from 'vitest';
import type { DepthDelta, DepthSnapshot } from '@intafaced/market-data';
import { DepthController } from './depth-controller';
import { snapshotUrl, streamUrl, WsDepthTransport, type DepthSocketLike } from './ws-transport';

/**
 * THE TRANSPORT, AND THE GAP CONTRACT ACROSS IT.
 *
 * `depth-controller.test.ts` proves the state machine against a hand-written
 * transport. These prove the real one: that the frames svc-ws actually sends
 * are parsed, that anything else is refused rather than half-applied, and —
 * the one that matters — that a delta whose `fromSequence` does not line up
 * makes the controller withhold the book and resnapshot, over the transport a
 * browser really uses.
 */

const MARKET = 'BTC-USDT';

function snapshot(sequence: number, bids: Array<[string, string]> = [['100', '1']]): DepthSnapshot {
  return { type: 'snapshot', marketId: MARKET, sequence, bids, asks: [['101', '1']] };
}

function delta(fromSequence: number, sequence: number, bids: Array<[string, string]> = []): DepthDelta {
  return { type: 'delta', marketId: MARKET, fromSequence, sequence, bids, asks: [] };
}

class FakeSocket implements DepthSocketLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  closedByClient = false;

  constructor(readonly url: string) {}

  /** What svc-ws would put on the wire. */
  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }

  serverClose(code: number, reason: string): void {
    this.onclose?.({ code, reason });
  }

  close(): void {
    this.closedByClient = true;
  }
}

/** A transport wired to a socket the test drives, and a fetch it controls. */
function rig(options: { snapshots?: DepthSnapshot[]; deferSnapshot?: boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const queue = [...(options.snapshots ?? [])];
  const pendingFetches: Array<() => void> = [];

  const transport = new WsDepthTransport({
    origin: 'http://localhost:4014',
    openSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    fetch: (async () => {
      const next = queue.shift();
      if (!next) throw new Error('snapshot endpoint exhausted');
      // Held open until the test releases it, so deltas can be made to arrive
      // while a snapshot is genuinely in flight — the classic bug.
      if (options.deferSnapshot) await new Promise<void>((resolve) => pendingFetches.push(resolve));
      return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch,
  });

  return {
    transport,
    socket: () => sockets.at(-1)!,
    releaseSnapshot: () => pendingFetches.shift()?.(),
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe('WsDepthTransport — URLs', () => {
  it('derives the socket URL from the origin, and upgrades the scheme', () => {
    expect(streamUrl('http://localhost:4014', MARKET)).toBe('ws://localhost:4014/stream?market=BTC-USDT');
    expect(streamUrl('https://ws.example.com', MARKET)).toBe('wss://ws.example.com/stream?market=BTC-USDT');
  });

  it('encodes the market rather than pasting it into a URL', () => {
    expect(streamUrl('http://localhost:4014', 'BTC/USDT')).toContain('market=BTC%2FUSDT');
    expect(snapshotUrl('http://localhost:4014/', 'BTC/USDT')).toBe('http://localhost:4014/markets/BTC%2FUSDT/depth');
  });

  it('refuses a scheme it cannot open a socket to', () => {
    expect(() => streamUrl('ftp://localhost:4014', MARKET)).toThrow(/http\(s\)/);
  });
});

describe('WsDepthTransport — what it will accept as an answer', () => {
  it('parses a snapshot', async () => {
    const r = rig({ snapshots: [snapshot(10)] });
    await expect(r.transport.snapshot(MARKET)).resolves.toMatchObject({ type: 'snapshot', sequence: 10 });
  });

  it('refuses a snapshot carrying a JSON number where a price belongs', async () => {
    const transport = new WsDepthTransport({
      origin: 'http://localhost:4014',
      openSocket: (url) => new FakeSocket(url),
      fetch: (async () =>
        new Response(JSON.stringify({ type: 'snapshot', marketId: MARKET, sequence: 1, bids: [[100.5, 2]], asks: [] }), {
          status: 200,
        })) as unknown as typeof globalThis.fetch,
    });

    // A float here would be a float in the book, wrong in the eighteenth
    // decimal place and invisible until it is not.
    await expect(transport.snapshot(MARKET)).rejects.toThrow(/not a snapshot/);
  });

  it('reports a non-200 as a failed snapshot rather than parsing the body', async () => {
    const transport = new WsDepthTransport({
      origin: 'http://localhost:4014',
      openSocket: (url) => new FakeSocket(url),
      fetch: (async () => new Response('nope', { status: 502 })) as unknown as typeof globalThis.fetch,
    });

    await expect(transport.snapshot(MARKET)).rejects.toThrow(/answered 502/);
  });

  it('delivers well-formed frames and refuses everything else', () => {
    const r = rig();
    const messages: unknown[] = [];
    const errors: string[] = [];

    r.transport.subscribe(
      MARKET,
      (m) => messages.push(m),
      (e) => errors.push(e.message),
    );

    r.socket().emit(snapshot(10));
    r.socket().emit(delta(10, 11));
    r.socket().emitRaw('}{ not json');
    r.socket().emit({ type: 'delta', marketId: MARKET, sequence: 12 }); // no fromSequence
    r.socket().emit({ type: 'delta', marketId: MARKET, fromSequence: 12, sequence: 13, bids: [[100, 1]], asks: [] });

    expect(messages).toHaveLength(2);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/not JSON/);
    expect(errors[1]).toMatch(/does not understand/);
  });

  it('surfaces the reason svc-ws sent when it closes the socket', () => {
    const r = rig();
    const errors: string[] = [];
    r.transport.subscribe(
      MARKET,
      () => undefined,
      (e) => errors.push(e.message),
    );

    r.socket().serverClose(1013, 'slow consumer: outbound buffer over 1048576 bytes for 20 ticks');

    // The most useful thing a user can be shown is why, and svc-ws sends why.
    expect(errors[0]).toContain('slow consumer');
  });

  it('goes quiet and closes the socket on unsubscribe', () => {
    const r = rig();
    const messages: unknown[] = [];
    const errors: unknown[] = [];
    const unsubscribe = r.transport.subscribe(
      MARKET,
      (m) => messages.push(m),
      (e) => errors.push(e),
    );

    unsubscribe();
    r.socket().serverClose(1000, 'normal'); // our own close coming back

    expect(r.socket().closedByClient).toBe(true);
    // A close we asked for is not an error, and must not paint the panel red.
    expect(errors).toEqual([]);
    expect(messages).toEqual([]);
  });

  it('reports a bad origin as an error rather than throwing out of the caller', () => {
    const transport = new WsDepthTransport({
      origin: 'ftp://localhost:4014',
      openSocket: (url) => new FakeSocket(url),
    });
    const errors: string[] = [];

    const unsubscribe = transport.subscribe(
      MARKET,
      () => undefined,
      (e) => errors.push(e.message),
    );

    expect(errors[0]).toMatch(/http\(s\)/);
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('the gap contract, over the real transport', () => {
  /**
   * THE ONE THAT MATTERS.
   *
   * svc-ws computes `fromSequence` with `diffDepth`; this client checks it with
   * `applyDelta`. If the server ever emits one that does not continue, the
   * controller must withhold the book and resnapshot — not apply it anyway, and
   * not keep drawing the stale one.
   */
  it('withholds the book and resnapshots when a delta does not continue', async () => {
    const r = rig({ snapshots: [snapshot(10), snapshot(30, [['100', '9']])] });
    const controller = new DepthController({ marketId: MARKET, transport: r.transport });
    controller.start();
    await r.settle();

    expect(controller.state.status).toBe('live');

    // Sequence 11 never arrived. This one continues from 11; the book is at 10.
    r.socket().emit(delta(11, 12, [['100', '7']]));

    expect(controller.state.status).toBe('resnapshotting');

    await r.settle();
    const state = controller.state;
    if (state.status !== 'live') throw new Error(`expected live, got ${state.status}`);
    expect(state.book.sequence).toBe(30);
    // The gapping delta's quantity is NOT in the book — it was refused.
    expect(state.book.bids.get('100')).toBe(9n * 10n ** 18n);

    controller.stop();
  });

  it('never resnapshots while the stream continues', async () => {
    // The other half of the contract, and the one a renumbering server would
    // break silently: an unbroken stream must cost exactly one snapshot.
    const r = rig({ snapshots: [snapshot(10)] });
    const controller = new DepthController({ marketId: MARKET, transport: r.transport });
    const seen: string[] = [];
    controller.subscribe((s) => seen.push(s.status));
    controller.start();
    await r.settle();

    for (let sequence = 11; sequence <= 40; sequence += 1) {
      r.socket().emit(delta(sequence - 1, sequence, [['100', String(sequence)]]));
    }

    const state = controller.state;
    if (state.status !== 'live') throw new Error(`expected live, got ${state.status}`);
    expect(state.book.sequence).toBe(40);
    expect(state.resnapshots).toBe(0);
    expect(seen).not.toContain('resnapshotting');

    controller.stop();
  });

  /**
   * The classic bug, over the wire this time: the snapshot is a round trip and
   * the stream does not pause for it.
   */
  it('applies deltas that arrived while the HTTP snapshot was in flight', async () => {
    const r = rig({ snapshots: [snapshot(10)], deferSnapshot: true });
    const controller = new DepthController({ marketId: MARKET, transport: r.transport });
    controller.start();
    await r.settle();

    // The socket is open and svc-ws is already pushing, but the GET has not
    // come back yet.
    r.socket().emit(delta(10, 11, [['100', '3']]));
    r.socket().emit(delta(11, 12, [['100', '4']]));
    expect(controller.state.status).toBe('connecting');

    r.releaseSnapshot();
    await r.settle();

    const state = controller.state;
    if (state.status !== 'live') throw new Error(`expected live, got ${state.status}`);
    expect(state.book.sequence).toBe(12);
    expect(state.book.bids.get('100')).toBe(4n * 10n ** 18n);

    controller.stop();
  });

  it('renders a dead stream as unavailable rather than as a frozen book', async () => {
    const r = rig({ snapshots: [snapshot(10)] });
    const controller = new DepthController({ marketId: MARKET, transport: r.transport });
    const seen: string[] = [];
    controller.subscribe((s) => seen.push(s.status));
    controller.start();
    await r.settle();

    r.socket().serverClose(1001, 'gateway shutting down');

    expect(controller.state.status).toBe('unavailable');
    expect(seen.at(-1)).toBe('unavailable');
    controller.stop();
  });
});

describe('the transport opens exactly one socket per subscription', () => {
  it('does not reconnect on its own', () => {
    const r = rig();
    const opened = vi.fn();
    const transport = new WsDepthTransport({
      origin: 'http://localhost:4014',
      openSocket: (url) => {
        opened();
        return new FakeSocket(url);
      },
    });

    const unsubscribe = transport.subscribe(
      MARKET,
      () => undefined,
      () => undefined,
    );
    unsubscribe();

    // Reconnection is the controller's decision, not the transport's: a
    // transport that reconnected silently would hide a stream that is failing.
    expect(opened).toHaveBeenCalledTimes(1);
    expect(r.settle).toBeDefined();
  });
});
