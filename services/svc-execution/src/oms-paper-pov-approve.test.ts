import { describe, expect, it } from 'vitest';
import { approvePaperPovParent } from './oms-paper-pov-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('approvePaperPovParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperPovParent({
        kind: 'pov',
        maxParticipationBps: 1000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperPovParent({
        parentClientOrderId: '   ',
        kind: 'pov',
        maxParticipationBps: 1000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with maxParticipationBps 1000', () => {
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: 1000,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: 1000,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / vwap with not_live', () => {
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'twap',
        maxParticipationBps: 1000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'vwap',
        maxParticipationBps: 1000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperPovParent({
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      maxParticipationBps: 1000,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperPovParent({
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      maxParticipationBps: 1000,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it('refuses null / undefined maxParticipationBps with max_participation_blank (paper on + operator present — no invented rate)', () => {
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: null,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'max_participation_blank' });
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: undefined,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'max_participation_blank' });
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'max_participation_blank' });
  });

  it('refuses 1.5 / -1 with max_participation_invalid', () => {
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: 1.5,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'max_participation_invalid' });
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: -1,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'max_participation_invalid' });
  });

  it('happy: parent id + kind pov + maxParticipationBps 1000 + operator + paper on', () => {
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: 1000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-pov', kind: 'pov' },
      status: 'paper',
      maxParticipationBps: 1000,
    });
  });

  it('happy: parent id + kind omitted + maxParticipationBps 0 + operator + paper on', () => {
    expect(
      approvePaperPovParent({
        parentClientOrderId: 'p-pov',
        maxParticipationBps: 0,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-pov', kind: 'pov' },
      status: 'paper',
      maxParticipationBps: 0,
    });
  });
});
