import { describe, expect, it } from 'vitest';
import { slicePaperImplementationShortfallParent } from './oms-is-paper-slice.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('slicePaperImplementationShortfallParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      slicePaperImplementationShortfallParent({
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: '   ',
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + amount '1'", () => {
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: '1',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: '1',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        kind: 'twap',
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (paper-only door)', () => {
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'approved',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace amount with missing_qty even when arrivalPrice is '100'", () => {
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        arrivalPrice: '100',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: null,
        arrivalPrice: '100',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: '',
        arrivalPrice: '100',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: '   ',
        arrivalPrice: '100',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    const blank = slicePaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      status: 'paper',
      amount: '',
      arrivalPrice: '100',
      paper: PAPER_ON,
    });
    expect(blank).not.toHaveProperty('amount');
    expect(blank).not.toHaveProperty('sliced');
  });

  it("refuses 'nope' with qty_invalid", () => {
    expect(
      slicePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: 'nope',
        arrivalPrice: '100',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
  });

  it("refuses '0' with qty_invalid", () => {
    const zero = slicePaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      status: 'paper',
      amount: '0',
      arrivalPrice: '100',
      paper: PAPER_ON,
    });
    expect(zero).toMatchObject({ ok: false, reason: 'qty_invalid' });
    expect(zero).not.toMatchObject({ amount: '100' });
    expect(zero).not.toHaveProperty('sliced');
  });

  it("happy: status paper + amount '1.25' + paper on + arrivalPrice '100' → sliced true, paper true, amount '1.25'", () => {
    const result = slicePaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      kind: 'implementation_shortfall',
      status: 'paper',
      amount: '1.25',
      arrivalPrice: '100',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      paper: true,
      parent: { parentClientOrderId: 'p-is', kind: 'implementation_shortfall' },
      amount: '1.25',
    });
    expect(result).not.toMatchObject({ amount: '100' });
    if (result.ok) {
      expect(result.amount).toBe('1.25');
      expect(result.amount).not.toBe('100');
      expect(result.paper).toBe(true);
      expect(result.parent.kind).toBe('implementation_shortfall');
    }
  });
});
