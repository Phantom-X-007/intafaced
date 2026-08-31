import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { stopTwapParent } from './oms-twap-stop.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const REMAINING = '1.25';

describe('stopTwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      stopTwapParent({
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      stopTwapParent({
        parentClientOrderId: '   ',
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even when running', () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind vwap / pov with not_live', () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'vwap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'pov',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses already-stopped parent with already_stopped', () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'stopped',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses approved / paper / omitted status with not_running', () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'approved',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'paper',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: null,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it("refuses invalid remaining 'not-an-amount' with missing_residual", () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: 'not-an-amount',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      stopTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: running + remaining — childrenTakeNew false, residual via ledger-client, not paper', () => {
    const result = stopTwapParent({
      parentClientOrderId: 'p-twap',
      kind: 'twap',
      status: 'running',
      remaining: REMAINING,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(result).toEqual({
      ok: true,
      stopped: true,
      parent: { parentClientOrderId: 'p-twap', kind: 'twap' },
      childrenTakeNew: false,
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
  });
});
