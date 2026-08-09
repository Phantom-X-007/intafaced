import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Wave 6 honesty pins — promises that are true-as-gap, not true-as-product.
 * Each test fails when someone "quietly" wires or invents the missing half.
 */

const here = dirname(fileURLToPath(import.meta.url));
const paymentService = readFileSync(join(here, 'payment-service.ts'), 'utf8');
const railAdapter = readFileSync(join(here, 'rails/rail-adapter.ts'), 'utf8');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('W6 honesty residuals', () => {
  it('assertMerchantActive does not gate on kybStatus (KYB money gate still residual)', () => {
    // SPEC/harvest: live money must eventually require approved KYB — tip still
    // refuses only merchant.status. Pin the gate body so a silent kyb read is
    // deliberate, not accidental.
    const m = paymentService.match(/private assertMerchantActive\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(m, 'assertMerchantActive missing').toBeTruthy();
    const captured = m?.[1];
    expect(captured, 'assertMerchantActive body missing').toEqual(expect.any(String));
    const body = stripComments(captured as string);
    expect(body).toMatch(/merchant\.status/);
    expect(body).not.toMatch(/kybStatus|kyb_status|pay\.kyb_required/);
  });

  it('applyWebhook has no dispute.* or voided cases — rail types exist, status never moves', () => {
    // RailEventType names dispute/voided; applyWebhook must not silently pretend
    // they transition money status until Nitro Class M / residual ship.
    expect(railAdapter).toMatch(/dispute\.|'voided'|\"voided\"/);
    const apply = paymentService.match(/async applyWebhook\([\s\S]*?\n  \}/);
    expect(apply, 'applyWebhook missing').toBeTruthy();
    const applySrc = apply?.[0];
    expect(applySrc, 'applyWebhook source missing').toEqual(expect.any(String));
    const body = stripComments(applySrc as string);
    expect(body).not.toMatch(/case\s+['\"]dispute\./);
    expect(body).not.toMatch(/case\s+['\"]voided['\"]/);
    // Still records unsolicited refunds without auto-moving money.
    expect(body).toMatch(/case\s+['\"]refunded['\"]/);
  });

  it('chargeback recipes stay uncalled from payment-service (Class M park)', () => {
    const body = stripComments(paymentService);
    expect(body).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
  });
});
