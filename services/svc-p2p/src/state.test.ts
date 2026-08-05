import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEADLINES,
  ESCROW_HOLDING_STATUSES,
  TERMINAL_STATUSES,
  TRADE_STATUSES,
  TradeStateError,
  VALUE_MOVING_TIMEOUT_ACTIONS,
  escalationDeadline,
  assertTransition,
  canTransition,
  deadlineFor,
  holdsEscrow,
  isTerminal,
  resolutionFor,
  timeoutActionFor,
  withDeadline,
  type TradeStatus,
} from './state.js';

/**
 * The state machine is where the escrow invariants live, so it is tested by
 * enumeration rather than by example: every state, every edge, every timeout.
 *
 * The three properties at the bottom of this file are the ones that matter —
 * they are the machine-checkable form of "funds cannot be stranded".
 */

describe('the graph', () => {
  it('has exactly the six states §6.2 specifies', () => {
    expect([...TRADE_STATUSES]).toEqual(['created', 'escrowed', 'fiat_sent', 'released', 'cancelled', 'disputed']);
  });

  it('walks the happy path', () => {
    expect(canTransition('created', 'escrowed')).toBe(true);
    expect(canTransition('escrowed', 'fiat_sent')).toBe(true);
    expect(canTransition('fiat_sent', 'released')).toBe(true);
  });

  it('lets a seller release straight from escrowed', () => {
    // Only ever gives away the actor's own escrowed asset.
    expect(canTransition('escrowed', 'released')).toBe(true);
  });

  it('never releases from created — there is no escrow yet to release', () => {
    expect(canTransition('created', 'released')).toBe(false);
  });

  it('never re-enters a state it has left', () => {
    expect(canTransition('escrowed', 'created')).toBe(false);
    expect(canTransition('fiat_sent', 'escrowed')).toBe(false);
    expect(canTransition('released', 'fiat_sent')).toBe(false);
  });

  it('gives a moderator exactly two outcomes, and no third', () => {
    const fromDisputed = TRADE_STATUSES.filter((s) => canTransition('disputed', s));
    expect(fromDisputed.sort()).toEqual(['cancelled', 'released']);
  });

  it('lets nothing at all leave a terminal state', () => {
    for (const to of TRADE_STATUSES) {
      expect(canTransition('released', to)).toBe(false);
      expect(canTransition('cancelled', to)).toBe(false);
    }
  });
});

describe('assertTransition', () => {
  it('passes a legal edge silently', () => {
    expect(() => assertTransition('escrowed', 'fiat_sent')).not.toThrow();
  });

  it('names the terminal state when the trade is already resolved', () => {
    expect(() => assertTransition('released', 'released')).toThrow(/already released/);
    expect(() => assertTransition('cancelled', 'released')).toThrow(/already cancelled/);
  });

  it('reports a terminal trade with its own code, distinct from a bad edge', () => {
    expect(() => assertTransition('released', 'cancelled')).toThrow(expect.objectContaining({ code: 'p2p.trade_terminal' }));
    expect(() => assertTransition('created', 'released')).toThrow(expect.objectContaining({ code: 'p2p.invalid_transition' }));
  });

  it('carries both ends of the attempted move on the error', () => {
    try {
      assertTransition('created', 'released');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TradeStateError);
      expect(err).toMatchObject({ from: 'created', to: 'released' });
    }
  });
});

describe('escrow-holding states', () => {
  it('holds escrow exactly in escrowed, fiat_sent and disputed', () => {
    expect([...ESCROW_HOLDING_STATUSES].sort()).toEqual(['disputed', 'escrowed', 'fiat_sent']);
  });

  it('does NOT consider `created` to hold escrow', () => {
    // This is the property that stops a spurious refund draining a different
    // trade's escrow out of the seller's pooled account.
    expect(holdsEscrow('created')).toBe(false);
  });

  it('every escrow-holding state is reachable only after a successful lock', () => {
    for (const status of ESCROW_HOLDING_STATUSES) {
      const predecessors = TRADE_STATUSES.filter((from) => canTransition(from, status));
      // Either it comes from `created` (the lock just succeeded) or from another
      // state that already held escrow.
      expect(predecessors.every((p) => p === 'created' || holdsEscrow(p))).toBe(true);
    }
  });
});

describe('resolutionFor', () => {
  it('released always resolves as released', () => {
    expect(resolutionFor('released', true)).toBe('released');
  });

  it('cancelled resolves as refunded when the lock happened', () => {
    expect(resolutionFor('cancelled', true)).toBe('refunded');
  });

  it('cancelled resolves as voided when it did not', () => {
    expect(resolutionFor('cancelled', false)).toBe('voided');
  });

  it('refuses to resolve a live state', () => {
    expect(() => resolutionFor('escrowed', true)).toThrow(TradeStateError);
  });
});

describe('deadlines', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');

  it('gives every live state a deadline', () => {
    for (const status of TRADE_STATUSES.filter((s) => !isTerminal(s))) {
      expect(deadlineFor(status, now, DEFAULT_DEADLINES)).toBeInstanceOf(Date);
    }
  });

  it('gives terminal states none — the sweeper must never see them again', () => {
    expect(deadlineFor('released', now, DEFAULT_DEADLINES)).toBeNull();
    expect(deadlineFor('cancelled', now, DEFAULT_DEADLINES)).toBeNull();
  });

  it('escrow < payment < release < dispute', () => {
    const at = (s: TradeStatus) => deadlineFor(s, now, DEFAULT_DEADLINES)!.getTime();
    expect(at('created')).toBeLessThan(at('escrowed'));
    expect(at('escrowed')).toBeLessThan(at('fiat_sent'));
    expect(at('fiat_sent')).toBeLessThan(at('disputed'));
  });

  it('records each deadline under its own key without losing the earlier ones', () => {
    let deadlines = withDeadline({}, 'created', deadlineFor('created', now, DEFAULT_DEADLINES));
    deadlines = withDeadline(deadlines, 'escrowed', deadlineFor('escrowed', now, DEFAULT_DEADLINES));
    deadlines = withDeadline(deadlines, 'fiat_sent', deadlineFor('fiat_sent', now, DEFAULT_DEADLINES));

    expect(Object.keys(deadlines).sort()).toEqual(['escrowBy', 'paymentBy', 'releaseBy']);
  });

  it('writes nothing for a terminal state', () => {
    expect(withDeadline({ escrowBy: 'x' }, 'released', null)).toEqual({ escrowBy: 'x' });
  });
});

describe('timeouts', () => {
  it('gives every live state something a clock will do to it', () => {
    for (const status of TRADE_STATUSES.filter((s) => !isTerminal(s))) {
      expect(timeoutActionFor(status)).not.toBeNull();
    }
  });

  it('gives terminal states nothing to do', () => {
    expect(timeoutActionFor('released')).toBeNull();
    expect(timeoutActionFor('cancelled')).toBeNull();
  });

  it('never auto-releases a trade the buyer merely claimed to have paid for', () => {
    // Auto-releasing from fiat_sent would hand the asset to anyone willing to
    // click "I paid" and wait out the clock.
    expect(timeoutActionFor('fiat_sent')).toBe('open_dispute');
  });

  it('refunds the seller when the buyer never even claimed to pay', () => {
    expect(timeoutActionFor('escrowed')).toBe('refund');
  });

  it('ESCALATES a dispute nobody ruled on — it does not rule on it', () => {
    expect(timeoutActionFor('disputed')).toBe('escalate_dispute');
  });

  /**
   * THE RULE, AS A SET.
   *
   * A clock may unwind a stall, because unwinding is what everybody's silence
   * meant. It may not adjudicate a disagreement: there is nothing there to
   * infer, and the timer this replaced inferred "refund" and wrote it down as a
   * resolution. Anyone adding a value-moving action to `disputed` comes through
   * this line first.
   */
  it('no timeout action that moves value is reachable from `disputed`', () => {
    const action = timeoutActionFor('disputed');
    expect(action).not.toBeNull();
    expect(VALUE_MOVING_TIMEOUT_ACTIONS.has(action!), 'a clock ruled on a dispute').toBe(false);
    expect([...VALUE_MOVING_TIMEOUT_ACTIONS].sort()).toEqual(['refund', 'settle_or_void']);
  });

  it('re-arms an escalated dispute rather than letting its clock run out', () => {
    const at = new Date('2026-08-04T00:00:00.000Z');
    expect(escalationDeadline(at, DEFAULT_DEADLINES).getTime()).toBe(at.getTime() + DEFAULT_DEADLINES.escalationRecheckSeconds * 1000);
  });
});

// ── The properties ───────────────────────────────────────────────────────────

describe('INVARIANT: no state can hold value forever', () => {
  it('every non-terminal state has a deadline AND a timeout action', () => {
    for (const status of TRADE_STATUSES) {
      if (isTerminal(status)) continue;
      expect(deadlineFor(status, new Date(), DEFAULT_DEADLINES), `${status} has no deadline`).not.toBeNull();
      expect(timeoutActionFor(status), `${status} has no timeout action`).not.toBeNull();
    }
  });

  it('every state can reach a terminal state', () => {
    // Breadth-first from each state. A state with no path to `released` or
    // `cancelled` would be an escrow with no way out.
    for (const start of TRADE_STATUSES) {
      const seen = new Set<TradeStatus>([start]);
      const queue: TradeStatus[] = [start];
      let reachedTerminal = false;

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (isTerminal(current)) {
          reachedTerminal = true;
          break;
        }
        for (const next of TRADE_STATUSES) {
          if (canTransition(current, next) && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }

      expect(reachedTerminal, `${start} cannot reach a terminal state`).toBe(true);
    }
  });

  it('the graph is acyclic among live states — a trade cannot loop forever', () => {
    const live = TRADE_STATUSES.filter((s) => !isTerminal(s));
    const visiting = new Set<TradeStatus>();
    const done = new Set<TradeStatus>();

    const walk = (node: TradeStatus): boolean => {
      if (visiting.has(node)) return false;
      if (done.has(node)) return true;
      visiting.add(node);
      for (const next of live) {
        if (canTransition(node, next) && !walk(next)) return false;
      }
      visiting.delete(node);
      done.add(node);
      return true;
    };

    for (const s of live) expect(walk(s), `${s} is part of a cycle`).toBe(true);
  });
});

describe('INVARIANT: exactly two terminal states, both carrying a resolution', () => {
  it('has exactly released and cancelled', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'released']);
  });

  it('assigns each of them a resolution and never leaves one undecided', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(() => resolutionFor(status, true)).not.toThrow();
      expect(() => resolutionFor(status, false)).not.toThrow();
    }
  });
});
