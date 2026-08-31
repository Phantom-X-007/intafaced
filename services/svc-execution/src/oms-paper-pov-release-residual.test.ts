import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { releaseExpiredPaperPovResidual } from './oms-paper-pov-release-residual.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const RETAINED_REMAINING = '1.25';

describe('releaseExpiredPaperPovResidual', () => {
  it('refuses missing parentClientOrderId', () => {
    expect(
      releaseExpiredPaperPovResidual({
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      releaseExpiredPaperPovResidual({
        parentClientOrderId: '   ',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status expired + remaining '1.25'", () => {
    expect(
      releaseExpiredPaperPovResidual({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        status: 'expired',
        remaining: RETAINED_REMAINING,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      releaseExpiredPaperPovResidual({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      releaseExpiredPaperPovResidual({
        parentClientOrderId: 'p-pov',
        kind: 'twap',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses status paper / running / omitted with not_expired even when remaining is '1.25'", () => {
    const base = {
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      remaining: RETAINED_REMAINING,
      paper: PAPER_ON,
    };
    expect(releaseExpiredPaperPovResidual({ ...base, status: 'paper' })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    expect(releaseExpiredPaperPovResidual({ ...base, status: 'running' })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    expect(releaseExpiredPaperPovResidual(base)).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
  });

  it('refuses residualReleased true with already_released', () => {
    expect(
      releaseExpiredPaperPovResidual({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        status: 'expired',
        remaining: RETAINED_REMAINING,
        residualReleased: true,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_released' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    const base = {
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      status: 'expired',
      paper: PAPER_ON,
    };
    expect(releaseExpiredPaperPovResidual(base)).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredPaperPovResidual({ ...base, remaining: null })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredPaperPovResidual({ ...base, remaining: '' })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
    expect(releaseExpiredPaperPovResidual({ ...base, remaining: '   ' })).toMatchObject({
      ok: false,
      reason: 'missing_residual',
    });
  });

  it("refuses invalid remaining 'not-an-amount' with missing_residual", () => {
    expect(
      releaseExpiredPaperPovResidual({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        status: 'expired',
        remaining: 'not-an-amount',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it("happy expired paper remaining '1.25' + paper on: released through ledger-client", () => {
    const result = releaseExpiredPaperPovResidual({
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      status: 'expired',
      remaining: RETAINED_REMAINING,
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      released: true,
      paper: true,
      parent: { parentClientOrderId: 'p-pov', kind: 'pov' },
      status: 'expired',
      residual: {
        remaining: formatAmount(parseAmount(RETAINED_REMAINING)),
        released: true,
      },
    });
  });
});
