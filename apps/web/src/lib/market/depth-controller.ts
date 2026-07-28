import {
  applyDelta,
  bookFromSnapshot,
  type DepthBook,
  type DepthDelta,
  type DepthMessage,
  type DepthSnapshot,
} from '@intafaced/market-data';

/**
 * THE BOOK STATE MACHINE — snapshot, deltas, and what to do when they do not
 * line up.
 *
 * `@intafaced/market-data` refuses a delta that does not continue the book it is
 * given and returns `{ ok: false, reason: 'gap' }`. That refusal is only worth
 * something if the client acts on it, so this is the client that acts on it:
 *
 *   gap   → DROP the delta, STOP SERVING THE BOOK, fetch a new snapshot.
 *   stale → drop it and carry on. Re-delivery is normal on a reconnect, and
 *           treating it as a gap is how a client ends up in a resnapshot loop.
 *   wrong-market → drop it. Somebody else's stream is not our problem.
 *
 * ── Why the book is WITHHELD during a resnapshot, not merely flagged ────────
 *
 * The obvious implementation keeps rendering the last good book with a small
 * "reconnecting" dot. That is the failure this whole module exists to prevent:
 * the numbers on screen are stale, they still look like prices, and a trader
 * acts on them. `DepthState` has no variant that carries a book the controller
 * knows to be behind — during a resnapshot the panel has nothing to draw and
 * must say so.
 *
 * ── Deltas that arrive while a snapshot is in flight ───────────────────────
 *
 * They are buffered, not dropped. A snapshot takes a round trip; the stream
 * does not pause for it. On arrival, buffered deltas at or below the snapshot's
 * sequence are discarded (already included) and the rest are applied in order.
 * If the first survivor still does not continue the snapshot, that is another
 * gap and the whole thing repeats — bounded, see `maxConsecutiveResnapshots`,
 * because a stream that gaps every time is broken and saying so beats hammering
 * it.
 */

export interface DepthTransport {
  /** A full book, current as of some engine sequence. */
  snapshot(marketId: string, signal?: AbortSignal): Promise<DepthSnapshot>;
  /** Push channel. Returns its own unsubscribe. */
  subscribe(marketId: string, onMessage: (message: DepthMessage) => void, onError: (err: Error) => void): () => void;
}

export type DepthState =
  /** Not started. */
  | { readonly status: 'idle' }
  /** First snapshot in flight. Nothing to draw yet, and nothing is claimed. */
  | { readonly status: 'connecting' }
  /** The book is current as of `book.sequence`. Safe to render. */
  | { readonly status: 'live'; readonly book: DepthBook; readonly resnapshots: number }
  /**
   * A gap was detected. The last book is deliberately NOT carried here: it is
   * behind the engine and there is no honest way to draw it.
   */
  | { readonly status: 'resnapshotting'; readonly reason: string; readonly resnapshots: number }
  /** Cannot be served at all. `reason` is rendered verbatim. */
  | { readonly status: 'unavailable'; readonly reason: string };

export interface DepthControllerOptions {
  readonly marketId: string;
  readonly transport: DepthTransport;
  /**
   * A stream that gaps this many times in a row is not recovering. Stopping and
   * saying so is more useful than an invisible retry storm.
   */
  readonly maxConsecutiveResnapshots?: number;
}

const DEFAULT_MAX_RESNAPSHOTS = 5;

export class DepthController {
  readonly #marketId: string;
  readonly #transport: DepthTransport;
  readonly #maxResnapshots: number;

  #state: DepthState = { status: 'idle' };
  #listeners = new Set<(state: DepthState) => void>();
  #unsubscribe: (() => void) | null = null;
  #abort: AbortController | null = null;
  #buffer: DepthDelta[] = [];
  #snapshotInFlight = false;
  #consecutiveResnapshots = 0;
  /** Total resnapshots this session — surfaced so a flaky stream is visible. */
  #resnapshots = 0;
  #stopped = false;

  constructor(options: DepthControllerOptions) {
    this.#marketId = options.marketId;
    this.#transport = options.transport;
    this.#maxResnapshots = options.maxConsecutiveResnapshots ?? DEFAULT_MAX_RESNAPSHOTS;
  }

  get state(): DepthState {
    return this.#state;
  }

  subscribe(listener: (state: DepthState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  start(): void {
    if (this.#unsubscribe || this.#stopped) return;

    this.#set({ status: 'connecting' });
    this.#unsubscribe = this.#transport.subscribe(
      this.#marketId,
      (message) => this.#onMessage(message),
      (err) => this.#set({ status: 'unavailable', reason: err.message }),
    );
    void this.#resnapshot('initial snapshot');
  }

  stop(): void {
    this.#stopped = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#abort?.abort();
    this.#abort = null;
    this.#buffer = [];
    this.#listeners.clear();
  }

  #set(next: DepthState): void {
    this.#state = next;
    for (const listener of this.#listeners) listener(next);
  }

  #onMessage(message: DepthMessage): void {
    if (this.#stopped) return;
    if (message.marketId !== this.#marketId) return;

    if (message.type === 'snapshot') {
      // An unsolicited snapshot is a free repair. Take it.
      this.#adopt(message);
      return;
    }

    if (this.#snapshotInFlight) {
      this.#buffer.push(message);
      return;
    }

    if (this.#state.status !== 'live') {
      // No book to apply to. Buffer rather than drop: the in-flight snapshot may
      // land at a sequence these still continue from.
      this.#buffer.push(message);
      return;
    }

    this.#applyOrResnapshot(this.#state.book, message);
  }

  #applyOrResnapshot(book: DepthBook, delta: DepthDelta): void {
    const result = applyDelta(book, delta);

    if (result.ok) {
      this.#consecutiveResnapshots = 0;
      this.#set({ status: 'live', book: result.book, resnapshots: this.#resnapshots });
      return;
    }

    if (result.reason === 'stale' || result.reason === 'wrong-market') {
      // Neither is a gap. Keep serving the book we have — it is not behind.
      return;
    }

    // Keep the delta that failed. If the snapshot lands at an EARLIER sequence
    // than this delta — which a cached or slow snapshot endpoint will do — this
    // is the one that carries the book forward again.
    this.#buffer.push(delta);
    void this.#resnapshot(`sequence gap: delta continues from ${result.got}, book is at ${result.expected}`);
  }

  async #resnapshot(reason: string): Promise<void> {
    if (this.#stopped || this.#snapshotInFlight) return;

    if (this.#consecutiveResnapshots >= this.#maxResnapshots) {
      this.#set({
        status: 'unavailable',
        reason: `depth stream gapped ${this.#consecutiveResnapshots} times in a row and did not recover`,
      });
      return;
    }

    this.#snapshotInFlight = true;
    if (this.#state.status === 'live' || this.#state.status === 'resnapshotting') {
      this.#resnapshots += 1;
      this.#consecutiveResnapshots += 1;
      this.#set({ status: 'resnapshotting', reason, resnapshots: this.#resnapshots });
    }

    this.#abort = new AbortController();
    try {
      const snapshot = await this.#transport.snapshot(this.#marketId, this.#abort.signal);
      this.#snapshotInFlight = false;
      if (this.#stopped) return;
      this.#adopt(snapshot);
    } catch (err) {
      this.#snapshotInFlight = false;
      if (this.#stopped) return;
      this.#set({ status: 'unavailable', reason: err instanceof Error ? err.message : 'snapshot failed' });
    }
  }

  /** Take a snapshot as truth, then drain whatever the stream sent meanwhile. */
  #adopt(snapshot: DepthSnapshot): void {
    if (snapshot.marketId !== this.#marketId) return;

    let book = bookFromSnapshot(snapshot);
    const buffered = this.#buffer.sort((a, b) => a.sequence - b.sequence);
    this.#buffer = [];

    for (const delta of buffered) {
      // Already inside the snapshot.
      if (delta.sequence <= book.sequence) continue;

      const result = applyDelta(book, delta);
      if (result.ok) {
        book = result.book;
        continue;
      }
      if (result.reason === 'stale' || result.reason === 'wrong-market') continue;

      // The buffer does not join up with the snapshot. Go round again rather
      // than serve a book with a hole in it.
      void this.#resnapshot(`buffered delta continues from ${result.got}, snapshot is at ${result.expected}`);
      return;
    }

    this.#consecutiveResnapshots = 0;
    this.#set({ status: 'live', book, resnapshots: this.#resnapshots });
  }
}
