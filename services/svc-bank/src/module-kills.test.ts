import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount } from '@intafaced/ledger-client';
import { LoanService } from './loans/loan-service.js';
import { fixedPriceSource } from './loans/prices.js';
import { CardService } from './cards/card-service.js';
import { cardSim } from './cards/issuer.js';

/**
 * Unit card — FLAG_REGISTRY bank.loans / bank.cards true module kills (wave 13 L03)
 *
 * 1. Promise: Engine A Done bar — true kills or honest NOT_ENFORCED
 * 2. Break: flags were NOT_ENFORCED; console paint ≠ stop
 * 3. Done bar: BANK_LOANS_ENABLED / BANK_CARDS_ENABLED refuse open/issue with named codes
 * 4. Class P (kill switches; no money moved)
 * 5. Paths: packages/config flags + services/svc-bank
 * 6. RED: this suite
 * 7. Collision: claim-check vs Denon open — no bank paths
 */

describe('bank module kills (FLAG_REGISTRY service-env)', () => {
  it('loan open refuses when moduleEnabled is false — before any ledger post', async () => {
    const ledger = new MemoryLedger();
    const loans = new LoanService({} as never, ledger, {
      priceSource: fixedPriceSource({ BTC: { price: '50000', quality: 'mid' } }),
      moduleEnabled: false,
    });
    await expect(
      loans.open({
        productId: '00000000-0000-4000-8000-000000000099',
        userId: '11111111-1111-4111-8111-111111111111',
        collateralAmount: parseAmount('1'),
        principal: parseAmount('100'),
      }),
    ).rejects.toMatchObject({ code: 'bank.loans_disabled' });
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('card issue refuses when moduleEnabled is false — before issuer / ledger', async () => {
    const ledger = new MemoryLedger();
    const cards = new CardService({} as never, ledger, {
      issuer: cardSim(),
      moduleEnabled: false,
    });
    await expect(
      cards.issue({
        cardId: '00000000-0000-4000-8000-000000000088',
        userId: '11111111-1111-4111-8111-111111111111',
        assetId: 'USDT',
        perAuthorizationLimit: parseAmount('100'),
      }),
    ).rejects.toMatchObject({ code: 'bank.cards_disabled' });
    expect(ledger.reconcile()).toEqual({ ok: true });
  });
});
