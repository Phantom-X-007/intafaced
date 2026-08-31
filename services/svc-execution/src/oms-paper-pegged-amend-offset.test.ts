import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { amendPaperPeggedOffset } from './oms-paper-pegged-amend-offset.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const OFFSET = '0.05';

describe('amendPaperPeggedOffset', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      amendPaperPeggedOffset({
        status: 'paper',
        offset: OFFSET,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: '   ',
        status: 'paper',
        offset: OFFSET,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + offset '0.05'", () => {
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        offset: OFFSET,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        offset: OFFSET,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        kind: 'twap',
        status: 'paper',
        offset: OFFSET,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'running',
        offset: OFFSET,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'approved',
        offset: OFFSET,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        offset: OFFSET,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace offset with offset_blank even when amount is '1000'", () => {
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        offset: null,
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        offset: '',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        offset: '   ',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_blank' });
  });

  it("refuses 'not-an-amount' with offset_invalid (no invented offset from parent amount)", () => {
    expect(
      amendPaperPeggedOffset({
        parentClientOrderId: 'p-peg',
        status: 'paper',
        offset: 'not-an-amount',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'offset_invalid' });
  });

  it("happy: status paper + offset '0.05' + paper on — through ledger-client, not invented from amount", () => {
    const result = amendPaperPeggedOffset({
      parentClientOrderId: 'p-peg',
      kind: 'pegged',
      status: 'paper',
      offset: OFFSET,
      amount: '1000',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      amended: true,
      paper: true,
      parent: { parentClientOrderId: 'p-peg', kind: 'pegged' },
      offset: formatAmount(parseAmount(OFFSET)),
    });
    expect(result).not.toMatchObject({ offset: '1000' });
  });
});
