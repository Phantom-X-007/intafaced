import { describe, expect, it } from 'vitest';
import { stopPaperImplementationShortfallParent } from './oms-is-paper-stop.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;

describe('stopPaperImplementationShortfallParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopPaperImplementationShortfallParent({
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: '   ',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper', () => {
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        kind: 'twap',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'stopped',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_running (do not invent paper stop over live)', () => {
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / approved status with not_running', () => {
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopPaperImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'approved',
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it("happy: status paper + remaining '10' + paper on", () => {
    const stopped = stopPaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(stopped).toEqual({
      ok: true,
      stopped: true,
      paper: true,
      parent: { parentClientOrderId: 'p-is', kind: 'implementation_shortfall' },
      childrenTakeNew: false,
      residual: { remaining: '10' },
    });
    expect(stopped).not.toHaveProperty('canceled');
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const stopped = stopPaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
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
    const stopped = stopPaperImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      kind: 'implementation_shortfall',
      status: 'paper',
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(Object.keys(stopped as object)).not.toContain('canceled');
    expect(stopped).not.toMatchObject({ canceled: expect.anything() });
  });
});
