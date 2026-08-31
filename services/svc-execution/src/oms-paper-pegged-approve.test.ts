import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePaperPeggedParent } from './oms-paper-pegged-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const OFFSET = '0.05';

describe('approvePaperPeggedParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperPeggedParent({
        kind: 'pegged',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: '   ',
        kind: 'pegged',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with offset '0.05'", () => {
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: OFFSET,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / iceberg with not_live', () => {
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'twap',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'iceberg',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperPeggedParent({
      parentClientOrderId: 'p-peg',
      kind: 'pegged',
      offset: OFFSET,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperPeggedParent({
      parentClientOrderId: 'p-peg',
      kind: 'pegged',
      offset: OFFSET,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it("refuses omitted / null / whitespace offset with offset_blank even when amount is '1000'", () => {
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: null,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: '',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: '   ',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
  });

  it("refuses 'not-an-amount' with offset_invalid (no invented offset from parent amount)", () => {
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: 'not-an-amount',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_invalid' });
  });

  it("happy: parent id + kind pegged + offset '0.05' + operator + paper on", () => {
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'pegged',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-peg', kind: 'pegged' },
      status: 'paper',
      offset: formatAmount(parseAmount(OFFSET)),
    });
  });

  it("happy: parent id + kind omitted + offset '0.05' + operator + paper on", () => {
    expect(
      approvePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        offset: OFFSET,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-peg', kind: 'pegged' },
      status: 'paper',
      offset: formatAmount(parseAmount(OFFSET)),
    });
  });
});
