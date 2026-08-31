import { describe, expect, it } from 'vitest';
import { slicePaperVwapParent } from './oms-paper-vwap-slice.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('slicePaperVwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      slicePaperVwapParent({
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: '   ',
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + amount '1'", () => {
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        amount: '1',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        amount: '1',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'running',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'approved',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace amount with missing_qty even when targetVolume is '1000' (no invented size from target volume)", () => {
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        targetVolume: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        amount: null,
        targetVolume: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        amount: '',
        targetVolume: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        amount: '   ',
        targetVolume: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    const blank = slicePaperVwapParent({
      parentClientOrderId: 'p-vwap',
      status: 'paper',
      amount: '',
      targetVolume: '1000',
      paper: PAPER_ON,
    });
    expect(blank).not.toHaveProperty('amount');
    expect(blank).not.toHaveProperty('sliced');
  });

  it("refuses 'nope' with qty_invalid", () => {
    expect(
      slicePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        status: 'paper',
        amount: 'nope',
        targetVolume: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
  });

  it("refuses '0' with qty_invalid", () => {
    const zero = slicePaperVwapParent({
      parentClientOrderId: 'p-vwap',
      status: 'paper',
      amount: '0',
      targetVolume: '1000',
      paper: PAPER_ON,
    });
    expect(zero).toMatchObject({ ok: false, reason: 'qty_invalid' });
    expect(zero).not.toMatchObject({ amount: '1000' });
    expect(zero).not.toHaveProperty('sliced');
  });

  it("happy: status paper + amount '1.25' + paper on + targetVolume '1000' → sliced true, paper true, amount '1.25' (not invented from target volume), kind vwap", () => {
    const result = slicePaperVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      status: 'paper',
      amount: '1.25',
      targetVolume: '1000',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      paper: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      amount: '1.25',
    });
    expect(result).not.toMatchObject({ amount: '1000' });
    if (result.ok) {
      expect(result.amount).toBe('1.25');
      expect(result.amount).not.toBe('1000');
      expect(result.paper).toBe(true);
      expect(result.parent.kind).toBe('vwap');
    }
  });
});
