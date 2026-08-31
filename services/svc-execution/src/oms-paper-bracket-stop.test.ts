import { describe, expect, it } from 'vitest';
import { stopPaperBracketParent } from './oms-paper-bracket-stop.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('stopPaperBracketParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopPaperBracketParent({
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopPaperBracketParent({
        parentClientOrderId: '   ',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper', () => {
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / oco with not_live', () => {
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'twap',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'oco',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'stopped',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_running (do not invent paper stop over live)', () => {
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'running',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / approved status with not_running', () => {
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopPaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'approved',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it("happy: status paper + remaining '10' + paper on — all three legs cancel, residual stays", () => {
    const stopped = stopPaperBracketParent({
      parentClientOrderId: 'p-brkt',
      kind: 'bracket',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toEqual({
      ok: true,
      stopped: true,
      paper: true,
      parent: { parentClientOrderId: 'p-brkt', kind: 'bracket' },
      cancelledLegs: ['entry', 'take_profit', 'stop_loss'],
      childrenTakeNew: false,
      residual: { remaining: '10' },
    });
    expect(stopped).not.toHaveProperty('matching');
  });

  it('cancelledLegs is always entry, take_profit, and stop_loss — never a leftover leg', () => {
    const stopped = stopPaperBracketParent({
      parentClientOrderId: 'p-brkt',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toMatchObject({
      ok: true,
      cancelledLegs: ['entry', 'take_profit', 'stop_loss'],
    });
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const stopped = stopPaperBracketParent({
      parentClientOrderId: 'p-brkt',
      status: 'paper',
      paper: PAPER_ON,
    });
    expect(stopped).toMatchObject({
      ok: true,
      stopped: true,
      paper: true,
      cancelledLegs: ['entry', 'take_profit', 'stop_loss'],
      childrenTakeNew: false,
      residual: { remaining: null },
    });
  });
});
