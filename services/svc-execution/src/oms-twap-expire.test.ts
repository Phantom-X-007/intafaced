import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { expireTwapParent } from './oms-twap-expire.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const EXPIRE_AT = '2026-08-31T18:00:00.000Z';
const REMAINING = '1.25';
const NOW = new Date('2026-08-31T18:00:00.000Z');

describe('expireTwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      expireTwapParent({
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      expireTwapParent({
        parentClientOrderId: '   ',
        kind: 'twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind vwap / pov with not_live', () => {
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'vwap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'approved',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: null,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: '   ',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: null,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      expireTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: running + retained expireAt + remaining — status expired, residual via ledger-client, not paper', () => {
    const result = expireTwapParent({
      parentClientOrderId: 'p-twap',
      kind: 'twap',
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
      parent: { parentClientOrderId: 'p-twap', kind: 'twap' },
      status: 'expired',
      expireAt: EXPIRE_AT,
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
  });
});
