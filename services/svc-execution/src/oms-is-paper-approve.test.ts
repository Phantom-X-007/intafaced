import { describe, expect, it } from 'vitest';
import { approvePaperImplementationShortfallParent } from './oms-is-paper-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('approvePaperImplementationShortfallParent', () => {
  it('refuses missing parentClientOrderId', () => {
    expect(
      approvePaperImplementationShortfallParent({
        arrivalPrice: '100',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: '   ',
        arrivalPrice: '100',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('refuses null/undefined/whitespace/empty arrivalPrice with arrival_price_blank', () => {
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: null,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: undefined,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '   ',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
  });

  it("refuses 'nope' with arrival_price_invalid", () => {
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: 'nope',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_invalid' });
  });

  it("refuses '0' with arrival_price_invalid", () => {
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '0',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_invalid' });
  });

  it("paper unwired / paper_off refuse even with arrival '100'", () => {
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('missing operator refuses; result is not approved: true', () => {
    const missing = approvePaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      arrivalPrice: '100',
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      arrivalPrice: '100',
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it("happy: parent id + arrival '100.5' + operator + paper on", () => {
    expect(
      approvePaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100.5',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-is', kind: 'implementation_shortfall' },
      status: 'paper',
      arrivalPrice: '100.5',
    });
  });
});
