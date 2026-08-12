/**
 * D26-P2-05 / ADR D-S-13 — broken-promise vs socket inventory.
 *
 * `WIRING_SOCKETS` already classifies every unwired end. This module turns that
 * list into an **inventory** a test can execute: every catalog event, both ends,
 * partitioned into wired / true socket (A|C) / broken promise (B).
 *
 * The ADR test is not "is there a consumer". It is: does anyone already hold a
 * belief the missing wiring would have to deliver? Class B answers yes — that
 * is a defect, not a socket. Class A/C answer no (or disclose the gap).
 *
 * Mounted-vs-defined wiring is still the job of `tooling/ci/event-wiring.mjs`.
 * This inventory is the catalog-side twin: the classification a reviewer reads
 * and a suite asserts, without re-scanning the service graph.
 */

import { EVENT_CATALOG, WIRING_SOCKETS, type EventName, type SocketClass, type WiringSocket } from './catalog.js';

export type WiringEnd = 'publisher' | 'subscriber';

/** How an event end is accounted for in the completeness inventory. */
export type EndDisposition =
  | { readonly kind: 'wired' }
  | { readonly kind: 'socket'; readonly socketClass: 'A' | 'C'; readonly socket: WiringSocket }
  | { readonly kind: 'broken_promise'; readonly socketClass: 'B'; readonly socket: WiringSocket };

export interface EventEndRow {
  readonly event: EventName;
  readonly end: WiringEnd;
  readonly disposition: EndDisposition;
}

export interface BusCompletenessInventory {
  /** Every catalog event name, stable Object.keys order. */
  readonly events: readonly EventName[];
  /** 2 × events.length rows — publisher and subscriber for each. */
  readonly ends: readonly EventEndRow[];
  /** Class A or C — true sockets (record ahead / disclosed gap). */
  readonly sockets: readonly WiringSocket[];
  /** Class B — promise with no delivery. Not a socket. */
  readonly brokenPromises: readonly WiringSocket[];
  /** Events with neither end on WIRING_SOCKETS (gate must prove both ends mount). */
  readonly presumedFullyWired: readonly EventName[];
}

const ENDS: readonly WiringEnd[] = ['publisher', 'subscriber'];

/**
 * ADR D-S-13: Class B is a broken promise; A and C are sockets.
 * An unclassified entry is a type error upstream (`WiringSocket.class`).
 */
export function dispositionOf(socket: WiringSocket): EndDisposition {
  if (socket.class === 'B') {
    return { kind: 'broken_promise', socketClass: 'B', socket };
  }
  return { kind: 'socket', socketClass: socket.class, socket };
}

export function socketFor(event: EventName, end: WiringEnd): WiringSocket | undefined {
  return WIRING_SOCKETS.find((s) => s.event === event && s.missing === end);
}

/**
 * Build the full broken-promise vs socket inventory from the catalog.
 * Pure data — no filesystem, no NATS. Safe to call from unit tests.
 */
export function buildBusCompletenessInventory(): BusCompletenessInventory {
  const events = Object.keys(EVENT_CATALOG) as EventName[];
  const ends: EventEndRow[] = [];

  for (const event of events) {
    for (const end of ENDS) {
      const socket = socketFor(event, end);
      ends.push({
        event,
        end,
        disposition: socket ? dispositionOf(socket) : { kind: 'wired' },
      });
    }
  }

  // Prefer `!== 'B'` over `=== 'A' || === 'C'`: when the live catalog has no Class C
  // rows, TypeScript narrows the const array's class union to 'A' | 'B' and rejects
  // a `'C'` comparison as intentional-unreachability — which would break the
  // day a Class C socket is added.
  const sockets = WIRING_SOCKETS.filter((s) => s.class !== 'B');
  const brokenPromises = WIRING_SOCKETS.filter((s) => s.class === 'B');
  const presumedFullyWired = events.filter((event) => !WIRING_SOCKETS.some((s) => s.event === event));

  return { events, ends, sockets, brokenPromises, presumedFullyWired };
}

/** Compact keys for pin assertions — same shape as event-wiring's Class B list. */
export function brokenPromiseKeys(inventory = buildBusCompletenessInventory()): readonly string[] {
  return inventory.brokenPromises.map((s) => `${s.event}::${s.missing}`);
}

export function socketKeys(inventory = buildBusCompletenessInventory()): readonly string[] {
  return inventory.sockets.map((s) => `${s.event}::${s.missing}`);
}

export function countByClass(inventory = buildBusCompletenessInventory()): Record<SocketClass, number> {
  const counts: Record<SocketClass, number> = { A: 0, B: 0, C: 0 };
  for (const s of [...inventory.sockets, ...inventory.brokenPromises]) {
    counts[s.class] += 1;
  }
  return counts;
}
