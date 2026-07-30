/**
 * TRANSPORT PORTS — the seam that makes a venue adapter testable.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE PORTS EXIST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An adapter that calls `fetch` and `new WebSocket` directly can only be tested
 * against the real venue. That sounds rigorous and is the opposite: the cases
 * worth testing are the ones a healthy venue never produces on demand — a
 * dropped depth update, a 429 with a Retry-After, a socket that closes
 * mid-stream, a payload that starts arriving as JSON numbers. You cannot ask
 * Binance to drop a sequence for you.
 *
 * So the venue is behind two tiny interfaces, and the tests drive them. The real
 * implementations are at the bottom of this file and are the only place in the
 * fabric that touches the network.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NO WEBSOCKET DEPENDENCY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `webSocketStreamPort` uses the platform's global `WebSocket` (Node 22+) rather
 * than pulling in a client library. Doctrine 5, and one fewer package in the
 * money path. On a runtime without it, the factory throws with the actual
 * requirement named — it does NOT fall back to polling, because a polled book is
 * exactly the thing §27 is built to avoid and a silent downgrade to it would be
 * invisible in every metric we have.
 */

export interface HttpResponse {
  readonly status: number;
  /** Already JSON-parsed. `null` when the body was empty or unparseable. */
  readonly body: unknown;
  /** Case-insensitive lookup. `Retry-After` is the one that matters here. */
  header(name: string): string | null;
}

export interface HttpPort {
  get(url: string, signal?: AbortSignal): Promise<HttpResponse>;
}

export interface StreamHandle {
  /** Raw frames, already JSON-parsed, in arrival order. Ends when the socket closes. */
  readonly messages: AsyncIterable<unknown>;
  close(): Promise<void>;
}

export interface StreamPort {
  open(url: string): Promise<StreamHandle>;
}

/**
 * A bounded async queue bridging a callback-driven socket to `for await`.
 *
 * Bounded because an unbounded one is a memory leak with a market-shaped
 * trigger: the frames arrive fastest exactly when the consumer is slowest. On
 * overflow the queue FAILS rather than dropping frames — a dropped depth frame
 * is a sequence gap the consumer would detect, but a queue that quietly ate it
 * would have turned a backpressure problem into a market-data problem, and the
 * resulting resnapshot storm would look like the venue's fault.
 */
export class AsyncFrameQueue<T> {
  readonly #buffer: T[] = [];
  readonly #waiting: ((result: IteratorResult<T>) => void)[] = [];
  readonly #capacity: number;
  #closed = false;
  #error: Error | null = null;

  constructor(capacity = 4_096) {
    this.#capacity = capacity;
  }

  push(value: T): void {
    if (this.#closed) return;
    const waiter = this.#waiting.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    if (this.#buffer.length >= this.#capacity) {
      this.fail(
        new Error(
          `stream backlog exceeded ${this.#capacity} frames — the consumer cannot keep up. ` +
            'Failing rather than dropping frames: a silently dropped frame is a sequence gap ' +
            'that would be blamed on the venue.',
        ),
      );
      return;
    }
    this.#buffer.push(value);
  }

  fail(error: Error): void {
    if (this.#closed) return;
    this.#error = error;
    this.close();
  }

  close(): void {
    this.#closed = true;
    while (this.#waiting.length > 0) {
      this.#waiting.shift()?.({ value: undefined as never, done: true });
    }
  }

  get closed(): boolean {
    return this.#closed;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.#buffer.length > 0) {
        yield this.#buffer.shift() as T;
        continue;
      }
      if (this.#closed) {
        if (this.#error) throw this.#error;
        return;
      }
      const next = await new Promise<IteratorResult<T>>((resolve) => this.#waiting.push(resolve));
      if (next.done) {
        if (this.#error) throw this.#error;
        return;
      }
      yield next.value;
    }
  }
}

/** The real HTTP port. Uses the platform `fetch`; parses JSON, never throws on a non-2xx. */
export function fetchHttpPort(): HttpPort {
  return {
    async get(url, signal) {
      // A non-2xx is DATA here, not an exception. 429 and 418 carry the venue's
      // own instruction about when to come back, and an adapter that let them
      // throw would lose it — then keep asking, and get banned.
      const response = await fetch(url, signal ? { signal } : {});
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return {
        status: response.status,
        body,
        header: (name: string) => response.headers.get(name),
      };
    },
  };
}

/** The real WS port. Requires a runtime with a global `WebSocket` (Node 22+). */
export function webSocketStreamPort(capacity = 4_096): StreamPort {
  return {
    async open(url) {
      const Ctor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (!Ctor) {
        throw new Error(
          'no global WebSocket in this runtime (Node 22+ required). ' +
            'The fabric will NOT fall back to polling a book — a polled book has an invisible age ' +
            'and no sequence numbers to gap-check (§27).',
        );
      }

      const queue = new AsyncFrameQueue<unknown>(capacity);
      const socket = new Ctor(url);

      socket.onmessage = (event: MessageEvent) => {
        try {
          queue.push(JSON.parse(String(event.data)));
        } catch (error) {
          queue.fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
      socket.onerror = () => queue.fail(new Error(`websocket error on ${url}`));
      socket.onclose = () => queue.close();

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onclose = () => {
          queue.close();
          reject(new Error(`websocket to ${url} closed before it opened`));
        };
      });
      // Re-install the steady-state close handler; the one above only guards the
      // open handshake.
      socket.onclose = () => queue.close();

      return {
        messages: queue,
        async close() {
          queue.close();
          socket.close();
        },
      };
    },
  };
}
