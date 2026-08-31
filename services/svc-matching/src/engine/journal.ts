import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { OrderBook } from './book.js';
import type {
  AccountId,
  BookState,
  EngineAmend,
  EngineOrder,
  EngineOrderType,
  MarketId,
  OrderId,
  OrderSide,
  TimeInForce,
} from './types.js';

/**
 * THE ENGINE JOURNAL (§5.1).
 *
 * "Every input persisted to an append-only engine_journal before processing →
 *  full replay = current book state (recovery guarantee)."
 *
 * Two properties do all the work:
 *
 *   1. INPUTS ONLY. The journal records what was asked, never what happened.
 *      If it recorded outcomes, a replay would be a transcript rather than a
 *      proof — and a bug in the matcher would replay perfectly while the book
 *      stayed wrong. Replaying inputs through the same matcher is what makes
 *      the state verifiable.
 *
 *   2. BEFORE PROCESSING. The record is durable before the book moves. A crash
 *      between the two costs a **replay of that input into an empty book**
 *      (recovery rebuilds once from the journal; it does not re-emit bus
 *      events). Safety is **not** "duplicate_order_id on live re-submit" —
 *      that guard only covers **still-live** resting/stop ids (README).
 *      Never-rests markets and fully filled ids are reusable by design; a
 *      second live submit of the same id after the order is gone is a new
 *      trade-side concern, not journal crash safety. A crash the other way
 *      (book moved before journal) would cost a fill nobody can reconstruct.
 *
 * Amounts are decimal strings on disk. A journal is read years after it is
 * written, by processes that may not share this build — a scaled bigint is our
 * private representation, not an archival format.
 */

export interface WireOrder {
  readonly orderId: OrderId;
  readonly accountId: string;
  readonly type: EngineOrderType;
  readonly side: OrderSide;
  readonly qty: string;
  readonly price: string | null;
  readonly stopPrice: string | null;
  readonly tif: TimeInForce;
  readonly ocoSiblingId?: string;
  readonly expireAt?: string;
  /** Caller session for cancel-on-disconnect. Absent when untagged. Never invented. */
  readonly sessionId?: string;
  readonly reduceOnly?: boolean;
  readonly displayQty?: string | null;
  readonly iceberg?: boolean;
  /** Trail distance. Absent when the rest is not a trailing stop. */
  readonly trail?: string | null;
  /** Injected mark the trail walks with. Absent when not supplied. */
  readonly mark?: string | null;
  /** Strike. Absent when the rest is not an option. */
  readonly strike?: string | null;
  /** Expiry. Absent when the rest is not an option. */
  readonly expiry?: string | null;
  /** Exercise a long. Absent when not an exercise. Replay must still refuse missing strike/expiry. */
  readonly exercise?: boolean;
  /** Minimum fill qty. Absent when not set. */
  readonly minQty?: string | null;
  /** All-or-none. Absent when not set. */
  readonly aon?: boolean;
  /** Pegged. Absent when not set. Replay binds reference + offset; missing those refuses. */
  readonly peg?: boolean;
  /** Midpoint. Absent when not set. Replay must still refuse. */
  readonly midpoint?: boolean;
  /** Relative. Absent when not set. Replay binds reference + offset; missing those refuses. */
  readonly relative?: boolean;
  /** Caller reference for peg/relative. Absent when not supplied. */
  readonly reference?: string | null;
  /** Caller offset for peg/relative. Absent when not supplied. */
  readonly offset?: string | null;
  /** Auction. Absent when not set. Replay must still refuse. */
  readonly auction?: boolean;
  /** Benchmark. Absent when not set. Replay must still refuse. */
  readonly benchmark?: boolean;
  /** Price collar. Absent when not set. Replay must still refuse a missing band. */
  readonly collar?: boolean;
  /** Caller collar min. Absent when not supplied. */
  readonly min?: string | null;
  /** Caller collar max. Absent when not supplied. */
  readonly max?: string | null;
  /** Caller min notional. Absent when not requested. Replay must still refuse a missing notional. */
  readonly minNotional?: string | null;
  /** Exact PX-S01 admission evidence for new HTTP submissions. */
  readonly lifecycleProof?: MarketLifecycleAdmissionProof;
}

export interface WireAmendPatch {
  readonly qty?: string;
  readonly price?: string;
  readonly stopPrice?: string;
  readonly tif?: TimeInForce;
}

export type JournalCommand =
  | {
      readonly kind: 'submit';
      readonly marketId: MarketId;
      /** Wall clock at admission. Journalled because event payloads carry it — the book never reads it. */
      readonly at: string;
      readonly order: WireOrder;
    }
  | { readonly kind: 'cancel'; readonly marketId: MarketId; readonly at: string; readonly orderId: OrderId }
  | {
      readonly kind: 'mass_cancel';
      readonly marketId: MarketId;
      readonly at: string;
      readonly accountId: AccountId;
      /** Absent on older journals — replay cancels both sides. */
      readonly side?: OrderSide;
    }
  | {
      readonly kind: 'amend';
      readonly marketId: MarketId;
      readonly at: string;
      readonly orderId: OrderId;
      readonly expectedVersion: number;
      readonly patch: WireAmendPatch;
      readonly lifecycleProof?: MarketLifecycleAdmissionProof;
    }
  | {
      readonly kind: 'halt';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'resume';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'reduce_only';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'resume_reduce_only';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'post_only';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'resume_post_only';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'prelaunch';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'open';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'expire';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'delist';
      readonly marketId: MarketId;
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'halt_all';
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'resume_all';
      readonly at: string;
      readonly operatorId: string;
    }
  | {
      readonly kind: 'session_dead';
      readonly at: string;
      readonly sessionId: string;
    };

export type JournalRecord = JournalCommand & { readonly seq: number };

export interface EngineJournal {
  /** Append and make durable. Returns the record with its assigned position. */
  append(command: JournalCommand): JournalRecord;
  read(): readonly JournalRecord[];
  readonly length: number;
  close(): void;
}

// ── Conversions ───────────────────────────────────────────

function persistIceberg(order: { readonly iceberg?: boolean; readonly displayQty?: string | null | unknown }): boolean {
  return order.iceberg === true || order.displayQty !== undefined;
}

function persistTrail(order: { readonly trail?: unknown }): boolean {
  return order.trail !== undefined;
}

function persistStrike(order: { readonly strike?: unknown }): boolean {
  return order.strike !== undefined;
}

function persistExpiry(order: { readonly expiry?: unknown }): boolean {
  return order.expiry !== undefined;
}

function persistExercise(order: { readonly exercise?: unknown }): boolean {
  return order.exercise === true;
}

function persistMinQty(order: { readonly minQty?: unknown }): boolean {
  return order.minQty !== undefined;
}

function persistAon(order: { readonly aon?: unknown }): boolean {
  return order.aon !== undefined;
}

function persistPeg(order: { readonly peg?: unknown }): boolean {
  return order.peg !== undefined;
}

function persistMidpoint(order: { readonly midpoint?: unknown }): boolean {
  return order.midpoint !== undefined;
}

function persistRelative(order: { readonly relative?: unknown }): boolean {
  return order.relative !== undefined;
}

function persistReference(order: { readonly reference?: unknown }): boolean {
  return order.reference !== undefined;
}

function persistOffset(order: { readonly offset?: unknown }): boolean {
  return order.offset !== undefined;
}

function persistAuction(order: { readonly auction?: unknown }): boolean {
  return order.auction !== undefined;
}

function persistBenchmark(order: { readonly benchmark?: unknown }): boolean {
  return order.benchmark !== undefined;
}

function persistCollar(order: { readonly collar?: unknown }): boolean {
  return order.collar !== undefined;
}

function persistMin(order: { readonly min?: unknown }): boolean {
  return order.min !== undefined;
}

function persistMax(order: { readonly max?: unknown }): boolean {
  return order.max !== undefined;
}

function persistMinNotional(order: { readonly minNotional?: unknown }): boolean {
  return order.minNotional !== undefined;
}

export function toWire(order: EngineOrder, lifecycleProof?: MarketLifecycleAdmissionProof): WireOrder {
  return {
    orderId: order.orderId,
    accountId: order.accountId,
    type: order.type,
    side: order.side,
    qty: formatAmount(order.qty),
    price: order.price === null ? null : formatAmount(order.price),
    stopPrice: order.stopPrice === null ? null : formatAmount(order.stopPrice),
    tif: order.tif,
    ...(order.ocoSiblingId ? { ocoSiblingId: order.ocoSiblingId } : {}),
    ...(order.expireAt ? { expireAt: order.expireAt } : {}),
    ...(order.sessionId ? { sessionId: order.sessionId } : {}),
    ...(order.reduceOnly ? { reduceOnly: true } : {}),
    ...(persistIceberg(order) ? { iceberg: true, displayQty: order.displayQty == null ? null : formatAmount(order.displayQty) } : {}),
    ...(persistTrail(order)
      ? {
          trail: order.trail == null ? null : formatAmount(order.trail),
          ...(order.mark !== undefined ? { mark: order.mark == null ? null : formatAmount(order.mark) } : {}),
        }
      : {}),
    ...(persistStrike(order) ? { strike: order.strike == null ? null : formatAmount(order.strike) } : {}),
    ...(persistExpiry(order) ? { expiry: order.expiry == null ? null : order.expiry } : {}),
    ...(persistExercise(order) ? { exercise: true } : {}),
    ...(persistMinQty(order) ? { minQty: order.minQty == null ? null : formatAmount(order.minQty) } : {}),
    ...(persistAon(order) ? { aon: order.aon === true } : {}),
    ...(persistPeg(order) ? { peg: order.peg === true } : {}),
    ...(persistMidpoint(order) ? { midpoint: order.midpoint === true } : {}),
    ...(persistRelative(order) ? { relative: order.relative === true } : {}),
    ...(persistReference(order) ? { reference: order.reference == null ? null : formatAmount(order.reference) } : {}),
    ...(persistOffset(order) ? { offset: order.offset == null ? null : formatAmount(order.offset) } : {}),
    ...(persistAuction(order) ? { auction: order.auction === true } : {}),
    ...(persistBenchmark(order) ? { benchmark: order.benchmark === true } : {}),
    ...(persistCollar(order) ? { collar: order.collar === true } : {}),
    ...(persistMin(order) ? { min: order.min == null ? null : formatAmount(order.min) } : {}),
    ...(persistMax(order) ? { max: order.max == null ? null : formatAmount(order.max) } : {}),
    ...(persistMinNotional(order) ? { minNotional: order.minNotional == null ? null : formatAmount(order.minNotional) } : {}),
    lifecycleProof,
  };
}

export function fromWire(order: WireOrder): EngineOrder {
  return {
    orderId: order.orderId,
    accountId: order.accountId,
    type: order.type,
    side: order.side,
    qty: parseAmount(order.qty),
    price: order.price === null ? null : parseAmount(order.price),
    stopPrice: order.stopPrice === null ? null : parseAmount(order.stopPrice),
    tif: order.tif,
    ...(order.ocoSiblingId ? { ocoSiblingId: order.ocoSiblingId } : {}),
    ...(order.expireAt ? { expireAt: order.expireAt } : {}),
    ...(order.sessionId ? { sessionId: order.sessionId } : {}),
    ...(order.reduceOnly ? { reduceOnly: true } : {}),
    ...(persistIceberg(order) ? { iceberg: true, displayQty: order.displayQty == null ? null : parseAmount(order.displayQty) } : {}),
    ...(persistTrail(order)
      ? {
          trail: order.trail == null ? null : parseAmount(order.trail),
          ...(order.mark !== undefined ? { mark: order.mark == null ? null : parseAmount(order.mark) } : {}),
        }
      : {}),
    ...(persistStrike(order) ? { strike: order.strike == null ? null : parseAmount(order.strike) } : {}),
    ...(persistExpiry(order) ? { expiry: order.expiry == null ? null : order.expiry } : {}),
    ...(persistExercise(order) ? { exercise: true } : {}),
    ...(persistMinQty(order) ? { minQty: order.minQty == null ? null : parseAmount(order.minQty) } : {}),
    ...(persistAon(order) ? { aon: order.aon === true } : {}),
    ...(persistPeg(order) ? { peg: order.peg === true } : {}),
    ...(persistMidpoint(order) ? { midpoint: order.midpoint === true } : {}),
    ...(persistRelative(order) ? { relative: order.relative === true } : {}),
    ...(persistReference(order) ? { reference: order.reference == null ? null : parseAmount(order.reference) } : {}),
    ...(persistOffset(order) ? { offset: order.offset == null ? null : parseAmount(order.offset) } : {}),
    ...(persistAuction(order) ? { auction: order.auction === true } : {}),
    ...(persistBenchmark(order) ? { benchmark: order.benchmark === true } : {}),
    ...(persistCollar(order) ? { collar: order.collar === true } : {}),
    ...(persistMin(order) ? { min: order.min == null ? null : parseAmount(order.min) } : {}),
    ...(persistMax(order) ? { max: order.max == null ? null : parseAmount(order.max) } : {}),
    ...(persistMinNotional(order) ? { minNotional: order.minNotional == null ? null : parseAmount(order.minNotional) } : {}),
  };
}

export function toWireAmend(cmd: EngineAmend): WireAmendPatch {
  return {
    ...(cmd.qty !== undefined ? { qty: formatAmount(cmd.qty) } : {}),
    ...(cmd.price !== undefined ? { price: formatAmount(cmd.price) } : {}),
    ...(cmd.stopPrice !== undefined ? { stopPrice: formatAmount(cmd.stopPrice) } : {}),
    ...(cmd.tif !== undefined ? { tif: cmd.tif } : {}),
  };
}

export function fromWireAmend(orderId: OrderId, expectedVersion: number, patch: WireAmendPatch): EngineAmend {
  return {
    orderId,
    expectedVersion,
    ...(patch.qty !== undefined ? { qty: parseAmount(patch.qty) } : {}),
    ...(patch.price !== undefined ? { price: parseAmount(patch.price) } : {}),
    ...(patch.stopPrice !== undefined ? { stopPrice: parseAmount(patch.stopPrice) } : {}),
    ...(patch.tif !== undefined ? { tif: patch.tif } : {}),
  };
}

/** Fixed key order — two equal records must serialise to identical bytes. */
function encode(record: JournalRecord): string {
  if (record.kind === 'submit') {
    const o = record.order;
    return JSON.stringify({
      seq: record.seq,
      kind: record.kind,
      marketId: record.marketId,
      at: record.at,
      order: {
        orderId: o.orderId,
        accountId: o.accountId,
        type: o.type,
        side: o.side,
        qty: o.qty,
        price: o.price,
        stopPrice: o.stopPrice,
        tif: o.tif,
        ...(o.ocoSiblingId ? { ocoSiblingId: o.ocoSiblingId } : {}),
        ...(o.expireAt ? { expireAt: o.expireAt } : {}),
        ...(o.sessionId ? { sessionId: o.sessionId } : {}),
        ...(o.reduceOnly ? { reduceOnly: true } : {}),
        ...(persistIceberg(o) ? { iceberg: true, displayQty: o.displayQty == null ? null : o.displayQty } : {}),
        ...(persistTrail(o) ? { trail: o.trail == null ? null : o.trail, ...(o.mark !== undefined ? { mark: o.mark } : {}) } : {}),
        ...(persistStrike(o) ? { strike: o.strike == null ? null : o.strike } : {}),
        ...(persistExpiry(o) ? { expiry: o.expiry == null ? null : o.expiry } : {}),
        ...(persistExercise(o) ? { exercise: true } : {}),
        ...(persistMinQty(o) ? { minQty: o.minQty == null ? null : o.minQty } : {}),
        ...(persistAon(o) ? { aon: o.aon === true } : {}),
        ...(persistPeg(o) ? { peg: o.peg === true } : {}),
        ...(persistMidpoint(o) ? { midpoint: o.midpoint === true } : {}),
        ...(persistRelative(o) ? { relative: o.relative === true } : {}),
        ...(persistReference(o) ? { reference: o.reference == null ? null : o.reference } : {}),
        ...(persistOffset(o) ? { offset: o.offset == null ? null : o.offset } : {}),
        ...(persistCollar(o) ? { collar: o.collar === true } : {}),
        ...(persistMin(o) ? { min: o.min == null ? null : o.min } : {}),
        ...(persistMax(o) ? { max: o.max == null ? null : o.max } : {}),
        ...(persistMinNotional(o) ? { minNotional: o.minNotional == null ? null : o.minNotional } : {}),
        lifecycleProof: o.lifecycleProof,
      },
    });
  }

  if (record.kind === 'amend') {
    const p = record.patch;
    const patch: WireAmendPatch = {
      ...(p.qty !== undefined ? { qty: p.qty } : {}),
      ...(p.price !== undefined ? { price: p.price } : {}),
      ...(p.stopPrice !== undefined ? { stopPrice: p.stopPrice } : {}),
      ...(p.tif !== undefined ? { tif: p.tif } : {}),
    };
    return JSON.stringify({
      seq: record.seq,
      kind: record.kind,
      marketId: record.marketId,
      at: record.at,
      orderId: record.orderId,
      expectedVersion: record.expectedVersion,
      patch,
      lifecycleProof: record.lifecycleProof,
    });
  }

  if (record.kind === 'mass_cancel') {
    return JSON.stringify({
      seq: record.seq,
      kind: record.kind,
      marketId: record.marketId,
      at: record.at,
      accountId: record.accountId,
      ...(record.side ? { side: record.side } : {}),
    });
  }

  if (record.kind === 'halt_all' || record.kind === 'resume_all') {
    return JSON.stringify({
      seq: record.seq,
      kind: record.kind,
      at: record.at,
      operatorId: record.operatorId,
    });
  }

  if (record.kind === 'session_dead') {
    return JSON.stringify({
      seq: record.seq,
      kind: record.kind,
      at: record.at,
      sessionId: record.sessionId,
    });
  }

  if (
    record.kind === 'halt' ||
    record.kind === 'resume' ||
    record.kind === 'reduce_only' ||
    record.kind === 'resume_reduce_only' ||
    record.kind === 'post_only' ||
    record.kind === 'resume_post_only' ||
    record.kind === 'prelaunch' ||
    record.kind === 'open' ||
    record.kind === 'expire' ||
    record.kind === 'delist'
  ) {
    return JSON.stringify({
      seq: record.seq,
      kind: record.kind,
      marketId: record.marketId,
      at: record.at,
      operatorId: record.operatorId,
    });
  }

  return JSON.stringify({ seq: record.seq, kind: record.kind, marketId: record.marketId, at: record.at, orderId: record.orderId });
}

// ── Implementations ──────────────────────────────────────────────

/** For tests and single-process dev. Durable only for the life of the process. */
export class MemoryJournal implements EngineJournal {
  private readonly records: JournalRecord[] = [];

  append(command: JournalCommand): JournalRecord {
    const record = { ...command, seq: this.records.length + 1 } as JournalRecord;
    this.records.push(record);
    return record;
  }

  read(): readonly JournalRecord[] {
    return this.records;
  }

  get length(): number {
    return this.records.length;
  }

  close(): void {
    // Nothing to release.
  }
}

/**
 * Append-only NDJSON on disk, fsync'd per record.
 *
 * The fsync is the whole point and it is not negotiable: an input that is only
 * in the page cache is an input the recovery guarantee does not cover. This
 * costs throughput, which is why §5.1 marks the engine for a Rust port rather
 * than asking this file to be clever.
 *
 * SOCKET §13 — durable journal transport. A replicated log (Postgres
 * `matching.engine_journal`, or a JetStream work queue) replaces this class
 * without touching `EngineJournal`'s three methods when the engine goes
 * multi-replica.
 */
export class FileJournal implements EngineJournal {
  private readonly fd: number;
  private records: JournalRecord[];

  constructor(readonly path: string) {
    /**
     * Crash mid-write can leave a partial last NDJSON line. `decodeAll` skips
     * that residue so recovery can boot (#1520). But the torn bytes still sit
     * on disk — opening O_APPEND without rewriting would glue the next durable
     * append onto the tear, so a later boot either drops a real record or
     * throws mid-file corruption and refuses recovery. Rewrite the decoded
     * records as the clean durable body before any further append.
     */
    this.records = existsSync(path) ? decodeAll(readFileSync(path, 'utf8')) : [];
    rewriteClean(path, this.records);
    this.fd = openSync(path, 'a');
  }

  append(command: JournalCommand): JournalRecord {
    const record = { ...command, seq: this.records.length + 1 } as JournalRecord;
    const line = `${encode(record)}\n`;
    const expected = Buffer.byteLength(line, 'utf8');
    const written = writeSync(this.fd, line);
    if (written !== expected) {
      // Do not push to memory: a short write is not durable and must not look
      // like an admitted input. The process dies or the caller retries; either
      // way the on-disk body stays a complete prefix.
      throw new Error(`short journal write: wrote ${written} of ${expected} bytes at ${this.path}`);
    }
    fsyncSync(this.fd);
    this.records.push(record);
    return record;
  }

  read(): readonly JournalRecord[] {
    return this.records;
  }

  get length(): number {
    return this.records.length;
  }

  close(): void {
    closeSync(this.fd);
  }
}

/** Replace the file with exactly the durable records (no torn tail residue). */
function rewriteClean(path: string, records: readonly JournalRecord[]): void {
  const body = records.length === 0 ? '' : `${records.map((r) => encode(r)).join('\n')}\n`;
  writeFileSync(path, body, 'utf8');
  // writeFileSync does not fsync. Durability of the rewrite matters: if we
  // crash after truncating-away the partial line but before the clean body is
  // on stable storage, recovery still boots (empty or older complete prefix)
  // — never from glued garbage.
  const fd = openSync(path, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Decode an NDJSON journal body.
 *
 * A crash mid-write can leave a partial last line (write started, fsync never
 * finished). That is not corruption of history — it is an input that never
 * became durable, so recovery must skip it and boot. A broken line in the
 * middle of the file is real corruption and still throws.
 */
export function decodeAll(contents: string): JournalRecord[] {
  const lines = contents.split('\n');
  const records: JournalRecord[] = [];
  // Last element of split is often '' after a trailing newline — track the
  // last non-empty line index so we know when a parse failure is terminal residue.
  let lastNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim().length > 0) lastNonEmpty = i;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as JournalRecord);
    } catch (err) {
      if (i === lastNonEmpty) {
        // Truncated tail — durable records above stand; this input never landed.
        continue;
      }
      throw err;
    }
  }
  return records;
}

// ── Replay (§5.4) ────────────────────────────────────────────

/**
 * Rebuild every book from scratch.
 *
 * There is no state in here beyond the books themselves and nothing consulted
 * but the records, so `replay(records)` twice is `replay(records)` twice — the
 * property §5.4 asks to be proven.
 */
function journalClock(at: string): Date | null {
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function applySessionDead(books: Map<MarketId, OrderBook>, sessionId: string): void {
  for (const marketId of [...books.keys()]) {
    const book = books.get(marketId);
    if (!book) continue;
    book.cancelSession(sessionId);
    if (book.isNeverPrintedEmpty) books.delete(marketId);
  }
}

function submitSessionDead(order: { readonly sessionId?: string }, dead: ReadonlySet<string>): boolean {
  const sessionId = order.sessionId;
  return sessionId !== undefined && sessionId.length > 0 && dead.has(sessionId);
}

export function replay(records: readonly JournalRecord[]): Map<MarketId, OrderBook> {
  const books = new Map<MarketId, OrderBook>();
  const deadSessions = new Set<string>();

  const bookFor = (marketId: MarketId): OrderBook => {
    let book = books.get(marketId);
    if (!book) {
      book = new OrderBook(marketId);
      books.set(marketId, book);
    }
    return book;
  };

  for (const record of records) {
    if (record.kind === 'session_dead') {
      deadSessions.add(record.sessionId);
      applySessionDead(books, record.sessionId);
      continue;
    }
    if (record.kind === 'submit') {
      if (submitSessionDead(record.order, deadSessions)) continue;
      const book = bookFor(record.marketId);
      book.submit(fromWire(record.order), journalClock(record.at));
      // Reject-only and IOC/market-remainder opens must not survive replay
      // either — same honesty as live dropIfNeverTraded (print or rest, or drop).
      if (book.isNeverPrintedEmpty) books.delete(record.marketId);
      continue;
    }
    // Halt/resume/reduce-only/post-only/prelaunch/expire/delist is engine control state, not a book. MatchingEngine.recover
    // rebuilds it separately so replay does not treat it as a cancel.
    if (
      record.kind === 'halt' ||
      record.kind === 'resume' ||
      record.kind === 'reduce_only' ||
      record.kind === 'resume_reduce_only' ||
      record.kind === 'post_only' ||
      record.kind === 'resume_post_only' ||
      record.kind === 'prelaunch' ||
      record.kind === 'open' ||
      record.kind === 'expire' ||
      record.kind === 'delist' ||
      record.kind === 'halt_all' ||
      record.kind === 'resume_all'
    )
      continue;
    /**
     * CANCEL/AMEND MUST NOT OPEN A MARKET ON REPLAY. Live cancel/amend no
     * longer journals unknown markets, but journals written before that fix
     * still contain cancel-only phantoms. Replaying those through bookFor
     * re-invented empty markets forever. Cancel/amend/mass-cancel is a no-op when the
     * market never submitted.
     */
    const existing = books.get(record.marketId);
    if (!existing) continue;
    if (record.kind === 'amend') {
      existing.amend(fromWireAmend(record.orderId, record.expectedVersion, record.patch));
      if (existing.isNeverPrintedEmpty) books.delete(record.marketId);
      continue;
    }
    if (record.kind === 'mass_cancel') {
      existing.cancelAccount(record.accountId, record.side ?? null);
      if (existing.isNeverPrintedEmpty) books.delete(record.marketId);
      continue;
    }
    existing.cancel(record.orderId);
  }

  return books;
}

/**
 * Replay from a snapshot forward. §5.1 snapshots every N events so recovery
 * does not have to replay from the beginning of time.
 */
export function replayFrom(snapshot: EngineSnapshot, records: readonly JournalRecord[]): Map<MarketId, OrderBook> {
  const books = restoreAll(snapshot);
  const tail = records.filter((r) => r.seq > snapshot.journalSeq);
  const deadSessions = new Set<string>();

  for (const record of tail) {
    if (record.kind === 'session_dead') {
      deadSessions.add(record.sessionId);
      applySessionDead(books, record.sessionId);
      continue;
    }
    if (record.kind === 'submit') {
      if (submitSessionDead(record.order, deadSessions)) continue;
      let book = books.get(record.marketId);
      if (!book) {
        book = new OrderBook(record.marketId);
        books.set(record.marketId, book);
      }
      book.submit(fromWire(record.order), journalClock(record.at));
      if (book.isNeverPrintedEmpty) books.delete(record.marketId);
      continue;
    }
    if (
      record.kind === 'halt' ||
      record.kind === 'resume' ||
      record.kind === 'reduce_only' ||
      record.kind === 'resume_reduce_only' ||
      record.kind === 'post_only' ||
      record.kind === 'resume_post_only' ||
      record.kind === 'prelaunch' ||
      record.kind === 'open' ||
      record.kind === 'expire' ||
      record.kind === 'delist' ||
      record.kind === 'halt_all' ||
      record.kind === 'resume_all'
    )
      continue;
    // Same rule as full replay: cancel/amend/mass-cancel never invents a market.
    const existing = books.get(record.marketId);
    if (!existing) continue;
    if (record.kind === 'amend') {
      existing.amend(fromWireAmend(record.orderId, record.expectedVersion, record.patch));
      if (existing.isNeverPrintedEmpty) books.delete(record.marketId);
      continue;
    }
    if (record.kind === 'mass_cancel') {
      existing.cancelAccount(record.accountId, record.side ?? null);
      if (existing.isNeverPrintedEmpty) books.delete(record.marketId);
      continue;
    }
    existing.cancel(record.orderId);
  }

  return books;
}

// ── Snapshots (§5.1) ────────────────────────────────────

export interface EngineSnapshot {
  /** Journal position this snapshot is consistent with — replay resumes at `seq > journalSeq`. */
  readonly journalSeq: number;
  readonly books: readonly BookState[];
}

export function snapshot(book: OrderBook): BookState {
  return book.toState();
}

export function restore(state: BookState): OrderBook {
  return OrderBook.fromState(state);
}

/** Market ids are sorted so the snapshot of a given state is one string, not one per Map insertion order. */
export function snapshotAll(books: ReadonlyMap<MarketId, OrderBook>, journalSeq: number): EngineSnapshot {
  const ids = [...books.keys()].sort();
  return { journalSeq, books: ids.map((id) => (books.get(id) as OrderBook).toState()) };
}

export function restoreAll(snap: EngineSnapshot): Map<MarketId, OrderBook> {
  const books = new Map<MarketId, OrderBook>();
  for (const state of snap.books) books.set(state.marketId, OrderBook.fromState(state));
  return books;
}

/**
 * The canonical string form of a whole engine's books — what §5.4's determinism
 * test compares. Sorted by market id, because "two replays are equal" must not
 * depend on which market happened to receive its first order first.
 */
export function serializeBooks(books: ReadonlyMap<MarketId, OrderBook>): string {
  const ids = [...books.keys()].sort();
  return JSON.stringify(ids.map((id) => (books.get(id) as OrderBook).toState()));
}
