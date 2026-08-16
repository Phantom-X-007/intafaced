import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PayError } from '../payment-service.js';
import {
  PRECHARGE_NOTIFY_UNPUBLISHED,
  assertPrechargeNotifyUnpublished,
  mandateChargeDisposition,
  pathOpensMoney,
  preChargeNotifyGap,
} from './mandate-product.js';

/**
 * D26-P1-P6 — unpublished pre-charge notify is named. Invent that still
 * charges/pulls, or pretends the payer was notified, must fail this suite.
 */

const here = dirname(fileURLToPath(import.meta.url));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('pre-charge notify unpublished — named, never pretend', () => {
  it('gap code is pay.precharge_notify_unpublished and notified is false', () => {
    const gap = preChargeNotifyGap();
    expect(gap.code).toBe(PRECHARGE_NOTIFY_UNPUBLISHED);
    expect(gap.notified).toBe(false);
    expect(() => assertPrechargeNotifyUnpublished(gap)).not.toThrow();
  });

  it('invented notified:true refuses the named code', () => {
    expect(() =>
      assertPrechargeNotifyUnpublished({
        notified: true,
        status: 'absent',
        code: PRECHARGE_NOTIFY_UNPUBLISHED,
      }),
    ).toThrow(PayError);
    try {
      assertPrechargeNotifyUnpublished({ notified: true, status: 'absent', code: PRECHARGE_NOTIFY_UNPUBLISHED });
    } catch (e) {
      expect((e as PayError).code).toBe('pay.precharge_notify_unpublished');
    }
  });

  it('card pull stays closed — invent charge-against-mandate cannot open money', () => {
    expect(pathOpensMoney('card')).toBe(false);
    expect(mandateChargeDisposition('card').kind).toBe('refuse');
    if (mandateChargeDisposition('card').kind === 'refuse') {
      expect(mandateChargeDisposition('card').code).toBe('pay.mandate_rail_absent');
    }
  });

  it('fire names the gap before openInvoice and never writes notified:true', () => {
    const fire = stripComments(readFileSync(join(here, 'subscription-service.ts'), 'utf8'));
    const assertAt = fire.indexOf('assertPrechargeNotifyUnpublished');
    const openCallAt = fire.indexOf('this.openInvoice({');
    expect(assertAt).toBeGreaterThan(-1);
    expect(openCallAt).toBeGreaterThan(assertAt);
    expect(fire).toMatch(/noticeCode:\s*notify\.code/);
    expect(fire).not.toMatch(/notified:\s*true/);
    expect(fire).not.toMatch(/chargeAgainstMandate|pullMandate/);
  });
});
