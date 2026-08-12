import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { PayError } from '../payment-service.js';
import { MAX_ATTEMPTS_PER_CYCLE } from './charge-cycle.js';
import {
  CARD_MANDATE_CHARGE_SOCKET,
  MANDATE_PATH_MATRIX,
  PRECHARGE_NOTIFY_SOCKET,
  assertChargeTracesToMandate,
  mandateChargeDisposition,
  mandateDunningBound,
  normaliseSubscriptionPath,
  pathOpensMoney,
  preChargeNotifyGap,
} from './mandate-product.js';
import { assertMandateTermsUnchanged } from './subscription-service.js';

/**
 * D26-P1-P6 — mandate product paths + notify honesty (no invent).
 * Lifecycle pins that must stay true for the Done bar to deepen without
 * stamping done while card rail / pre-charge notify remain sockets.
 */
describe('mandate product paths (card + crypto honest)', () => {
  it('matrix names both paths and only crypto opens money', () => {
    expect(MANDATE_PATH_MATRIX.map((r) => r.path)).toEqual(['crypto_invoice', 'card']);
    expect(pathOpensMoney('crypto_invoice')).toBe(true);
    expect(pathOpensMoney('card')).toBe(false);
    expect(pathOpensMoney('card_mandate')).toBe(false);
  });

  it('crypto disposition opens an invoice — never a pull name', () => {
    expect(mandateChargeDisposition('crypto_invoice')).toEqual({ kind: 'open_crypto_invoice' });
  });

  it('card disposition refuses pay.mandate_rail_absent and names the acquirer socket', () => {
    const d = mandateChargeDisposition('card');
    expect(d).toEqual({
      kind: 'refuse',
      code: 'pay.mandate_rail_absent',
      socket: CARD_MANDATE_CHARGE_SOCKET,
    });
    expect(CARD_MANDATE_CHARGE_SOCKET).toBe('socket.psp-partners');
    expect(mandateChargeDisposition('card_mandate').kind).toBe('refuse');
  });

  it('unknown path still refuses at normalise — no silent crypto invent', () => {
    expect(() => normaliseSubscriptionPath('pull_invented')).toThrow(PayError);
    expect(() => mandateChargeDisposition('pull_invented')).toThrow(PayError);
  });
});

describe('mandate lifecycle law (SPEC §4 Done bar pieces)', () => {
  it('charge must trace to an active mandate with matching amount', () => {
    const amount = parseAmount('12.50');
    expect(() =>
      assertChargeTracesToMandate({
        executionSubscriptionId: 'sub_1',
        subscriptionId: 'sub_1',
        mandateId: 'md_1',
        mandateStatus: 'active',
        amount,
        mandateAmount: amount,
      }),
    ).not.toThrow();
  });

  it('refuses a charge with no mandate id', () => {
    try {
      assertChargeTracesToMandate({
        executionSubscriptionId: 'sub_1',
        subscriptionId: 'sub_1',
        mandateId: null,
        mandateStatus: 'active',
        amount: parseAmount('1'),
        mandateAmount: parseAmount('1'),
      });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as PayError).code).toBe('pay.mandate_not_found');
    }
  });

  it('refuses a charge against a cancelled mandate', () => {
    try {
      assertChargeTracesToMandate({
        executionSubscriptionId: 'sub_1',
        subscriptionId: 'sub_1',
        mandateId: 'md_1',
        mandateStatus: 'cancelled',
        amount: parseAmount('1'),
        mandateAmount: parseAmount('1'),
      });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as PayError).code).toBe('pay.mandate_inactive');
    }
  });

  it('price raise without re-consent is refused in code', () => {
    try {
      assertMandateTermsUnchanged({ amount: parseAmount('10'), ceiling: null }, { amount: parseAmount('11'), ceiling: null });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as PayError).code).toBe('pay.subscription_reconsent_required');
    }
  });

  it('dunning is bounded then stalls — not an infinite retry invent', () => {
    expect(mandateDunningBound()).toEqual({
      maxAttemptsPerCycle: MAX_ATTEMPTS_PER_CYCLE,
      then: 'stall_named',
    });
    expect(MAX_ATTEMPTS_PER_CYCLE).toBeGreaterThan(0);
    expect(MAX_ATTEMPTS_PER_CYCLE).toBeLessThanOrEqual(5);
  });
});

describe('pre-charge notify — refuse invent (§13 gap)', () => {
  it('names the absent socket and forbids invent', () => {
    const gap = preChargeNotifyGap();
    expect(gap.status).toBe('absent');
    expect(gap.socket).toBe(PRECHARGE_NOTIFY_SOCKET);
    expect(gap.inventForbidden).toBe(true);
    expect(PRECHARGE_NOTIFY_SOCKET).toBe('socket.pay-precharge-notify');
  });

  it('does not expose a notifyBeforeCharge or invoice_upcoming invent helper', async () => {
    const mod = await import('./mandate-product.js');
    const keys = Object.keys(mod);
    expect(keys).not.toContain('notifyBeforeCharge');
    expect(keys).not.toContain('invoiceUpcoming');
    expect(keys).not.toContain('preChargeNotify');
  });
});
