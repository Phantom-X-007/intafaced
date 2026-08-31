import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePaperIcebergParent } from './oms-paper-iceberg-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const DISPLAY = '100';

describe('approvePaperIcebergParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePaperIcebergParent({
        kind: 'iceberg',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: '   ',
        kind: 'iceberg',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with displayQty '100'", () => {
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: DISPLAY,
        operatorId: OP,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'twap',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'pov',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    const missing = approvePaperIcebergParent({
      parentClientOrderId: 'p-ice',
      kind: 'iceberg',
      displayQty: DISPLAY,
      paper: PAPER_ON,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approvePaperIcebergParent({
      parentClientOrderId: 'p-ice',
      kind: 'iceberg',
      displayQty: DISPLAY,
      operatorId: '   ',
      paper: PAPER_ON,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it("refuses omitted / null / whitespace displayQty with display_qty_blank even when amount is '1000'", () => {
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: null,
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: '',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: '   ',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
  });

  it("refuses '0' / 'not-an-amount' with display_qty_invalid (no invented size from parent amount)", () => {
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: '0',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_invalid' });
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: 'not-an-amount',
        amount: '1000',
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_invalid' });
  });

  it("happy: parent id + kind iceberg + displayQty '100' + operator + paper on", () => {
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        kind: 'iceberg',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-ice', kind: 'iceberg' },
      status: 'paper',
      displayQty: formatAmount(parseAmount(DISPLAY)),
    });
  });

  it("happy: parent id + kind omitted + displayQty '100' + operator + paper on", () => {
    expect(
      approvePaperIcebergParent({
        parentClientOrderId: 'p-ice',
        displayQty: DISPLAY,
        operatorId: OP,
        paper: PAPER_ON,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      paper: true,
      parent: { parentClientOrderId: 'p-ice', kind: 'iceberg' },
      status: 'paper',
      displayQty: formatAmount(parseAmount(DISPLAY)),
    });
  });
});
