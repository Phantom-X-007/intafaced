import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { JOURNAL_GAP, MemoryJournal, reconstructTransitions, replay, seqGap, toWire } from './journal.js';
import type { JournalRecord } from './journal.js';
import type { EngineOrder } from './types.js';

/**
 * CARD D-journal hitch. Reconstruct from journal + gateway timestamps.
 * Gaps are named. Never invent a cancel or fill to close a hole.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const LATER = '33333333-3333-4333-8333-333333333333';
const T0 = '2026-09-02T22:00:00.000Z';
const T1 = '2026-09-02T22:00:01.000Z';
const T2 = '2026-09-02T22:00:02.000Z';

function ask(spec?: { id?: string; price?: string }): EngineOrder {
  return {
    orderId: spec?.id ?? ASK,
    accountId: 'mm',
    type: 'limit',
    side: 'sell',
    qty: parseAmount('2'),
    price: parseAmount(spec?.price ?? '100'),
    stopPrice: null,
    tif: 'GTC',
  };
}

function holeyAskTape(): readonly JournalRecord[] {
  return [
    { kind: 'submit', marketId: MARKET, at: T0, seq: 1, order: toWire(ask()) },
    { kind: 'submit', marketId: MARKET, at: T2, seq: 4, order: toWire(ask({ id: LATER, price: '101' })) },
  ];
}

describe('journal-gaps — named holes, never a healed tape', () => {
  it('contiguous journal + matching gateway stamps has empty gaps and no extra transitions', () => {
    const journal = new MemoryJournal();
    journal.append({ kind: 'submit', marketId: MARKET, at: T0, order: toWire(ask()) });
    journal.append({ kind: 'submit', marketId: MARKET, at: T1, order: toWire(ask({ id: LATER, price: '101' })) });
    const records = journal.read();
    const reconstructed = reconstructTransitions(records, [
      { at: T0, seq: records[0]!.seq },
      { at: T1, seq: records[1]!.seq },
    ]);
    expect(reconstructed.gaps).toEqual([]);
    expect(reconstructed.transitions).toBe(records);
    expect(reconstructed.transitions).toHaveLength(records.length);
    expect(seqGap(records[0]!, records[1]!)).toBeNull();
  });

  it('seq hole 1 then 4 is a named gap; no invented cancel or fill between', () => {
    const holey = holeyAskTape();
    const reconstructed = reconstructTransitions(holey, [
      { at: T0, seq: 1 },
      { at: T2, seq: 4 },
    ]);
    expect(reconstructed.transitions).toBe(holey);
    expect(reconstructed.transitions).toHaveLength(2);
    expect(reconstructed.transitions.map((record) => record.kind)).toEqual(['submit', 'submit']);
    expect(reconstructed.transitions.some((record) => record.kind === 'cancel')).toBe(false);
    expect(reconstructed.gaps).toHaveLength(1);
    expect(reconstructed.gaps[0]!.code).toBe(JOURNAL_GAP);
    expect(reconstructed.gaps[0]!.afterSeq).toBe(1);
    expect(reconstructed.gaps[0]!.beforeSeq).toBe(4);
    expect(seqGap(holey[0]!, holey[1]!)?.afterSeq).toBe(1);
    expect(seqGap(holey[0]!, holey[1]!)?.beforeSeq).toBe(4);
    expect(reconstructed.gaps[0]!.message).toContain('after seq 1');
    expect(reconstructed.gaps[0]!.message).toContain('before seq 4');
    expect(reconstructed.gaps[0]!.message.toLowerCase()).not.toMatch(/fill was applied|cancel was applied/);
  });

  it('gateway stamp with seq/at not on the journal is a named gap, not a synthesized event', () => {
    const records: readonly JournalRecord[] = [{ kind: 'submit', marketId: MARKET, at: T0, seq: 1, order: toWire(ask()) }];
    const bySeq = reconstructTransitions(records, [{ at: T1, seq: 2, kind: 'fill' }]);
    expect(bySeq.transitions).toBe(records);
    expect(bySeq.transitions).toHaveLength(1);
    expect(bySeq.transitions[0]!.kind).toBe('submit');
    expect(bySeq.transitions.some((record) => record.kind === 'cancel')).toBe(false);
    expect(bySeq.gaps).toHaveLength(1);
    expect(bySeq.gaps[0]!.code).toBe(JOURNAL_GAP);
    expect(bySeq.gaps[0]!.beforeSeq).toBe(2);

    const byAt = reconstructTransitions(records, [{ at: '2026-09-02T22:00:09.000Z' }]);
    expect(byAt.transitions).toBe(records);
    expect(byAt.transitions).toHaveLength(1);
    expect(byAt.gaps).toHaveLength(1);
    expect(byAt.gaps[0]!.code).toBe(JOURNAL_GAP);
  });

  it('replay of holey reconstruct.transitions does not invent a fill that was never journalled', () => {
    const holey = holeyAskTape();
    const reconstructed = reconstructTransitions(holey, [
      { at: T0, seq: 1 },
      { at: T1, seq: 2, kind: 'fill' },
      { at: T2, seq: 4 },
    ]);
    expect(reconstructed.transitions).toHaveLength(2);
    expect(reconstructed.transitions.map((record) => record.kind)).toEqual(['submit', 'submit']);
    const books = replay(reconstructed.transitions);
    const state = books.get(MARKET)?.toState();
    expect(state?.asks[0]?.orders[0]?.orderId).toBe(ASK);
    expect(state?.asks[0]?.orders[0]?.remaining).toBe('2');
    expect(state?.lastTradePrice).toBeNull();
    expect(state?.bids).toEqual([]);
  });

  it('in_flight stays in_flight on reconstruct — not turned into a cancel', () => {
    const records: readonly JournalRecord[] = [
      {
        kind: 'in_flight',
        marketId: MARKET,
        at: T0,
        seq: 1,
        orderId: ASK,
        mutation: 'cancel',
        inFlight: true,
        qty: '2',
      },
    ];
    const reconstructed = reconstructTransitions(records, [{ at: T0, seq: 1 }]);
    expect(reconstructed.transitions).toBe(records);
    expect(reconstructed.transitions).toHaveLength(1);
    expect(reconstructed.transitions[0]!.kind).toBe('in_flight');
    expect(reconstructed.transitions.some((record) => record.kind === 'cancel')).toBe(false);
    expect(reconstructed.gaps).toEqual([]);
  });
});
