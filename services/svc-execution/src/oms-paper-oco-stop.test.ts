import { describe, expect, it } from 'vitest';
import { stopPaperOcoParent } from './oms-paper-oco-stop.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('stopPaperOcoParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopPaperOcoParent({
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopPaperOcoParent({
        parentClientOrderId: '   ',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper', () => {
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / pegged with not_live', () => {
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        kind: 'twap',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        kind: 'pegged',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'stopped',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_running (do not invent paper stop over live)', () => {
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'running',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / approved status with not_running', () => {
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopPaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'approved',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it("happy: status paper + remaining '10' + paper on — both siblings cancel, residual stays", () => {
    const stopped = stopPaperOcoParent({
      parentClientOrderId: 'p-oco',
      kind: 'oco',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toEqual({
      ok: true,
      stopped: true,
      paper: true,
      parent: { parentClientOrderId: 'p-oco', kind: 'oco' },
      cancelledSiblings: ['take_profit', 'stop_loss'],
      childrenTakeNew: false,
      residual: { remaining: '10' },
    });
    expect(stopped).not.toHaveProperty('matching');
  });

  it('cancelledSiblings is always both take_profit and stop_loss — never one-sided', () => {
    const stopped = stopPaperOcoParent({
      parentClientOrderId: 'p-oco',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toMatchObject({
      ok: true,
      cancelledSiblings: ['take_profit', 'stop_loss'],
    });
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const stopped = stopPaperOcoParent({
      parentClientOrderId: 'p-oco',
      status: 'paper',
      paper: PAPER_ON,
    });
    expect(stopped).toMatchObject({
      ok: true,
      stopped: true,
      paper: true,
      cancelledSiblings: ['take_profit', 'stop_loss'],
      childrenTakeNew: false,
      residual: { remaining: null },
    });
  });
});
