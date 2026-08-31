import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePaperScaleOutParent } from './oms-paper-scale-out-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const CHILD = '100';

describe('approvePaperScaleOutParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperScaleOutParent({
        kind: 'scale-out',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: '   ',
        kind: 'scale-out',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with childSize '100'", () => {
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: CHILD,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / iceberg / scale-in with not_live', () => {
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'twap',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'iceberg',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-in',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperScaleOutParent({
      parentClientOrderId: 'p-sout',
      kind: 'scale-out',
      childSize: CHILD,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperScaleOutParent({
      parentClientOrderId: 'p-sout',
      kind: 'scale-out',
      childSize: CHILD,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it("refuses omitted / null / whitespace childSize with child_size_blank even when amount is '1000'", () => {
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_blank' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: null,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_blank' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: '',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_blank' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: '   ',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_blank' });
  });

  it("refuses '0' / 'not-an-amount' with child_size_invalid (no invented size from parent amount)", () => {
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: '0',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_invalid' });
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: 'not-an-amount',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_invalid' });
  });

  it("happy: parent id + kind scale-out + childSize '100' + operator + paper on", () => {
    expect(
      approvePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-out',
        childSize: CHILD,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-sout', kind: 'scale-out' },
      status: 'paper',
      childSize: formatAmount(parseAmount(CHILD)),
    });
  });

  it("happy: parent id + kind omitted + childSize '100' + operator + paper on — not invented from amount", () => {
    const result = approvePaperScaleOutParent({
      parentClientOrderId: 'p-sout',
      childSize: CHILD,
      amount: '1000',
      operatorId: OP,
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-sout', kind: 'scale-out' },
      status: 'paper',
      childSize: formatAmount(parseAmount(CHILD)),
    });
    expect(result).not.toMatchObject({ childSize: '1000' });
    expect(result).not.toHaveProperty('matching');
  });
});
