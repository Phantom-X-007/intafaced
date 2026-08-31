import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { slicePaperScaleOutParent } from './oms-paper-scale-out-slice.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const CHILD = '100';

describe('slicePaperScaleOutParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      slicePaperScaleOutParent({
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: '   ',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + childSize '100'", () => {
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: CHILD,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / scale-in with not_live', () => {
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'twap',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        kind: 'scale-in',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'running',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'approved',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace childSize with missing_child_size even when amount is '1000'", () => {
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: null,
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: '',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: '   ',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
  });

  it("refuses '0' / 'not-an-amount' with child_size_invalid (no invented size from parent amount)", () => {
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: '0',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_invalid' });
    expect(
      slicePaperScaleOutParent({
        parentClientOrderId: 'p-sout',
        status: 'paper',
        childSize: 'not-an-amount',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_invalid' });
  });

  it("happy: status paper + childSize '100' + paper on — not invented from amount", () => {
    const result = slicePaperScaleOutParent({
      parentClientOrderId: 'p-sout',
      kind: 'scale-out',
      status: 'paper',
      childSize: CHILD,
      amount: '1000',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      paper: true,
      parent: { parentClientOrderId: 'p-sout', kind: 'scale-out' },
      childSize: formatAmount(parseAmount(CHILD)),
    });
    expect(result).not.toMatchObject({ childSize: '1000' });
    expect(result).not.toHaveProperty('matching');
  });
});
