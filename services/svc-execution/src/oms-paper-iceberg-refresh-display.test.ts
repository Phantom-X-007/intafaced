import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { refreshPaperIcebergDisplayQty } from './oms-paper-iceberg-refresh-display.js';

const PAPER_ON = { enabled: true } as const;
const PAPER_OFF = { enabled: false } as const;
const DISPLAY = '100';

describe('refreshPaperIcebergDisplayQty', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      refreshPaperIcebergDisplayQty({
        status: 'paper',
        displayQty: DISPLAY,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: '   ',
        status: 'paper',
        displayQty: DISPLAY,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("paper unwired / paper_off refuse even with status paper + displayQty '100'", () => {
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: DISPLAY,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_gate_unwired' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: DISPLAY,
        paper: PAPER_OFF,
      }),
    ).toMatchObject({ ok: false, reason: 'paper_off' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        kind: 'twap',
        status: 'paper',
        displayQty: DISPLAY,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses status running / approved / omitted with not_live (this door is paper-only)', () => {
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'running',
        displayQty: DISPLAY,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'approved',
        displayQty: DISPLAY,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        displayQty: DISPLAY,
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("refuses omitted / null / whitespace displayQty with display_qty_blank even when amount is '1000'", () => {
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: null,
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: '',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: '   ',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_blank' });
  });

  it("refuses '0' / 'not-an-amount' with display_qty_invalid (no invented size from parent amount)", () => {
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: '0',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_invalid' });
    expect(
      refreshPaperIcebergDisplayQty({
        parentClientOrderId: 'p-ice',
        status: 'paper',
        displayQty: 'not-an-amount',
        amount: '1000',
        paper: PAPER_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'display_qty_invalid' });
  });

  it("happy: status paper + displayQty '100' + paper on — through ledger-client, not invented from amount", () => {
    const result = refreshPaperIcebergDisplayQty({
      parentClientOrderId: 'p-ice',
      kind: 'iceberg',
      status: 'paper',
      displayQty: DISPLAY,
      amount: '1000',
      paper: PAPER_ON,
    });
    expect(result).toEqual({
      ok: true,
      refreshed: true,
      paper: true,
      parent: { parentClientOrderId: 'p-ice', kind: 'iceberg' },
      displayQty: formatAmount(parseAmount(DISPLAY)),
    });
    expect(result).not.toMatchObject({ displayQty: '1000' });
  });
});
