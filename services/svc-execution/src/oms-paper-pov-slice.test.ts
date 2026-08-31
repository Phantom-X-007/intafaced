import { describe, expect, it } from 'vitest';
import { slicePaperPovParent } from './oms-paper-pov-slice.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('slicePaperPovParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      slicePaperPovParent({
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: '   ',
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + amount '1'", () => {
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        amount: '1',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        amount: '1',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'twap',
        status: 'paper',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'running',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'approved',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        amount: '1',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses omitted / null / whitespace amount with missing_qty even when maxParticipationBps is 1000 (no invented size from participation rate)', () => {
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        maxParticipationBps: 1000,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        amount: null,
        maxParticipationBps: 1000,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        amount: '',
        maxParticipationBps: 1000,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        amount: '   ',
        maxParticipationBps: 1000,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    const blank = slicePaperPovParent({
      parentClientOrderId: 'p-pov',
      status: 'paper',
      amount: '',
      maxParticipationBps: 1000,
      paper: PAPER_ON,
    });
    expect(blank).not.toHaveProperty('amount');
    expect(blank).not.toHaveProperty('sliced');
  });

  it("refuses 'nope' with qty_invalid", () => {
    expect(
      slicePaperPovParent({
        parentClientOrderId: 'p-pov',
        status: 'paper',
        amount: 'nope',
        maxParticipationBps: 1000,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
  });

  it("refuses '0' with qty_invalid", () => {
    const zero = slicePaperPovParent({
      parentClientOrderId: 'p-pov',
      status: 'paper',
      amount: '0',
      maxParticipationBps: 1000,
      paper: PAPER_ON,
    });
    expect(zero).toMatchObject({ ok: false, reason: 'qty_invalid' });
    expect(zero).not.toMatchObject({ amount: '1000' });
    expect(zero).not.toHaveProperty('sliced');
  });

  it("happy: status paper + amount '1.25' + paper on + maxParticipationBps 1000 → sliced true, paper true, amount '1.25' (not invented from rate), kind pov", () => {
    const result = slicePaperPovParent({
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      status: 'paper',
      amount: '1.25',
      maxParticipationBps: 1000,
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      paper: true,
      parent: { parentClientOrderId: 'p-pov', kind: 'pov' },
      amount: '1.25',
    });
    expect(result).not.toMatchObject({ amount: '1000' });
    if (result.ok) {
      expect(result.amount).toBe('1.25');
      expect(result.amount).not.toBe('1000');
      expect(result.paper).toBe(true);
      expect(result.parent.kind).toBe('pov');
    }
  });
});
