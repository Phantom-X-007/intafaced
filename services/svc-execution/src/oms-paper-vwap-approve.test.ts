import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePaperVwapParent } from './oms-paper-vwap-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const VOLUME = '1000';

describe('approvePaperVwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperVwapParent({
        kind: 'vwap',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: '   ',
        kind: 'vwap',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with targetVolume '1000'", () => {
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: VOLUME,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'pov',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      targetVolume: VOLUME,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      targetVolume: VOLUME,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it('refuses omitted / null / whitespace targetVolume with target_volume_blank even when durationMs is 60_000', () => {
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'target_volume_blank' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: null,
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'target_volume_blank' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: '',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'target_volume_blank' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: '   ',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'target_volume_blank' });
  });

  it("refuses '0' / 'not-an-amount' with target_volume_invalid (no invented volume from duration)", () => {
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: '0',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'target_volume_invalid' });
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: 'not-an-amount',
        durationMs: 60_000,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'target_volume_invalid' });
  });

  it("happy: parent id + kind vwap + targetVolume '1000' + operator + paper on", () => {
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      status: 'paper',
      targetVolume: formatAmount(parseAmount(VOLUME)),
    });
  });

  it("happy: parent id + kind omitted + targetVolume '1000' + operator + paper on", () => {
    expect(
      approvePaperVwapParent({
        parentClientOrderId: 'p-vwap',
        targetVolume: VOLUME,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      status: 'paper',
      targetVolume: formatAmount(parseAmount(VOLUME)),
    });
  });
});
