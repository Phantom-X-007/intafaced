import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { releaseExpiredPaperScaleInResidual } from './oms-paper-scale-in-release-residual.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const RETAINED_REMAINING = '1.25';

describe('releaseExpiredPaperScaleInResidual', () => {
  it('refuses missing parentClientOrderId', () => {
    expect(
      releaseExpiredPaperScaleInResidual({
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      releaseExpiredPaperScaleInResidual({
        parentClientOrderId: '   ',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status expired + remaining '1.25'", () => {
    expect(
      releaseExpiredPaperScaleInResidual({
        parentClientOrderId: 'p-scale',
        kind: 'scale-in',
        status: 'expired',
        remaining: RETAINED_REMAINING,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      releaseExpiredPaperScaleInResidual({
        parentClientOrderId: 'p-scale',
        kind: 'scale-in',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      releaseExpiredPaperScaleInResidual({
        parentClientOrderId: 'p-scale',
        kind: 'twap',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses status paper / running / omitted with not_expired even when remaining is '1.25'", () => {
    const base = {
      parentClientOrderId: 'p-scale',
      kind: 'scale-in' as const,
      remaining: RETAINED_REMAINING,
      paper: PAPER_ON,
    };
    expect(releaseExpiredPaperScaleInResidual({ ...base, status: 'paper' })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    expect(releaseExpiredPaperScaleInResidual({ ...base, status: 'running' })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    expect(releaseExpiredPaperScaleInResidual(base)).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
  });

  it('refuses residualReleased true with already_released', () => {
    expect(
      releaseExpiredPaperScaleInResidual({
        parentClientOrderId: 'p-scale',
        kind: 'scale-in',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        residualReleased: true,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_released' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    const base = {
      parentClientOrderId: 'p-scale',
      kind: 'scale-in' as const,
      status: 'expired',
      paper: PAPER_ON,
    };
    expect(releaseExpiredPaperScaleInResidual(base)).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredPaperScaleInResidual({ ...base, remaining: null })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredPaperScaleInResidual({ ...base, remaining: '' })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredPaperScaleInResidual({ ...base, remaining: '   ' })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
  });

  it("refuses invalid remaining 'not-an-amount' with missing_residual", () => {
    expect(
      releaseExpiredPaperScaleInResidual({
        parentClientOrderId: 'p-scale',
        kind: 'scale-in',
        status: 'expired',
        remaining: 'not-an-amount',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it("happy expired paper remaining '1.25' + paper on: released through ledger-client", () => {
    const result = releaseExpiredPaperScaleInResidual({
      parentClientOrderId: 'p-scale',
      kind: 'scale-in',
      status: 'expired',
      remaining: RETAINED_REMAINING,
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      released: true,
      paper: true,
      parent: { parentClientOrderId: 'p-scale', kind: 'scale-in' },
      status: 'expired',
      residual: {
        remaining: formatAmount(parseAmount(RETAINED_REMAINING)),
        released: true,
      },
    });
    expect(result).not.toHaveProperty('matching');
  });
});
