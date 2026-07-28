import { describe, expect, it, vi } from 'vitest';
import type { DepthSnapshot } from '@intafaced/market-data';
import { DepthHub, type DepthSink } from './hub.js';
import { DepthPoller } from './poller.js';
import type { DepthSource } from './source.js';

const MARKET = 'BTC-USDT';
const OTHER = 'ETH-USDT';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function snapshot(marketId: string, sequence: number): DepthSnapshot {
  return { type: 'snapshot', marketId, sequence, bids: [['100', '1']], asks: [['101', '1']] };
}

class RecordingSink implements DepthSink {
  readonly frames: string[] = [];
  bufferedBytes = 0;
  send(frame: string): void {
    this.frames.push(frame);
  }
  close(): void {
    /* no-op */
  }
}

class CountingSource implements DepthSource {
  readonly calls: string[] = [];
  sequence = 10;
  failNext = false;

  async markets(): Promise<readonly string[]> {
    return [MARKET, OTHER];
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    this.calls.push(marketId);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('svc-matching unreachable');
    }
    return snapshot(marketId, (this.sequence += 1));
  }
}

const log = { info: vi.fn(), warn: vi.fn() };

function rig() {
  const source = new CountingSource();
  const hub = new DepthHub(source, {
    depthLimit: 50,
    highWaterBytes: 1_000,
    maxLagTicks: 5,
    maxConnections: 10,
    marketsRefreshMs: 0,
  });
  const poller = new DepthPoller(source, hub, { intervalMs: 1_000, depthLimit: 50, marketsRefreshMs: 30_000 }, log);
  return { source, hub, poller };
}

describe('DepthPoller', () => {
  it('polls only markets that someone is subscribed to', async () => {
    const { source, hub, poller } = rig();
    hub.attach(MARKET, new RecordingSink());
    await settle();
    source.calls.length = 0;

    await poller.tick();

    // ETH has no subscriber. A gateway that polled every listed market would be
    // a recorder, and would cost svc-matching a request per market forever.
    expect(source.calls).toEqual([MARKET]);
  });

  it('does nothing at all when nobody is watching', async () => {
    const { source, poller } = rig();
    await poller.tick();
    expect(source.calls).toEqual([]);
  });

  it('keeps serving the last good book when one poll fails', async () => {
    const { source, hub, poller } = rig();
    const sink = new RecordingSink();
    hub.attach(MARKET, sink);
    await settle();
    const before = sink.frames.length;

    source.failNext = true;
    await poller.tick();

    // No teardown, no close: the client's book is still valid as of its last
    // sequence, and the next tick either advances it or the socket dies itself.
    expect(sink.frames.length).toBe(before);
    expect(hub.connections).toBe(1);
    expect(log.warn).toHaveBeenCalled();

    await poller.tick();
    expect(sink.frames.length).toBeGreaterThan(before);
  });

  it('does not stack overlapping sweeps when the upstream is slow', async () => {
    const { source, hub, poller } = rig();
    hub.attach(MARKET, new RecordingSink());
    await settle();
    source.calls.length = 0;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = source.snapshot.bind(source);
    source.snapshot = async (marketId: string) => {
      await gate;
      return original(marketId);
    };

    const first = poller.tick();
    await poller.tick(); // returns immediately — a sweep is already running
    release();
    await first;

    expect(source.calls).toEqual([MARKET]);
  });
});
