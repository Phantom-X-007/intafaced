import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { slicePaperScaleInParent } from './oms-paper-scale-in-slice.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const CHILD = '100';

describe('slicePaperScaleInParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      slicePaperScaleInParent({
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: '   ',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + childSize '100'", () => {
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: CHILD,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        kind: 'twap',
        status: 'paper',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'running',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'approved',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        childSize: CHILD,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace childSize with missing_child_size even when amount is '1000'", () => {
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: null,
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: '',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: '   ',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_child_size' });
  });

  it("refuses '0' / 'not-an-amount' with child_size_invalid (no invented size from parent amount)", () => {
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: '0',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_invalid' });
    expect(
      slicePaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        childSize: 'not-an-amount',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'child_size_invalid' });
  });

  it("happy: status paper + childSize '100' + paper on — not invented from amount", () => {
    const result = slicePaperScaleInParent({
      parentClientOrderId: 'p-scale',
      kind: 'scale-in',
      status: 'paper',
      childSize: CHILD,
      amount: '1000',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      paper: true,
      parent: { parentClientOrderId: 'p-scale', kind: 'scale-in' },
      childSize: formatAmount(parseAmount(CHILD)),
    });
    expect(result).not.toMatchObject({ childSize: '1000' });
    expect(result).not.toHaveProperty('matching');
  });
});
