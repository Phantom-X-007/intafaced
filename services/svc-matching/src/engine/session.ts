/**
 * Cancel-on-disconnect / session fence.
 * Caller sessionId on a rest is the only session the engine knows.
 * Session-dead cancels those rests. New submits with that session refuse.
 * Missing session refuses — the engine does not invent one.
 * Mass-cancel stays owner-by-account; this is not a second mass-cancel API.
 */
import { readSessionId } from './mass-cancel.js';
import type { BookState, OrderId, RejectReason, SubmitResult } from './types.js';

export const SESSION_GONE = 'session_gone' as const;
export const MISSING_SESSION = 'missing_session' as const;

export type SessionRefuse = typeof SESSION_GONE | typeof MISSING_SESSION;

export { readSessionId };

export interface LiveSession {
  readonly orderId: OrderId;
  readonly sessionId: string | null;
  readonly sequence: number;
}

export function missingSessionRefuse(): { readonly code: typeof MISSING_SESSION; readonly message: string } {
  return {
    code: MISSING_SESSION,
    message: 'session identity is required; the engine does not invent a session',
  };
}

export function sessionGoneRefuse(sessionId: string): RejectReason {
  return {
    code: SESSION_GONE,
    message: `session ${sessionId} is gone — new submits are refused`,
  };
}

export function sessionGoneSubmitResult(orderId: string, sessionId: string): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { ...sessionGoneRefuse(sessionId), message: `session ${sessionId} is gone — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}

/** Live ids for this session, oldest sequence first. Missing session matches nothing. Untagged rests are not invented. */
export function sessionOrderIds(sessionId: string, live: readonly LiveSession[]): readonly OrderId[] {
  if (sessionId.length === 0) return [];
  return live
    .filter((row) => row.sessionId === sessionId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => row.orderId);
}

/** Last session-dead per id wins. Not a book — replay does not invent a session. No reverse. */
export function replayDeadSessions(records: readonly { readonly kind: string; readonly sessionId?: string }[]): ReadonlySet<string> {
  const dead = new Set<string>();
  for (const record of records) {
    if (record.kind !== 'session_dead') continue;
    const sessionId = readSessionId({ sessionId: record.sessionId ?? null });
    if (sessionId === null) continue;
    dead.add(sessionId);
  }
  return dead;
}

/** Live rests + stops as session-tagged rows. Missing sessionId is untagged, not invented. */
export function liveSessionFromState(state: BookState): readonly LiveSession[] {
  const live: LiveSession[] = [];
  for (const level of state.bids) {
    for (const o of level.orders) live.push({ orderId: o.orderId, sessionId: o.sessionId ?? null, sequence: o.sequence });
  }
  for (const level of state.asks) {
    for (const o of level.orders) live.push({ orderId: o.orderId, sessionId: o.sessionId ?? null, sequence: o.sequence });
  }
  for (const s of state.stops) live.push({ orderId: s.orderId, sessionId: s.sessionId ?? null, sequence: s.sequence });
  return live;
}

import './cod-fence.js';
