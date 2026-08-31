import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { releaseExpiredVwapResidual } from './oms-vwap-release-residual.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const REMAINING = '1.25';

describe('releaseExpiredVwapResidual', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      releaseExpiredVwapResidual({
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: '   ',
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even when expired', () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'pov',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses running / paper / omitted status with not_expired', () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_expired' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'paper',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_expired' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_expired' });
  });

  it('refuses already-released residual with already_released', () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        residualReleased: true,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'already_released' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: null,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it("refuses invalid remaining 'not-an-amount' with missing_residual", () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: 'not-an-amount',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      releaseExpiredVwapResidual({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        remaining: REMAINING,
        jobs: JOBS_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: expired + remaining — residual released via ledger-client, not paper', () => {
    const result = releaseExpiredVwapResidual({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      status: 'expired',
      remaining: REMAINING,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(result).toEqual({
      ok: true,
      released: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      status: 'expired',
      residual: { remaining: formatAmount(parseAmount(REMAINING)), released: true },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
  });
});
