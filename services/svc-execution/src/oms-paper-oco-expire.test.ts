import { describe, expect, it } from 'vitest';
import { expirePaperOcoParent } from './oms-paper-oco-expire.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const EXPIRE_AT = '2026-08-31T18:00:00.000Z';
const NOW = new Date('2026-08-31T17:00:00.000Z');

describe('expirePaperOcoParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      expirePaperOcoParent({
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      expirePaperOcoParent({
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
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / pegged with not_live', () => {
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        kind: 'twap',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        kind: 'pegged',
        status: 'paper',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status expired with already_expired', () => {
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'expired',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_expired' });
  });

  it('refuses status stopped with already_stopped', () => {
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'stopped',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'already_stopped' });
  });

  it('refuses status running with not_live (do not invent paper expire over live)', () => {
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'running',
        expireAt: EXPIRE_AT,
        remaining: '10',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses omitted expireAt / blank / invalid with missing_expire_at even when now is passed', () => {
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        expireAt: '   ',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
    expect(
      expirePaperOcoParent({
        parentClientOrderId: 'p-oco',
        status: 'paper',
        expireAt: 'not-a-timestamp',
        remaining: '10',
        paper: PAPER_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_expire_at' });
  });

  it("happy: status paper + expireAt + remaining '10' + paper on — both siblings cancel, residual stays", () => {
    const expired = expirePaperOcoParent({
      parentClientOrderId: 'p-oco',
      kind: 'oco',
      status: 'paper',
      expireAt: EXPIRE_AT,
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(expired).toEqual({
      ok: true,
      expired: true,
      paper: true,
      parent: { parentClientOrderId: 'p-oco', kind: 'oco' },
      status: 'expired',
      expireAt: EXPIRE_AT,
      cancelledSiblings: ['take_profit', 'stop_loss'],
      residual: { remaining: '10' },
    });
    expect(expired).not.toHaveProperty('matching');
  });

  it('cancelledSiblings is always both take_profit and stop_loss — never one-sided', () => {
    const expired = expirePaperOcoParent({
      parentClientOrderId: 'p-oco',
      status: 'paper',
      expireAt: EXPIRE_AT,
      remaining: '10',
      paper: PAPER_ON,
    });
    expect(expired).toMatchObject({
      ok: true,
      cancelledSiblings: ['take_profit', 'stop_loss'],
    });
  });

  it('without remaining: residual.remaining null (not invented)', () => {
    const expired = expirePaperOcoParent({
      parentClientOrderId: 'p-oco',
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
      cancelledSiblings: ['take_profit', 'stop_loss'],
      residual: { remaining: null },
    });
  });
});
