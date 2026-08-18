import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PayError } from '../payment-service.js';
import {
  CARD_MANDATE_CHARGE_SOCKET,
  MANDATE_PATH_MATRIX,
  assertCardMandateCannotOpenMoney,
  mandateChargeDisposition,
  pathOpensMoney,
  subscriptionsProductPosture,
} from './mandate-product.js';

/**
 * pay.subscriptions pin — crypto recurring is invoice-and-watch.
 * Never invent an on-chain pull. Card mandate stays refuse-closed.
 */

const here = dirname(fileURLToPath(import.meta.url));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('crypto recurring stays invoice-and-watch', () => {
  it('product posture names invoice-and-watch, not pull', () => {
    const p = subscriptionsProductPosture();
    expect(p.crypto).toEqual({
      status: 'product_complete',
      charge: 'open_crypto_invoice',
      model: 'invoice-and-watch',
    });
    expect(p.crypto.model).not.toMatch(/pull|approve|allowance/i);
    expect(p.crypto.charge).not.toBe('pull');
  });

  it('crypto_invoice is the only path that opens money, and it opens an invoice', () => {
    expect(pathOpensMoney('crypto_invoice')).toBe(true);
    expect(mandateChargeDisposition('crypto_invoice')).toEqual({ kind: 'open_crypto_invoice' });
    expect(MANDATE_PATH_MATRIX.filter((r) => r.opensMoney).map((r) => r.path)).toEqual(['crypto_invoice']);
    expect(MANDATE_PATH_MATRIX.find((r) => r.path === 'crypto_invoice')!.posture).toMatch(/invoice-and-watch/);
    expect(MANDATE_PATH_MATRIX.find((r) => r.path === 'crypto_invoice')!.posture).not.toMatch(/pull/);
  });

  it('invented pull names refuse — they do not silently open a crypto invoice', () => {
    for (const invented of ['pull', 'crypto_pull', 'onchain_pull', 'approve', 'allowance'] as const) {
      expect(() => mandateChargeDisposition(invented)).toThrow(PayError);
      expect(() => pathOpensMoney(invented)).toThrow(PayError);
    }
  });
});

describe('card mandate path stays refuse', () => {
  it('card and card_mandate refuse pay.mandate_rail_absent', () => {
    for (const path of ['card', 'card_mandate'] as const) {
      expect(pathOpensMoney(path)).toBe(false);
      expect(mandateChargeDisposition(path)).toEqual({
        kind: 'refuse',
        code: 'pay.mandate_rail_absent',
        socket: CARD_MANDATE_CHARGE_SOCKET,
      });
      expect(() => assertCardMandateCannotOpenMoney(path)).not.toThrow();
    }
  });
});

describe('fire path never invents pull', () => {
  it('crypto arm calls openInvoice only; no pull / approve / charge-against-mandate', () => {
    const fire = stripComments(readFileSync(join(here, 'subscription-service.ts'), 'utf8'));
    const product = stripComments(readFileSync(join(here, 'mandate-product.ts'), 'utf8'));

    expect(fire).toMatch(/mandateChargeDisposition\s*\(\s*sub\.path\s*\)/);
    expect(fire).toMatch(/this\.openInvoice\s*\(/);
    expect(fire).toMatch(/recordPreChargeNotifyAttempt/);
    expect(fire).toMatch(/assertPrechargeNotifyUnpublished\(notify\)/);
    expect(fire).toMatch(/notifyStatus:\s*notify\.notifyStatus/);

    const assertAt = fire.indexOf('assertPrechargeNotifyUnpublished(notify)');
    const openCallAt = fire.indexOf('this.openInvoice({');
    expect(assertAt).toBeGreaterThan(-1);
    expect(openCallAt).toBeGreaterThan(assertAt);

    for (const src of [fire, product]) {
      expect(src).not.toMatch(/chargeAgainstMandate|chargeMandate|pullMandate|cryptoPull|onchainPull/);
      expect(src).not.toMatch(/\bapprove\s*\(/);
    }

    const openAt = fire.indexOf('this.openInvoice(');
    const cryptoArm = fire.slice(fire.indexOf("disposition.kind === 'refuse'"), openAt);
    expect(cryptoArm).not.toMatch(/openInvoice\s*\(/);
    expect(cryptoArm).toMatch(/disposition\.code/);
  });
});
