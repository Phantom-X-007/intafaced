import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryJournal, replay } from './journal.js';
import { JOURNAL_GAP, reconstructTransitions } from './journal-gaps.js';
import type { JournalRecord } from './journal-codec.js';
import type { EngineOrder } from './types.js';

/**
 * CARD D-journal hitch. Reconstruct from journal + gateway timestamps.
 * Gaps are named. Never invent a cancel or fill to close a hole.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';
const T0 = '2026-09-02T22:00:00.000Z';
const T1 = '2026-09-02T22:00:01.000Z';
const T2 = '2026-09-02T22:00:02.000Z';

function ask(): EngineOrder {
  return {
    orderId: ASK,
    accountId: 'mm',
    type: 'limit',
    side: 'sell',
    qty: parseAmount('2'),
    price: parseAmount('100'),
    stopPrice: null,
    tif: 'GTC',
  };
}

describe('journal-gaps — named holes, never a healed tape', () => {
  it('contiguous journal + matching gateway stamps has empty gaps and no extra transitions', () => {
    const journal = new MemoryJournal();
    journal.append({ kind: 'cancel', marketId: MARKET, at: T0, orderId: ASK });
    journal.append({ kind: 'cancel', marketId: MARKET, at: T1, orderId: TAKE });
    const records = journal.read();
    const reconstructed = reconstructTransitions(records, [
      { at: T0, seq: records[0]!.seq },
      { at: T1, seq: records[1]!.seq },
    ]);
    expect(reconstructed.gaps).toEqual([]);
    expect(reconstructed.transitions).toEqual(records);
    expect(reconstructed.transitions.some((record) => record.kind === 'submit')).toBe(false);
  });

  it('seq hole 1 then 4 is a named gap; no invented cancel or fill between', () => {
    const holey: readonly JournalRecord[] = [
      { kind: 'cancel', marketId: MARKET, at: T0, orderId: ASK, seq: 1 },
      { kind: 'cancel', marketId: MARKET, at: T2, orderId: TAKE, seq: 4 },
    ];
    const reconstructed = reconstructTransitions(holey, [
      { at: T0, seq: 1 },
      { at: T2, seq: 4 },
    ]);
    expect(reconstructed.transitions).toHaveLength(2);
    expect(reconstructed.transitions.map((record) => record.kind)).toEqual(['cancel', 'cancel']);
    expect(reconstructed.gaps).toHaveLength(1);
    expect(reconstructed.gaps[0]!.code).toBe(JOURNAL_GAP);
    expect(reconstructed.gaps[0]!.afterSeq).toBe(1);
    expect(reconstructed.gaps[0]!.beforeSeq).toBe(4);
    expect(reconstructed.gaps[0]!.message).toContain('does not invent a cancel or fill');
  });

  it('gateway stamp with no journal record is a named gap, not a synthesized event', () => {
    const records: readonly JournalRecord[] = [{ kind: 'cancel', marketId: MARKET, at: T0, orderId: ASK, seq: 1 }];
    const reconstructed = reconstructTransitions(records, [{ at: T1, seq: 2, kind: 'fill' }]);
    expect(reconstructed.transitions).toEqual(records);
    expect(reconstructed.transitions.some((record) => record.kind === 'submit')).toBe(false);
    expect(reconstructed.gaps).toHaveLength(1);
    expect(reconstructed.gaps[0]!.code).toBe(JOURNAL_GAP);
    expect(reconstructed.gaps[0]!.beforeSeq).toBe(2);
  });

  it('replay of holey reconstruct.transitions does not invent a fill that was never journalled', () => {
    const { toWire } = require('./journal-wire.js') as typeof import('./journal-wire.js');
    const records: readonly JournalRecord[] = [
      { kind: 'submit', marketId: MARKET, at: T0, seq: 1, order: toWire(ask()) },
    ];
    const reconstructed = reconstructTransitions(records, [{ at: T0, seq: 1 }]);
    expect(reconstructed.transitions).toHaveLength(1);
    const books = replay(reconstructed.transitions);
    const state = books.get(MARKET)?.toState();
    expect(state?.asks[0]?.orders[0]?.orderId).toBe(ASK);
    expect(state?.lastTradePrice).toBeNull();
  });

  it('in_flight stays in_flight on reconstruct — not turned into a cancel', () => {
    const records: readonly JournalRecord[] = [
      {
        kind: 'in_flight',
        marketId: MARKET,
        at: T0,
        seq: 1,
        orderId: ASK,
        mutation: 'submit',
        inFlight: true,
        qty: '2',
      },
    ];
    const reconstructed = reconstructTransitions(records, [{ at: T0, seq: 1 }]);
    expect(reconstructed.transitions).toHaveLength(1);
    expect(reconstructed.transitions[0]!.kind).toBe('in_flight');
    expect(reconstructed.gaps).toEqual([]);
  });
});
