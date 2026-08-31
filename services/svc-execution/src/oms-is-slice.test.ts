import { describe, expect, it } from 'vitest';
import { sliceImplementationShortfallParent } from './oms-is-slice.js';

describe('sliceImplementationShortfallParent', () => {
  it('refuses missing parentClientOrderId', () => {
    expect(
      sliceImplementationShortfallParent({
        status: 'running',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: '   ',
        status: 'running',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it("refuses null/undefined/whitespace amount with missing_qty even if arrivalPrice is '100'", () => {
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: null,
        arrivalPrice: '100',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: undefined,
        arrivalPrice: '100',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: '',
        arrivalPrice: '100',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: '   ',
        arrivalPrice: '100',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    const blank = sliceImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      status: 'running',
      amount: '',
      arrivalPrice: '100',
    });
    expect(blank).not.toHaveProperty('amount');
    expect(blank).not.toHaveProperty('sliced');
  });

  it("refuses '0' / 'nope' with qty_invalid — does not use arrival as size", () => {
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: '0',
        arrivalPrice: '100',
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'running',
        amount: 'nope',
        arrivalPrice: '100',
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
    const zero = sliceImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      status: 'running',
      amount: '0',
      arrivalPrice: '100',
    });
    expect(zero).not.toMatchObject({ amount: '100' });
    expect(zero).not.toHaveProperty('sliced');
  });

  it('refuses status stopped/paper with not_live', () => {
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'stopped',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'paper',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'expired',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses omitted status with not_live', () => {
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses kind twap with not_live', () => {
    expect(
      sliceImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        kind: 'twap',
        status: 'running',
        amount: '0.5',
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it("happy: running IS parent + amount '0.5' + arrivalPrice '100' → sliced true, amount '0.5' (not '100')", () => {
    const result = sliceImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      kind: 'implementation_shortfall',
      status: 'running',
      amount: '0.5',
      arrivalPrice: '100',
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      parent: { parentClientOrderId: 'p-is', kind: 'implementation_shortfall' },
      amount: '0.5',
    });
    expect(result).not.toMatchObject({ amount: '100' });
    if (result.ok) {
      expect(result.amount).toBe('0.5');
      expect(result.amount).not.toBe('100');
    }
  });

  it('result amount equals caller amount string, never arrivalPrice', () => {
    const result = sliceImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      status: 'approved',
      amount: '1.25',
      arrivalPrice: '99.5',
    });
    expect(result).toMatchObject({
      ok: true,
      sliced: true,
      amount: '1.25',
    });
    if (result.ok) {
      expect(result.amount).toBe('1.25');
      expect(result.amount).not.toBe('99.5');
    }
  });
});
