import { describe, expect, it } from 'vitest';
import { stopPaperScaleInParent } from './oms-paper-scale-in-stop.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('stopPaperScaleInParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopPaperScaleInParent({
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: '   ',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper', () => {
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'paper',
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        kind: 'twap',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'stopped',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_running (do not invent paper stop over live)', () => {
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'running',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / approved status with not_running', () => {
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopPaperScaleInParent({
        parentClientOrderId: 'p-scale',
        status: 'approved',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it("happy: status paper + remaining '10' + paper on", () => {
    const stopped = stopPaperScaleInParent({
      parentClientOrderId: 'p-scale',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toEqual({
      ok: true,
      stopped: true,
      paper: true,
      parent: { parentClientOrderId: 'p-scale', kind: 'scale-in' },
      childrenTakeNew: false,
      residual: { remaining: '10' },
    });
    expect(stopped).not.toHaveProperty('canceled');
    expect(stopped).not.toHaveProperty('matching');
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const stopped = stopPaperScaleInParent({
      parentClientOrderId: 'p-scale',
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
    const stopped = stopPaperScaleInParent({
      parentClientOrderId: 'p-scale',
      kind: 'scale-in',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(Object.keys(stopped as object)).not.toContain('canceled');
    expect(stopped).not.toMatchObject({ canceled: expect.anything() });
  });
});
