import { describe, expect, it } from 'vitest';
import { stopPaperPeggedParent } from './oms-paper-pegged-stop.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('stopPaperPeggedParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopPaperPeggedParent({
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: '   ',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper', () => {
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'twap',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'stopped',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_running (do not invent paper stop over live)', () => {
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'running',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / approved status with not_running', () => {
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopPaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'approved',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it("happy: status paper + remaining '10' + paper on", () => {
    const stopped = stopPaperPeggedParent({
      parentClientOrderId: 'p-peg',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toEqual({
      ok: true,
      stopped: true,
      paper: true,
      parent: { parentClientOrderId: 'p-peg', kind: 'pegged' },
      childrenTakeNew: false,
      residual: { remaining: '10' },
    });
    expect(stopped).not.toHaveProperty('canceled');
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const stopped = stopPaperPeggedParent({
      parentClientOrderId: 'p-peg',
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
    const stopped = stopPaperPeggedParent({
      parentClientOrderId: 'p-peg',
      kind: 'pegged',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(Object.keys(stopped as object)).not.toContain('canceled');
    expect(stopped).not.toMatchObject({ canceled: expect.anything() });
  });
});
