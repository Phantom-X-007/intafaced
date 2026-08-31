import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePaperBracketParent } from './oms-paper-bracket-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const ENTRY = '100';
const TAKE_PROFIT = '101';
const STOP_LOSS = '99';

describe('approvePaperBracketParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperBracketParent({
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: '   ',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('paper unwired / paper_off refuse even with all three legs present', () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / oco with not_live', () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'twap',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'oco',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: '   ',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
  });

  it('refuses omitted / null / whitespace / invalid entry with entry_blank / entry_invalid even when the other legs and amount are present', () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'entry_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: null,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'entry_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: '   ',
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'entry_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: 'not-an-amount',
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'entry_invalid' });
  });

  it('refuses omitted / null / whitespace / invalid takeProfit with take_profit_blank / take_profit_invalid even when entry, stopLoss, and amount are present', () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'take_profit_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: null,
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'take_profit_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: '   ',
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'take_profit_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: 'not-an-amount',
        stopLoss: STOP_LOSS,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'take_profit_invalid' });
  });

  it('refuses omitted / null / whitespace / invalid stopLoss with stop_loss_blank / stop_loss_invalid even when entry, takeProfit, and amount are present', () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'stop_loss_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: null,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'stop_loss_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: '   ',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'stop_loss_blank' });
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: 'not-an-amount',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'stop_loss_invalid' });
  });

  it("happy: parent id + kind bracket + entry '100' + takeProfit '101' + stopLoss '99' + operator + paper on", () => {
    expect(
      approvePaperBracketParent({
        parentClientOrderId: 'p-brkt',
        kind: 'bracket',
        entry: ENTRY,
        takeProfit: TAKE_PROFIT,
        stopLoss: STOP_LOSS,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-brkt', kind: 'bracket' },
      status: 'paper',
      entry: formatAmount(parseAmount(ENTRY)),
      takeProfit: formatAmount(parseAmount(TAKE_PROFIT)),
      stopLoss: formatAmount(parseAmount(STOP_LOSS)),
    });
  });

  it('happy: parent id + kind omitted + all three legs + operator + paper on — not invented from amount', () => {
    const result = approvePaperBracketParent({
      parentClientOrderId: 'p-brkt',
      entry: ENTRY,
      takeProfit: TAKE_PROFIT,
      stopLoss: STOP_LOSS,
      amount: '1000',
      operatorId: OP,
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-brkt', kind: 'bracket' },
      status: 'paper',
      entry: formatAmount(parseAmount(ENTRY)),
      takeProfit: formatAmount(parseAmount(TAKE_PROFIT)),
      stopLoss: formatAmount(parseAmount(STOP_LOSS)),
    });
    expect(result).not.toMatchObject({ entry: '1000' });
    expect(result).not.toMatchObject({ takeProfit: '1000' });
    expect(result).not.toMatchObject({ stopLoss: '1000' });
    expect(result).not.toHaveProperty('matching');
  });
});
