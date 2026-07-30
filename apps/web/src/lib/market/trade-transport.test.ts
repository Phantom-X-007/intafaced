import { describe, expect, it } from 'vitest';
import type { TradePrint } from '@intafaced/market-data';
import { tradesStreamUrl, WsTradeTransport, type TradeSocketLike } from './trade-transport';

const MARKET = 'BTC-USDT';

function print(sequence: number, overrides: Partial<TradePrint> = {}): TradePrint {
  return {
    type: 'trade',
    marketId: MARKET,
    sequence,
    price: '100.5',
    quantity: '0.01',
    ts: '2026-07-30T12:00:00.000Z',
    ...overrides,
  };
}

class FakeSocket implements TradeSocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  closedByClient = false;

  constructor(readonly url: string) {}

  open(): void {
    this.onopen?.({});
  }

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

function rig() {
  const sockets: FakeSocket[] = [];
  const transport = new WsTradeTransport({
    origin: 'http://localhost:4014',
    openSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return {
    transport,
    socket: () => sockets.at(-1)!,
  };
}

describe('WsTradeTransport — URLs', () => {
  it('derives the socket URL with channel=trades and upgrades the scheme', () => {
    expect(tradesStreamUrl('http://localhost:4014', MARKET)).toBe('ws://localhost:4014/stream?market=BTC-USDT&channel=trades');
    expect(tradesStreamUrl('https://ws.example.com', MARKET)).toBe('wss://ws.example.com/stream?market=BTC-USDT&channel=trades');
  });

  it('encodes the market rather than pasting it into a URL', () => {
    expect(tradesStreamUrl('http://localhost:4014', 'BTC/USDT')).toContain('market=BTC%2FUSDT');
    expect(tradesStreamUrl('http://localhost:4014', 'BTC/USDT')).toContain('channel=trades');
  });

  it('refuses a scheme it cannot open a socket to', () => {
    expect(() => tradesStreamUrl('ftp://localhost:4014', MARKET)).toThrow(/http\(s\)/);
  });
});

describe('WsTradeTransport — what it will accept as a print', () => {
  it('delivers well-formed TradePrint frames and refuses everything else', () => {
    const r = rig();
    const prints: TradePrint[] = [];
    const errors: string[] = [];
    let opened = 0;

    r.transport.subscribe(
      MARKET,
      (p) => prints.push(p),
      (e) => errors.push(e.message),
      () => {
        opened += 1;
      },
    );

    r.socket().open();
    r.socket().emit(print(10));
    r.socket().emit(print(11, { price: '101', quantity: '0.5' }));
    r.socket().emitRaw('}{ not json');
    // JSON number where a decimal string belongs — the float that must never land.
    r.socket().emit({ type: 'trade', marketId: MARKET, sequence: 12, price: 100.5, quantity: '1', ts: 'x' });
    r.socket().emit({ type: 'delta', marketId: MARKET, sequence: 13 });

    expect(opened).toBe(1);
    expect(prints).toHaveLength(2);
    expect(prints[0]).toMatchObject({ type: 'trade', sequence: 10, price: '100.5' });
    expect(prints[1]).toMatchObject({ sequence: 11, price: '101', quantity: '0.5' });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/not JSON/);
    expect(errors[1]).toMatch(/does not understand/);
    expect(errors[2]).toMatch(/does not understand/);
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

    expect(errors[0]).toContain('slow consumer');
  });

  it('goes quiet and closes the socket on unsubscribe', () => {
    const r = rig();
    const prints: unknown[] = [];
    const errors: unknown[] = [];
    const unsubscribe = r.transport.subscribe(
      MARKET,
      (p) => prints.push(p),
      (e) => errors.push(e),
    );

    unsubscribe();
    r.socket().serverClose(1000, 'normal');

    expect(r.socket().closedByClient).toBe(true);
    // A close we asked for is not an error, and must not paint the panel red.
    expect(errors).toEqual([]);
    expect(prints).toEqual([]);
  });

  it('reports a bad origin as an error rather than throwing out of the caller', () => {
    const transport = new WsTradeTransport({
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
