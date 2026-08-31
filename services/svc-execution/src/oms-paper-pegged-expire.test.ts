import { describe, expect, it } from 'vitest';
import { expirePaperPeggedParent } from './oms-paper-pegged-expire.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const EXPIRE_AT = '2026-08-31T18:00:00.000Z';
const NOW = new Date('2026-08-31T17:00:00.000Z');

describe('expirePaperPeggedParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      expirePaperPeggedParent({
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: '   ',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with status paper + expireAt', () => {
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        kind: 'twap',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status expired with already_expired', () => {
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'expired',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_expired' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'stopped',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_live (do not invent paper expire over live)', () => {
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses omitted expireAt / blank / invalid with missing_expire_at even when now is passed', () => {
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        expireAt: '   ',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expirePaperPeggedParent({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        expireAt: 'not-a-timestamp',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
  });

  it("happy: status paper + expireAt + remaining '10' + paper on", () => {
    const expired = expirePaperPeggedParent({
      parentClientOrderId: 'p-peg',
      status: 'paper',
      expireAt: EXPIRE_AT,
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(expired).toEqual({
      ok: true,
      expired: true,
      paper: true,
      parent: { parentClientOrderId: 'p-peg', kind: 'pegged' },
      status: 'expired',
      expireAt: EXPIRE_AT,
      residual: { remaining: '10' },
    });
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const expired = expirePaperPeggedParent({
      parentClientOrderId: 'p-peg',
      status: 'paper',
      expireAt: EXPIRE_AT,
      paper: PAPER_ON,
    });
    expect(expired).toMatchObject({
      ok: true,
      expired: true,
      paper: true,
      status: 'expired',
      expireAt: EXPIRE_AT,
      residual: { remaining: null },
    });
  });
});
