import { describe, expect, it } from 'vitest';
import { expirePaperBracketParent } from './oms-paper-bracket-expire.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const EXPIRE_AT = '2026-08-31T18:00:00.000Z';
const NOW = new Date('2026-08-31T17:00:00.000Z');

describe('expirePaperBracketParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      expirePaperBracketParent({
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      expirePaperBracketParent({
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
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / oco with not_live', () => {
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'twap',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'oco',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status expired with already_expired', () => {
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'expired',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_expired' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'stopped',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_live (do not invent paper expire over live)', () => {
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses omitted expireAt / blank / invalid with missing_expire_at even when now is passed', () => {
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        expireAt: '   ',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expirePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        status: 'paper',
        expireAt: 'not-a-timestamp',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
  });

  it("happy: status paper + expireAt + remaining '10' + paper on — all three legs cancel, residual stays", () => {
    const expired = expirePaperBracketParent({
      parentClientOrderId: 'p-brkt',
      kind: 'bracket',
      status: 'paper',
      expireAt: EXPIRE_AT,
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(expired).toEqual({
      ok: true,
      expired: true,
      paper: true,
      parent: { parentClientOrderId: 'p-brkt', kind: 'bracket' },
      status: 'expired',
      expireAt: EXPIRE_AT,
      cancelledLegs: ['entry', 'take_profit', 'stop_loss'],
      residual: { remaining: '10' },
    });
    expect(expired).not.toHaveProperty('matching');
  });

  it('cancelledLegs is always entry, take_profit, and stop_loss — never a leftover leg', () => {
    const expired = expirePaperBracketParent({
      parentClientOrderId: 'p-brkt',
      status: 'paper',
      expireAt: EXPIRE_AT,
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(expired).toMatchObject({
      ok: true,
      cancelledLegs: ['entry', 'take_profit', 'stop_loss'],
    });
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const expired = expirePaperBracketParent({
      parentClientOrderId: 'p-brkt',
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
      cancelledLegs: ['entry', 'take_profit', 'stop_loss'],
      residual: { remaining: null },
    });
  });
});
