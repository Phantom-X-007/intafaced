import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { amendPaperTrailingStopTrail } from './oms-paper-trailing-stop-amend-trail.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const TRAIL = '0.05';

describe('amendPaperTrailingStopTrail', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      amendPaperTrailingStopTrail({
        status: 'paper',
        trailOffset: TRAIL,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: '   ',
        status: 'paper',
        trailOffset: TRAIL,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + trailOffset '0.05'", () => {
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        trailOffset: TRAIL,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        trailOffset: TRAIL,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        kind: 'twap',
        status: 'paper',
        trailOffset: TRAIL,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'running',
        trailOffset: TRAIL,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'approved',
        trailOffset: TRAIL,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        trailOffset: TRAIL,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace trailOffset with trail_blank even when amount is '1000'", () => {
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        trailOffset: null,
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        trailOffset: '',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        trailOffset: '   ',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_blank' });
  });

  it("refuses 'not-an-amount' with trail_invalid (no invented trail from parent amount)", () => {
    expect(
      amendPaperTrailingStopTrail({
        parentClientOrderId: 'p-trail',
        status: 'paper',
        trailOffset: 'not-an-amount',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'trail_invalid' });
  });

  it("happy: status paper + trailOffset '0.05' + paper on — through ledger-client, not invented from amount", () => {
    const result = amendPaperTrailingStopTrail({
      parentClientOrderId: 'p-trail',
      kind: 'trailing-stop',
      status: 'paper',
      trailOffset: TRAIL,
      amount: '1000',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      amended: true,
      paper: true,
      parent: { parentClientOrderId: 'p-trail', kind: 'trailing-stop' },
      trailOffset: formatAmount(parseAmount(TRAIL)),
    });
    expect(result).not.toMatchObject({ trailOffset: '1000' });
  });
});
