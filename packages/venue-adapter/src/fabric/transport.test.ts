import { describe, expect, it } from 'vitest';
import { webSocketStreamPort } from './transport.js';

/**
 * THE REAL WS PORT — the one place in the fabric that touches a socket.
 *
 * Every adapter test drives a fake `StreamPort`, which is the point of the seam
 * and also its blind spot: the REAL port was reachable only from production, so
 * a missing method on it would have been caught by nothing. That mattered the
 * moment `send` landed — a venue that subscribes by message needs it, and a
 * fake that provides it proves nothing about the port that does not.
 *
 * A fake global `WebSocket` is the only way to exercise this without a network,
 * and §27 has no live-network CI.
 */

class FakeSocket {
  static last: FakeSocket | null = null;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  readonly sent: string[] = [];
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.last = this;
    // Deferred: the port installs `onopen` after construction, inside the
    // handshake promise. Resolving synchronously here would beat it.
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

/** Swap the global for one test, and always put it back. */
async function withFakeWebSocket(body: () => Promise<void>): Promise<void> {
  const slot = globalThis as { WebSocket?: unknown };
  const original = slot.WebSocket;
  slot.WebSocket = FakeSocket;
  try {
    await body();
  } finally {
    if (original === undefined) delete slot.WebSocket;
    else slot.WebSocket = original;
  }
}

describe('webSocketStreamPort', () => {
  it('SENDS what it is given, JSON-encoded — the seam a message-subscribed venue needs', async () => {
    await withFakeWebSocket(async () => {
      const handle = await webSocketStreamPort().open('wss://ws.test/v5/public/spot');

      expect(typeof handle.send).toBe('function');

      await handle.send?.({ op: 'subscribe', args: ['orderbook.50.BTCUSDT'] });
      await handle.send?.({ op: 'ping' });

      expect(FakeSocket.last!.url).toBe('wss://ws.test/v5/public/spot');
      expect(FakeSocket.last!.sent).toEqual(['{"op":"subscribe","args":["orderbook.50.BTCUSDT"]}', '{"op":"ping"}']);

      await handle.close();
      expect(FakeSocket.last!.closed).toBe(true);
    });
  });

  it('sends a string payload as-is — OKX ping is four characters, not JSON', async () => {
    await withFakeWebSocket(async () => {
      const handle = await webSocketStreamPort().open('wss://ws.okx.com:8443/ws/v5/public');
      await handle.send?.('ping');
      expect(FakeSocket.last!.sent).toEqual(['ping']);
      expect(FakeSocket.last!.sent[0]).not.toBe('"ping"');
      await handle.close();
    });
  });

  it('parses inbound frames and ends the iterable when the socket closes', async () => {
    await withFakeWebSocket(async () => {
      const handle = await webSocketStreamPort().open('wss://ws.test/v5/public/spot');
      const socket = FakeSocket.last!;

      socket.onmessage?.({ data: '{"topic":"orderbook.50.BTCUSDT","type":"delta"}' });
      socket.onclose?.();

      const frames = [];
      for await (const frame of handle.messages) frames.push(frame);
      expect(frames).toEqual([{ topic: 'orderbook.50.BTCUSDT', type: 'delta' }]);
    });
  });

  it('yields a non-JSON inbound frame as the raw string — OKX pong must not fail the stream', async () => {
    await withFakeWebSocket(async () => {
      const handle = await webSocketStreamPort().open('wss://ws.okx.com:8443/ws/v5/public');
      const socket = FakeSocket.last!;

      socket.onmessage?.({ data: 'pong' });
      socket.onclose?.();

      const frames = [];
      for await (const frame of handle.messages) frames.push(frame);
      expect(frames).toEqual(['pong']);
    });
  });

  it('REFUSES a runtime with no WebSocket rather than falling back to polling', async () => {
    const slot = globalThis as { WebSocket?: unknown };
    const original = slot.WebSocket;
    delete slot.WebSocket;
    try {
      await expect(webSocketStreamPort().open('wss://ws.test')).rejects.toThrow(/NOT fall back to polling/);
    } finally {
      if (original !== undefined) slot.WebSocket = original;
    }
  });
});
