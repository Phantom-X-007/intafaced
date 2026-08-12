import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRECHARGE_NOTIFY_SOCKET, preChargeNotifyGap } from './subscriptions/mandate-product.js';

/**
 * SPEC §4: "Every charge is notified before it lands, not after."
 *
 * Honest residual: the due runner opens invoices without a pre-charge notify
 * hook. Merchant webhooks fire on payment events *after* money-path work.
 * Gap is named on §13 as `socket.pay-precharge-notify` — never invent a hook.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** Drop block + line comments so residual docs in headers cannot trip the pin. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('pre-charge notify — honest absent', () => {
  it('names §13 socket.pay-precharge-notify and forbids invent', () => {
    expect(preChargeNotifyGap().socket).toBe(PRECHARGE_NOTIFY_SOCKET);
    expect(preChargeNotifyGap().status).toBe('absent');
    expect(preChargeNotifyGap().inventForbidden).toBe(true);
  });

  it('subscription fire path does not call merchant webhooks or notify clients', () => {
    const fire = stripComments(readFileSync(join(here, 'subscriptions/subscription-service.ts'), 'utf8'));
    // Concrete call sites only — not residual prose in headers.
    expect(fire).not.toMatch(/merchantWebhook|notifyBeforeCharge|invoice_upcoming|preChargeNotify/i);
    expect(fire).not.toMatch(/\.enqueue\s*\(/);
    // Still opens invoice via openInvoice — that is the money path, not notify.
    expect(fire).toMatch(/openInvoice|mandateChargeDisposition/);
  });

  it('index openInvoice wiring has no pre-notify step', () => {
    const index = stripComments(readFileSync(join(here, 'index.ts'), 'utf8'));
    // Capture watch is post-payment; must not be sold as pre-charge.
    expect(index).toMatch(/markExecutionSettledForPayment/);
    expect(index).not.toMatch(/subscription\.invoice_upcoming|notifyBeforeCharge/i);
  });
});
