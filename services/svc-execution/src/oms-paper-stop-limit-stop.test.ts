import { describe, expect, it } from 'vitest';
import { stopPaperStopLimitParent } from './oms-paper-stop-limit-stop.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('stopPaperStopLimitParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopPaperStopLimitParent({
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: '   ',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper', () => {
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        status: 'paper',
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        status: 'paper',
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        kind: 'twap',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        status: 'stopped',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_running (do not invent paper stop over live)', () => {
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        status: 'running',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / approved status with not_running', () => {
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopPaperStopLimitParent({
        parentClientOrderId: 'p-stpl',
        status: 'approved',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it("happy: status paper + remaining '10' + paper on", () => {
    const stopped = stopPaperStopLimitParent({
      parentClientOrderId: 'p-stpl',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toEqual({
      ok: true,
      stopped: true,
      paper: true,
      parent: { parentClientOrderId: 'p-stpl', kind: 'stop-limit' },
      childrenTakeNew: false,
      residual: { remaining: '10' },
    });
    expect(stopped).not.toHaveProperty('canceled');
    expect(stopped).not.toHaveProperty('matching');
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const stopped = stopPaperStopLimitParent({
      parentClientOrderId: 'p-stpl',
      status: 'paper',
      paper: PAPER_ON,
    });
    expect(stopped).toMatchObject({
      ok: true,
      stopped: true,
      paper: true,
      childrenTakeNew: false,
      residual: { remaining: null },
    });
    expect(stopped).not.toHaveProperty('canceled');
  });

  it('result has no canceled field', () => {
    const stopped = stopPaperStopLimitParent({
      parentClientOrderId: 'p-stpl',
      kind: 'stop-limit',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(Object.keys(stopped as object)).not.toContain('canceled');
    expect(stopped).not.toMatchObject({ canceled: expect.anything() });
  });
});
