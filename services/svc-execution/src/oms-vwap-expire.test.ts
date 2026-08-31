import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { expireVwapParent } from './oms-vwap-expire.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const EXPIRE_AT = '2026-08-31T18:00:00.000Z';
const REMAINING = '1.25';
const NOW = new Date('2026-08-31T18:00:00.000Z');

describe('expireVwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      expireVwapParent({
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      expireVwapParent({
        parentClientOrderId: '   ',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even when running', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'pov',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses already-expired parent with already_expired', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'expired',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'already_expired' });
  });

  it('refuses already-stopped parent with already_stopped', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'stopped',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses approved / paper / omitted status with not_running', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'approved',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / null / whitespace / invalid expireAt with missing_expire_at (never invent from the clock)', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: null,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: '   ',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: 'not-a-date',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: null,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      expireVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: running + retained expireAt + remaining — status expired, residual via ledger-client, not paper', () => {
    const result = expireVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      status: 'running',
      expireAt: EXPIRE_AT,
      remaining: REMAINING,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      expired: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      status: 'expired',
      expireAt: EXPIRE_AT,
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
  });
});
