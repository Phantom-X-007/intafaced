import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePaperTrailingStopParent } from './oms-paper-trailing-stop-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const TRAIL = '0.05';

describe('approvePaperTrailingStopParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperTrailingStopParent({
        kind: 'trailing-stop',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: '   ',
        kind: 'trailing-stop',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with trailOffset '0.05'", () => {
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: TRAIL,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / pegged with not_live', () => {
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'twap',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'pegged',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperTrailingStopParent({
      parentClientOrderId: 'p-trail',
      kind: 'trailing-stop',
      trailOffset: TRAIL,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperTrailingStopParent({
      parentClientOrderId: 'p-trail',
      kind: 'trailing-stop',
      trailOffset: TRAIL,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it("refuses omitted / null / whitespace trailOffset with trail_blank even when amount is '1000'", () => {
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: null,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: '',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: '   ',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
  });

  it("refuses 'not-an-amount' with trail_invalid (no invented trail from parent amount)", () => {
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: 'not-an-amount',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_invalid' });
  });

  it("happy: parent id + kind trailing-stop + trailOffset '0.05' + operator + paper on", () => {
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        kind: 'trailing-stop',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-trail', kind: 'trailing-stop' },
      status: 'paper',
      trailOffset: formatAmount(parseAmount(TRAIL)),
    });
  });

  it("happy: parent id + kind omitted + trailOffset '0.05' + operator + paper on", () => {
    expect(
      approvePaperTrailingStopParent({
        parentClientOrderId: 'p-trail',
        trailOffset: TRAIL,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-trail', kind: 'trailing-stop' },
      status: 'paper',
      trailOffset: formatAmount(parseAmount(TRAIL)),
    });
  });
});
