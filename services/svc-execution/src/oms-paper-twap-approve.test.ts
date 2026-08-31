import { describe, expect, it } from 'vitest';
import { approvePaperTwapParent } from './oms-paper-twap-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('approvePaperTwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperTwapParent({
        kind: 'twap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: '   ',
        kind: 'twap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with durationMs 60_000', () => {
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: 60_000,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind vwap / pov with not_live', () => {
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'vwap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'pov',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperTwapParent({
      parentClientOrderId: 'p-twap',
      kind: 'twap',
      durationMs: 60_000,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperTwapParent({
      parentClientOrderId: 'p-twap',
      kind: 'twap',
      durationMs: 60_000,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it('refuses null / undefined durationMs with duration_blank (paper on + operator present — no invented schedule from slices)', () => {
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: null,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_blank' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: undefined,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_blank' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_blank' });
  });

  it('refuses 0 / 1.5 / -1 with duration_invalid', () => {
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: 0,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_invalid' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: 1.5,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_invalid' });
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: -1,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_invalid' });
  });

  it('happy: parent id + kind twap + durationMs 60_000 + operator + paper on', () => {
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-twap', kind: 'twap' },
      status: 'paper',
      durationMs: 60000,
    });
  });

  it('happy: parent id + kind omitted + durationMs 60_000 + operator + paper on', () => {
    expect(
      approvePaperTwapParent({
        parentClientOrderId: 'p-twap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-twap', kind: 'twap' },
      status: 'paper',
      durationMs: 60000,
    });
  });
});
