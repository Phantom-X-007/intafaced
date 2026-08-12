import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRECHARGE_NOTIFY_SOCKET, preChargeNotifyGap } from './subscriptions/mandate-product.js';

/**
 * SPEC §4: "Every charge is notified before it lands, not after."
 *
 * Honest residual: the due runner acknowledges `socket.pay-precharge-notify`
 * before openInvoice with `notified: false`. Merchant webhooks fire on payment
 * events *after* money-path work. Never invent a silent upcoming delivery.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** Drop block + line comments so residual docs in headers cannot trip the pin. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('pre-charge notify ? honest absent', () => {
  it('names §13 socket.pay-precharge-notify and forbids invent', () => {
    expect(preChargeNotifyGap().socket).toBe(PRECHARGE_NOTIFY_SOCKET);
    expect(preChargeNotifyGap().status).toBe('absent');
    expect(preChargeNotifyGap().inventForbidden).toBe(true);
    expect(preChargeNotifyGap().notified).toBe(false);
  });

  it('subscription fire path acknowledges the gap then opens invoice ? no invent delivery', () => {
    const fire = stripComments(readFileSync(join(here, 'subscriptions/subscription-service.ts'), 'utf8'));
    expect(fire).toMatch(/acknowledgePreChargeNotifyBeforeCharge/);
    expect(fire).toMatch(/mandateChargeDisposition/);
    expect(fire).toMatch(/openInvoice/);
    // Invent-shaped call sites only. Do not match substrings inside
    // acknowledgePreChargeNotifyBeforeCharge.
    expect(fire).not.toMatch(/merchantWebhook\s*\(/);
    expect(fire).not.toMatch(/invoice_upcoming/i);
    expect(fire).not.toMatch(/(?<![A-Za-z])notifyBeforeCharge\s*\(/i);
    expect(fire).not.toMatch(/\.enqueue\s*\(/);
    expect(fire).not.toMatch(/notified:\s*true/);
  });

  it('index openInvoice wiring has no pre-notify invent step', () => {
    const index = stripComments(readFileSync(join(here, 'index.ts'), 'utf8'));
    // Capture watch is post-payment; must not be sold as pre-charge.
    expect(index).toMatch(/markExecutionSettledForPayment/);
    expect(index).not.toMatch(/subscription\.invoice_upcoming|notifyBeforeCharge/i);
  });
});
